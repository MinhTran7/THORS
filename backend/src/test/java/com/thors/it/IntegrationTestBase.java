package com.thors.it;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import com.cloudinary.Cloudinary;
import com.cloudinary.Uploader;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.thors.integration.otp.OtpSender;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AccountRepository;
import com.thors.module.account.repository.PasswordChangeRequirementRepository;
import com.thors.module.order.delivery.GhnClient;
import com.thors.module.order.repository.DeliveryProofRepository;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.jdbc.datasource.DelegatingDataSource;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/**
 * Nền chung cho các integration test của Report-5.2 (tab Account và Order): chạy cả ứng dụng Spring với
 * H2 in-memory (profile test), mọi dịch vụ ngoài đều là đồ giả:
 *
 * <ul>
 *   <li>Mail server: {@link JavaMailSender} giả (MockitoBean) để kiểm tra mail đã được gửi.
 *   <li>OTP: {@link RecordingSender} ghi lại mã thay vì gửi email.
 *   <li>Cloudinary: {@link Uploader} giả, trả URL dạng https://res.cloudinary.com/test-cloud/...
 *   <li>GHN API: {@link GhnClient} giả (MockitoBean).
 * </ul>
 *
 * Các thuộc tính quan trọng được đặt cứng ở đây (ưu tiên cao nhất) để local.properties trên máy dev không
 * bao giờ làm test chạm vào database online chung, SMTP, Cloudinary hay GHN thật.
 */
@SpringBootTest(
        properties = {
            "spring.datasource.url=jdbc:h2:mem:thors_test;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE;NON_KEYWORDS=USER;LOCK_TIMEOUT=15000",
            "spring.datasource.username=sa",
            "spring.datasource.password=",
            "spring.sql.init.mode=always",
            "spring.sql.init.schema-locations=classpath:test-schema.sql",
            "thors.delivery.email-enabled=true",
            "thors.delivery.email-from=no-reply@thors.test",
            "thors.google.enabled=false",
            "thors.facebook.enabled=false",
            "FACEBOOK_ENABLED=false",
            "thors.bootstrap.enabled=false",
            "thors.payos.enabled=false",
            "thors.image-search.enabled=false",
            "thors.ai.gemini-api-key=",
            "cloudinary.cloud-name=test-cloud",
            "cloudinary.api-key=test-key",
            "cloudinary.api-secret=test-secret",
            "thors.ghn.token=test-token",
            "thors.ghn.shop-id=1",
            "thors.ghn.webhook-secret=" + IntegrationTestBase.GHN_WEBHOOK_KEY,
            "thors.ghn.poll-enabled=true",
            "thors.ghn.poll-interval-ms=3600000"
        })
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(IntegrationTestBase.Fakes.class)
@Sql(scripts = "classpath:it-account-order-schema.sql")
abstract class IntegrationTestBase {
    static final String GHN_WEBHOOK_KEY = "it-ghn-webhook-key";
    static final String PASSWORD = "Strong-password-123";

    @TestConfiguration
    static class Fakes {
        @Bean
        @Primary
        RecordingSender itOtpSender() {
            return new RecordingSender();
        }

        @Bean
        Uploader itCloudinaryUploader() {
            return Mockito.mock(Uploader.class);
        }

        /** Cloudinary thật về cấu hình (cloud test-cloud) nhưng uploader() là đồ giả, không gọi mạng. */
        @Bean
        @Primary
        Cloudinary itCloudinary(Uploader uploader) {
            return new Cloudinary(
                    Map.of("cloud_name", "test-cloud", "api_key", "test-key", "api_secret", "test-secret", "secure", true)) {
                @Override
                public Uploader uploader() {
                    return uploader;
                }
            };
        }

        /** H2 không khớp information_schema của MySQL: giả lập "đã chạy migration" 2026-11-18. */
        @Bean
        @Primary
        PasswordChangeRequirementRepository itPasswordChanges(JdbcTemplate db) {
            return new PasswordChangeRequirementRepository(db) {
                @Override
                public boolean ready() {
                    return true;
                }
            };
        }

