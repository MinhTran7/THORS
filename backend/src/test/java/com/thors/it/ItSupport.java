package com.thors.it;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AccountRepository;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Hàm dùng chung cho các integration test trong gói com.thors.it (theo mẫu AuthIntegrationTest): tạo tài khoản,
 * đăng nhập bằng MockMvc session, gửi request kèm CSRF, đọc JSON, dọn dữ liệu H2.
 */
abstract class ItSupport {
    static final String PASSWORD = "Strong-password-123";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate db;
    @Autowired AccountRepository users;
    @Autowired PasswordEncoder passwords;

    /** H2 trong bộ nhớ (không phải DB online chung) nên xóa sạch giữa các test là an toàn. */
    void cleanAll() {
        for (String table : new String[] {
            "user_notification", "notification", "notification_mute", "chat_message", "chat_conversation",
            "chat_knowledge", "website_setting", "cart_item", "cart", "order_item", "orders", "promotion_product",
            "promotion", "product_image", "product_detail", "product", "category", "audit_log", "`user`"
        }) {
            db.update("DELETE FROM " + table);
        }
    }

    Account account(String role, String name, String email, String status) {
        return users.create(role, name, passwords.encode(PASSWORD), email, null, status, null, null, true);
    }

    MockHttpSession login(Account a) throws Exception {
        var s = new MockHttpSession();
        var r = send(post("/api/auth/login"), s, Map.of("identifier", a.email(), "password", PASSWORD));
        assertEquals(200, r.getStatus(), "Đăng nhập " + a.email() + ": " + r.getContentAsString());
        return s;
    }

    MockHttpServletResponse send(MockHttpServletRequestBuilder req, MockHttpSession s, Object body) throws Exception {
        if (s != null) req.session(s);
        req.with(csrf());
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        var r = mvc.perform(req).andReturn().getResponse();
        r.setCharacterEncoding(StandardCharsets.UTF_8.name());
        return r;
    }

    MockHttpServletResponse get(String path, MockHttpSession s) throws Exception {
        return send(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(path), s, null);
    }

    JsonNode body(MockHttpServletResponse r) throws Exception {
        return json.readTree(r.getContentAsString(StandardCharsets.UTF_8));
    }

    int count(String sql, Object... args) {
        Integer n = db.queryForObject(sql, Integer.class, args);
        return n == null ? 0 : n;
    }

    // ------------------------------------------------------------------ Dữ liệu sản phẩm

    int category(String name, Integer parentId) {
        db.update("INSERT INTO category (category_name, parent_id, status) VALUES (?, ?, 'ACTIVE')", name, parentId);
        return db.queryForObject("SELECT MAX(category_id) FROM category", Integer.class);
    }

    int product(int categoryId, String name, String description) {
        db.update("INSERT INTO product (category_id, product_name, description, status) VALUES (?, ?, ?, 'ACTIVE')",
                categoryId, name, description);
        return db.queryForObject("SELECT MAX(product_id) FROM product", Integer.class);
    }

    int variant(int productId, String size, String color, long price, int stock) {
        db.update("INSERT INTO product_detail (product_id, size, color, price, stock_quantity, online_sales_enabled, status)"
                + " VALUES (?, ?, ?, ?, ?, 1, 'ACTIVE')", productId, size, color, price, stock);
        return db.queryForObject("SELECT MAX(detail_id) FROM product_detail", Integer.class);
    }

    int image(int productId, String url) {
        db.update("INSERT INTO product_image (product_id, image_url, is_primary) VALUES (?, ?, 1)", productId, url);
        return db.queryForObject("SELECT MAX(image_id) FROM product_image", Integer.class);
    }
}
