package com.thors;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.thors.integration.otp.OtpSender;
import com.thors.module.account.repository.AccountRepository;
import com.thors.module.account.repository.PasswordChangeRequirementRepository;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/**
 * Tài khoản do Admin / Owner tạo: xác minh OTP xong, đăng nhập lần đầu bị chặn mọi API cho tới khi đổi
 * mật khẩu (migration 2026-11-18_password_change_required.sql).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(FirstLoginPasswordChangeTest.Config.class)
class FirstLoginPasswordChangeTest {
  @TestConfiguration
  static class Config {
    @Bean
    @Primary
    Sender testSender() {
      return new Sender();
    }

    /** H2 không khớp information_schema của MySQL, nên giả lập "đã chạy migration". */
    @Bean
    @Primary
    PasswordChangeRequirementRepository migratedPasswordChanges(JdbcTemplate db) {
      return new PasswordChangeRequirementRepository(db) {
        @Override
        public boolean ready() {
          return true;
        }
      };
    }
  }

  static class Sender implements OtpSender {
    final Map<String, String> codes = new ConcurrentHashMap<>();

    public void send(String channel, String destination, String code, int seconds) {
      codes.put(destination, code);
    }

    public boolean available(String channel) {
      return "EMAIL".equals(channel);
    }
  }

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired AccountRepository users;
  @Autowired JdbcTemplate db;
  @Autowired PasswordEncoder passwords;
  @Autowired Sender sender;

  final String adminPassword = "Admin-password-123";
  final String issuedPassword = "Issued-password-123";
  final String ownPassword = "My-own-password-456";

  @BeforeEach
  void clean() {
    // Không đặt khóa ngoại để test-schema.sql của các test khác vẫn DROP được bảng user.
    db.execute("CREATE TABLE IF NOT EXISTS user_password_change_required ("
            + "user_id INT PRIMARY KEY, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.update("DELETE FROM user_password_change_required");
    db.update("DELETE FROM audit_log");
    db.update("DELETE FROM `user`");
    sender.codes.clear();
  }

  MockHttpServletResponse post(String path, Object body, MockHttpSession s) throws Exception {
    return mvc.perform(MockMvcRequestBuilders.post(path)
                    .session(s)
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(body)))
            .andReturn()
            .getResponse();
  }

  MockHttpServletResponse get(String path, MockHttpSession s) throws Exception {
    return mvc.perform(MockMvcRequestBuilders.get(path).session(s)).andReturn().getResponse();
  }

  JsonNode body(MockHttpServletResponse r) throws Exception {
    return json.readTree(r.getContentAsString());
  }

  JsonNode login(String email, String password, MockHttpSession s) throws Exception {
    var r = post("/api/auth/login", Map.of("identifier", email, "password", password), s);
    assertEquals(200, r.getStatus(), r.getContentAsString());
    return body(r);
  }

  @Test
  void accountCreatedByAdminMustChangePasswordAfterFirstLogin() throws Exception {
    users.create("ADMIN", "Admin", passwords.encode(adminPassword), "admin@example.com", null,
            "ACTIVE", null, null, true);
    var admin = new MockHttpSession();
    assertFalse(login("admin@example.com", adminPassword, admin).get("passwordChangeRequired").asBoolean());

    // 1. Admin tạo tài khoản Owner
    var created = post("/api/accounts", Map.of(
            "role", "OWNER", "fullName", "Chu Shop", "email", "owner@example.com",
            "password", issuedPassword, "confirmPassword", issuedPassword), admin);
    assertEquals(200, created.getStatus(), created.getContentAsString());
    assertEquals("owner@example.com", body(created).get("email").asText());
    assertTrue(body(created).has("mailSent"));

    // 2. Đăng nhập lần đầu → xác minh OTP qua email
    var owner = new MockHttpSession();
    assertTrue(login("owner@example.com", issuedPassword, owner).get("verificationRequired").asBoolean());
    assertEquals(200, post("/api/auth/activation",
            Map.of("identifier", "owner@example.com", "password", issuedPassword), owner).getStatus());
    assertEquals(200, post("/api/auth/otp/verify",
            Map.of("code", sender.codes.get("owner@example.com")), owner).getStatus());

    // 3. Đăng nhập lại → bắt đổi mật khẩu, mọi API khác bị chặn
    var first = login("owner@example.com", issuedPassword, owner);
    assertTrue(first.get("passwordChangeRequired").asBoolean());
    assertTrue(first.get("account").get("passwordChangeRequired").asBoolean());

    var blocked = get("/api/accounts/profile", owner);
    assertEquals(403, blocked.getStatus());
    assertEquals("PASSWORD_CHANGE_REQUIRED", body(blocked).get("code").asText());

    var me = get("/api/auth/me", owner);
    assertEquals(200, me.getStatus());
    assertTrue(body(me).get("passwordChangeRequired").asBoolean());

    // 4. Không được "đổi" sang đúng mật khẩu cũ
    var same = post("/api/auth/change-password", Map.of(
            "currentPassword", issuedPassword, "password", issuedPassword,
            "confirmPassword", issuedPassword), owner);
    assertEquals(400, same.getStatus());
    assertEquals("PASSWORD_SAME", body(same).get("code").asText());

    // 5. Đổi mật khẩu thành công → bị đăng xuất, cờ được gỡ
    var changed = post("/api/auth/change-password", Map.of(
            "currentPassword", issuedPassword, "password", ownPassword,
            "confirmPassword", ownPassword), owner);
    assertEquals(200, changed.getStatus(), changed.getContentAsString());

    // 6. Đăng nhập bằng mật khẩu mới → dùng hệ thống bình thường
    var again = new MockHttpSession();
    assertFalse(login("owner@example.com", ownPassword, again).get("passwordChangeRequired").asBoolean());
    assertEquals(200, get("/api/accounts/profile", again).getStatus());
  }

  @Test
  void selfRegisteredCustomerIsNeverForcedToChangePassword() throws Exception {
    var s = new MockHttpSession();
    assertEquals(200, post("/api/auth/register", Map.of(
            "fullName", "Khach", "identifier", "customer@example.com",
            "password", ownPassword, "confirmPassword", ownPassword), s).getStatus());
    assertEquals(200, post("/api/auth/otp/verify",
            Map.of("code", sender.codes.get("customer@example.com")), s).getStatus());

    var session = new MockHttpSession();
    assertFalse(login("customer@example.com", ownPassword, session).get("passwordChangeRequired").asBoolean());
    assertEquals(200, get("/api/accounts/profile", session).getStatus());
  }
}