        /**
         * H2 (kể cả MODE=MySQL) không có hàm IF(cond, a, b) của MySQL mà OrderRepository dùng khi cập nhật
         * trạng thái giao hàng. Bọc DataSource để đổi IF( thành CASEWHEN( (hàm tương đương của H2) trước khi
         * gửi câu SQL; không đổi gì trong src/main.
         */
        @Bean
        static BeanPostProcessor mysqlIfOnH2() {
            return new BeanPostProcessor() {
                @Override
                public Object postProcessAfterInitialization(Object bean, String name) {
                    return bean instanceof DataSource ds && !(bean instanceof MysqlIfDataSource)
                            ? new MysqlIfDataSource(ds)
                            : bean;
                }
            };
        }

        /** Giả lập "đã chạy migration order_delivery_proof" (IT-ORD-07 tiền điều kiện). */
        @Bean
        @Primary
        DeliveryProofRepository itDeliveryProofs(JdbcTemplate db) {
            return new DeliveryProofRepository(db) {
                @Override
                public boolean ready() {
                    return true;
                }
            };
        }
    }

    /** DataSource đổi IF( (MySQL) thành CASEWHEN( (H2) trong mọi câu SQL. */
    static class MysqlIfDataSource extends DelegatingDataSource {
        private static final Pattern MYSQL_IF = Pattern.compile("(?<![A-Za-z0-9_])IF\\(");

        MysqlIfDataSource(DataSource target) {
            super(target);
        }

        static Object[] rewrite(Object[] args) {
            if (args != null && args.length > 0 && args[0] instanceof String sql)
                args[0] = MYSQL_IF.matcher(sql).replaceAll("CASEWHEN(");
            return args;
        }

        static Object invoke(Object target, Method m, Object[] args) throws Throwable {
            try {
                return m.invoke(target, args);
            } catch (InvocationTargetException e) {
                throw e.getCause();
            }
        }

        static Statement statement(Statement target) {
            return (Statement)
                    Proxy.newProxyInstance(
                            MysqlIfDataSource.class.getClassLoader(),
                            new Class<?>[] {Statement.class},
                            (p, m, args) -> invoke(target, m, m.getName().startsWith("execute") || m.getName().equals("addBatch")
                                    ? rewrite(args) : args));
        }

        static Connection connection(Connection target) {
            return (Connection)
                    Proxy.newProxyInstance(
                            MysqlIfDataSource.class.getClassLoader(),
                            new Class<?>[] {Connection.class},
                            (p, m, args) -> {
                                String n = m.getName();
                                if (n.equals("prepareStatement") || n.equals("prepareCall") || n.equals("nativeSQL"))
                                    return invoke(target, m, rewrite(args));
                                Object result = invoke(target, m, args);
                                return n.equals("createStatement") ? statement((Statement) result) : result;
                            });
        }

        @Override
        public Connection getConnection() throws SQLException {
            return connection(super.getConnection());
        }

        @Override
        public Connection getConnection(String username, String password) throws SQLException {
            return connection(super.getConnection(username, password));
        }
    }

    static class RecordingSender implements OtpSender {
        final Map<String, String> codes = new ConcurrentHashMap<>();

        public void send(String channel, String destination, String code, int seconds) {
            codes.put(destination, code);
        }

        public boolean available(String channel) {
            return "EMAIL".equals(channel);
        }
    }

    @MockitoBean JavaMailSender mailSender;
    @MockitoBean GhnClient ghn;

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate db;
    @Autowired AccountRepository users;
    @Autowired PasswordEncoder passwords;
    @Autowired RecordingSender otpSender;
    @Autowired Uploader uploader;

    @BeforeEach
    void resetDatabaseAndFakes() throws Exception {
        for (String table :
                List.of(
                        "user_notification",
                        "notification",
                        "order_delivery_proof",
                        "order_item",
                        "orders",
                        "return_request",
                        "product_image",
                        "product_detail",
                        "user_password_change_required",
                        "audit_log",
                        "`user`")) db.update("DELETE FROM " + table);
        otpSender.codes.clear();
        Mockito.reset(uploader);
        // Cloudinary giả: trả secure_url theo đúng folder/public_id backend yêu cầu
        Mockito.when(uploader.upload(Mockito.any(), Mockito.anyMap()))
                .thenAnswer(
                        inv -> {
                            Map<?, ?> o = inv.getArgument(1);
                            String id = o.get("folder") + "/" + o.get("public_id");
                            return Map.of(
                                    "secure_url",
                                    "https://res.cloudinary.com/test-cloud/image/upload/v1700000000/" + id + ".png",
                                    "public_id",
                                    id);
                        });
        Mockito.when(uploader.destroy(Mockito.anyString(), Mockito.anyMap())).thenReturn(Map.of("result", "ok"));
    }

    // ------------------------------------------------------------------ dữ liệu

    /** Tài khoản ACTIVE đã xác minh email, mật khẩu {@link #PASSWORD}. creator = người tạo (null = tự đăng ký). */
    Account account(String role, String name, String email, String phone, Integer creator) {
        return users.create(role, name, passwords.encode(PASSWORD), email, phone, "ACTIVE", creator, null, true);
    }

    // ------------------------------------------------------------------ HTTP

    MockHttpServletResponse send(MockHttpServletRequestBuilder request, MockHttpSession session) throws Exception {
        if (session != null) request.session(session);
        return mvc.perform(request.with(csrf())).andReturn().getResponse();
    }

    MockHttpServletResponse sendJson(MockHttpServletRequestBuilder request, Object body, MockHttpSession session)
            throws Exception {
        return send(request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)), session);
    }

    MockHttpServletResponse get(String path, MockHttpSession session) throws Exception {
        return send(MockMvcRequestBuilders.get(path), session);
    }

    MockHttpServletResponse loginResponse(String email, String password, MockHttpSession session) throws Exception {
        return sendJson(
                MockMvcRequestBuilders.post("/api/auth/login"),
                Map.of("identifier", email, "password", password),
                session);
    }

    MockHttpSession login(String email) throws Exception {
        return login(email, PASSWORD);
    }

    MockHttpSession login(String email, String password) throws Exception {
        var s = new MockHttpSession();
        var r = loginResponse(email, password, s);
        assertEquals(200, r.getStatus(), r.getContentAsString());
        return s;
    }

    JsonNode body(MockHttpServletResponse r) throws Exception {
        return json.readTree(r.getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }

    // ------------------------------------------------------------------ DB

    int count(String sql, Object... args) {
        Integer n = db.queryForObject(sql, Integer.class, args);
        return n == null ? 0 : n;
    }

    String string(String sql, Object... args) {
        return db.queryForObject(sql, String.class, args);
    }

    /** Tiêu đề các thông báo (bảng user_notification + notification) của một người, cũ trước mới sau. */
    List<String> notificationTitles(int userId) {
        return db.queryForList(
                "SELECT n.title FROM user_notification un JOIN notification n ON n.notification_id = un.notification_id"
                        + " WHERE un.user_id = ? ORDER BY un.user_notification_id",
                String.class,
                userId);
    }

    List<String> notificationMessages(int userId) {
        return db.queryForList(
                "SELECT n.message FROM user_notification un JOIN notification n ON n.notification_id = un.notification_id"
                        + " WHERE un.user_id = ? ORDER BY un.user_notification_id",
                String.class,
                userId);
    }

    // ------------------------------------------------------------------ ảnh

    /** Ảnh PNG nhiễu ngẫu nhiên (khó nén), side x side pixel. */
    static byte[] png(int side) throws Exception {
        var img = new BufferedImage(side, side, BufferedImage.TYPE_INT_RGB);
        var random = new Random(42);
        for (int y = 0; y < side; y++) for (int x = 0; x < side; x++) img.setRGB(x, y, random.nextInt(0xFFFFFF));
        var out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    static byte[] jpg(int side) throws Exception {
        var img = new BufferedImage(side, side, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < side; y++) for (int x = 0; x < side; x++) img.setRGB(x, y, (x * 7 + y * 13) & 0xFFFFFF);
        var out = new ByteArrayOutputStream();
        ImageIO.write(img, "jpg", out);
        return out.toByteArray();
    }
}
