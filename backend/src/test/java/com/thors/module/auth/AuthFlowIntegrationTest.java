package com.thors.module.auth;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.thors.common.ApiException;
import com.thors.integration.otp.OtpSender;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AccountRepository;
import com.thors.module.auth.service.GoogleAccountService;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.*;
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

/**
 * Integration test cho sheet "Auth" của Report-5.2_Integration Test. Mỗi test đi theo một nhánh
 * (alt) của sequence diagram Đăng ký / Đăng nhập: request HTTP thật qua Spring Security (CSRF,
 * session) → AuthController → AuthService / OtpService → AccountRepository → DB (H2, chế độ MySQL).
 * Chỉ dịch vụ gửi email là bản giả (ghi lại mã OTP thay vì gửi qua SMTP).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(AuthFlowIntegrationTest.Mail.class)
@DisplayName("Auth Integration Test")
class AuthFlowIntegrationTest {

  @TestConfiguration
  static class Mail {
    @Bean
    @Primary
    FakeMail fakeMail() {
      return new FakeMail();
    }
  }

  /** Thay SMTP: lưu mã OTP theo email; fail = true giả lập máy chủ email lỗi. */
  static class FakeMail implements OtpSender {
    final Map<String, String> inbox = new ConcurrentHashMap<>();
    volatile boolean fail;

    public void send(String channel, String destination, String code, int seconds) {
      if (fail) throw new ApiException(503, "DELIVERY_FAILED", "Chưa gửi được OTP. Vui lòng thử lại sau.");
      inbox.put(destination, code);
    }

    public boolean available(String channel) {
      return "EMAIL".equals(channel);
    }
  }

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired JdbcTemplate db;
  @Autowired AccountRepository users;
  @Autowired PasswordEncoder passwords;
  @Autowired FakeMail mail;
  @Autowired GoogleAccountService google;

  static final String EMAIL = "minh@thors.vn";
  static final String PASSWORD = "thors123";

  @BeforeEach
  void clean() {
    db.update("DELETE FROM audit_log");
    db.update("DELETE FROM `user`");
    mail.inbox.clear();
    mail.fail = false;
  }

  // ---------- helpers ----------

  MockHttpServletResponse post(String path, Object body, MockHttpSession session) throws Exception {
    return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path)
                    .session(session).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(body)))
            .andReturn().getResponse();
  }

  MockHttpServletResponse me(MockHttpSession session) throws Exception {
    return mvc.perform(get("/api/auth/me").session(session)).andReturn().getResponse();
  }

  JsonNode body(MockHttpServletResponse r) throws Exception {
    return json.readTree(r.getContentAsString());
  }

  Map<String, Object> registration(String password, String confirm) {
    return Map.of("fullName", "Trần Minh", "identifier", EMAIL, "password", password, "confirmPassword", confirm);
  }

  MockHttpSession registered() throws Exception {
    var s = new MockHttpSession();
    assertEquals(200, post("/api/auth/register", registration(PASSWORD, PASSWORD), s).getStatus());
    return s;
  }

  Account active(String role, String email) {
    return users.create(role, "Người dùng", passwords.encode(PASSWORD), email, null, "ACTIVE", null, null, true);
  }

  MockHttpSession login(String email, String password) throws Exception {
    var s = new MockHttpSession();
    assertEquals(200, post("/api/auth/login", Map.of("identifier", email, "password", password), s).getStatus());
    return s;
  }

  int count(String sql, Object... args) {
    return db.queryForObject(sql, Integer.class, args);
  }

  int audits(String action) {
    return count("SELECT COUNT(*) FROM audit_log WHERE action_type=?", action);
  }

  String wrong(String code) {
    return code.equals("000000") ? "111111" : "000000";
  }

  // ---------- Đăng ký: giai đoạn 1 ----------

  @Nested
  @DisplayName("Đăng ký - giai đoạn 1: gửi thông tin (Register 1.1-1.23)")
  class RegisterSubmit {
    @Test
    @DisplayName("IT-AUTH-01 - đăng ký hợp lệ: tạo user chờ xác minh, lưu OTP đã băm, gửi email")
    void it01() throws Exception {
      var s = new MockHttpSession();
      var r = post("/api/auth/register", registration(PASSWORD, PASSWORD), s);

      assertEquals(200, r.getStatus());
      assertEquals("REGISTER", body(r).get("context").asText());
      assertEquals("m***@thors.vn", body(r).get("destination").asText());
      assertEquals(300, body(r).get("otpSeconds").asInt());
      var a = users.byIdentifier(EMAIL).orElseThrow();
      assertEquals("CUSTOMER", a.role());
      assertEquals("PENDING_VERIFICATION", a.status());
      assertTrue(a.passwordHash().startsWith("$2"), "mật khẩu lưu dạng BCrypt");
      String code = mail.inbox.get(EMAIL);
      assertTrue(code.matches("[0-9]{6}"));
      String stored = db.queryForObject("SELECT verification_code_hash FROM `user`", String.class);
      assertNotNull(stored);
      assertNotEquals(code, stored);
      assertEquals(1, audits("ACCOUNT_CREATE"));
      assertEquals(1, audits("OTP_SENT"));
      assertNotNull(s.getAttribute("OTP_CHALLENGE"));
    }

    @Test
    @DisplayName("IT-AUTH-02 - dữ liệu không hợp lệ: 400, không ghi DB, không gửi email")
    void it02() throws Exception {
      var mismatch = post("/api/auth/register", registration(PASSWORD, "thors124"), new MockHttpSession());
      assertEquals(400, mismatch.getStatus());
      assertEquals("PASSWORD_CONFIRM", body(mismatch).get("code").asText());

      var shortPassword = post("/api/auth/register", registration("12345", "12345"), new MockHttpSession());
      assertEquals(400, shortPassword.getStatus());
      assertEquals("PASSWORD", body(shortPassword).get("code").asText());

      var body = new HashMap<>(registration(PASSWORD, PASSWORD));
      body.put("identifier", "minh@thors");
      var badEmail = post("/api/auth/register", body, new MockHttpSession());
      assertEquals(400, badEmail.getStatus());

      assertEquals(0, count("SELECT COUNT(*) FROM `user`"));
      assertTrue(mail.inbox.isEmpty());
    }

    @Test
    @DisplayName("IT-AUTH-03 - email đã có tài khoản: 409 EMAIL_IN_USE, không tạo thêm user")
    void it03() throws Exception {
      active("CUSTOMER", EMAIL);
      var r = post("/api/auth/register", registration(PASSWORD, PASSWORD), new MockHttpSession());
      assertEquals(409, r.getStatus());
      assertEquals("EMAIL_IN_USE", body(r).get("code").asText());
      assertEquals(1, count("SELECT COUNT(*) FROM `user`"));
      assertTrue(mail.inbox.isEmpty());
    }

    @Test
    @DisplayName("IT-AUTH-04 - gửi email thất bại: 503, hủy giao dịch (không còn user, audit, mã OTP)")
    void it04() throws Exception {
      mail.fail = true;
      var r = post("/api/auth/register", registration(PASSWORD, PASSWORD), new MockHttpSession());
      assertEquals(503, r.getStatus());
      assertEquals("DELIVERY_FAILED", body(r).get("code").asText());
      assertEquals(0, count("SELECT COUNT(*) FROM `user`"));
      assertEquals(0, count("SELECT COUNT(*) FROM audit_log"));
    }

    @Test
    @DisplayName("IT-AUTH-05 - client gửi kèm role ADMIN: hệ thống vẫn tạo CUSTOMER")
    void it05() throws Exception {
      var body = new HashMap<String, Object>(registration(PASSWORD, PASSWORD));
      body.put("role", "ADMIN");
      assertEquals(200, post("/api/auth/register", body, new MockHttpSession()).getStatus());
      assertEquals("CUSTOMER", users.byIdentifier(EMAIL).orElseThrow().role());
    }

    @Test
    @DisplayName("IT-AUTH-06 - thiếu CSRF token: Spring Security chặn 403, không tạo user")
    void it06() throws Exception {
      var status = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/auth/register")
                      .contentType(MediaType.APPLICATION_JSON)
                      .content(json.writeValueAsString(registration(PASSWORD, PASSWORD))))
              .andReturn().getResponse().getStatus();
      assertEquals(403, status);
      assertEquals(0, count("SELECT COUNT(*) FROM `user`"));
    }
  }

  // ---------- Đăng ký: giai đoạn 2 ----------

  @Nested
  @DisplayName("Đăng ký - giai đoạn 2: xác minh OTP (Register 2.1-2.18)")
  class RegisterVerify {
    @Test
    @DisplayName("IT-AUTH-07 - mã đúng: kích hoạt tài khoản, xóa mã, đăng nhập được")
    void it07() throws Exception {
      var s = registered();
      var r = post("/api/auth/otp/verify", Map.of("code", mail.inbox.get(EMAIL)), s);

      assertEquals(200, r.getStatus());
      assertEquals("REGISTER", body(r).get("context").asText());
      var a = users.byIdentifier(EMAIL).orElseThrow();
      assertEquals("ACTIVE", a.status());
      assertNotNull(a.emailVerifiedAt());
      assertNull(db.queryForObject("SELECT verification_code_hash FROM `user`", String.class));
      assertEquals(1, audits("ACCOUNT_VERIFIED"));
      assertNull(s.getAttribute("OTP_CHALLENGE"));
      login(EMAIL, PASSWORD);
    }

    @Test
    @DisplayName("IT-AUTH-08 - mã sai: 400 OTP_INVALID, tăng số lần sai, tài khoản vẫn chờ xác minh")
    void it08() throws Exception {
      var s = registered();
      var r = post("/api/auth/otp/verify", Map.of("code", wrong(mail.inbox.get(EMAIL))), s);
      assertEquals(400, r.getStatus());
      assertEquals("OTP_INVALID", body(r).get("code").asText());
      assertEquals(1, count("SELECT verification_attempt_count FROM `user`"));
      assertEquals("PENDING_VERIFICATION", users.byIdentifier(EMAIL).orElseThrow().status());
    }

    @Test
    @DisplayName("IT-AUTH-09 - sai 5 lần: xóa mã, ghi OTP_LOCK, mã đúng nhập sau cũng bị từ chối")
    void it09() throws Exception {
      var s = registered();
      String correct = mail.inbox.get(EMAIL);
      MockHttpServletResponse last = null;
      for (int i = 0; i < 5; i++) last = post("/api/auth/otp/verify", Map.of("code", wrong(correct)), s);
      assertEquals("OTP_LOCKED", body(last).get("code").asText());
      assertEquals(5, count("SELECT verification_attempt_count FROM `user`"));
      assertNull(db.queryForObject("SELECT verification_code_hash FROM `user`", String.class));
      assertEquals(1, audits("OTP_LOCK"));
      assertEquals(400, post("/api/auth/otp/verify", Map.of("code", correct), s).getStatus());
      assertEquals("PENDING_VERIFICATION", users.byIdentifier(EMAIL).orElseThrow().status());
    }

    @Test
    @DisplayName("IT-AUTH-10 - mã hết hạn (quá 5 phút): 400 OTP_EXPIRED, không kích hoạt")
    void it10() throws Exception {
      var s = registered();
      db.update("UPDATE `user` SET verification_expires_at=?", LocalDateTime.now(Clock.systemUTC()).minusMinutes(1));
      var r = post("/api/auth/otp/verify", Map.of("code", mail.inbox.get(EMAIL)), s);
      assertEquals(400, r.getStatus());
      assertEquals("OTP_EXPIRED", body(r).get("code").asText());
      assertEquals("PENDING_VERIFICATION", users.byIdentifier(EMAIL).orElseThrow().status());
    }

    @Test
    @DisplayName("IT-AUTH-11 - mã đã dùng thành công: nhập lại lần 2 bị từ chối")
    void it11() throws Exception {
      var s = registered();
      String code = mail.inbox.get(EMAIL);
      assertEquals(200, post("/api/auth/otp/verify", Map.of("code", code), s).getStatus());
      assertEquals(400, post("/api/auth/otp/verify", Map.of("code", code), s).getStatus());
    }

    @Test
    @DisplayName("IT-AUTH-12 - gửi lại mã: trong 60 giây bị chặn; sau 60 giây mã cũ hết hiệu lực")
    void it12() throws Exception {
      var s = registered();
      String old = mail.inbox.get(EMAIL);
      var early = post("/api/auth/otp/resend", Map.of(), s);
      assertEquals(429, early.getStatus());
      assertEquals("OTP_COOLDOWN", body(early).get("code").asText());

      db.update("UPDATE audit_log SET performed_at=? WHERE action_type='OTP_SENT'",
              LocalDateTime.now(Clock.systemUTC()).minusSeconds(61));
      assertEquals(200, post("/api/auth/otp/resend", Map.of(), s).getStatus());
      String fresh = mail.inbox.get(EMAIL);
      assertEquals(2, audits("OTP_SENT"));
      if (!fresh.equals(old)) assertEquals(400, post("/api/auth/otp/verify", Map.of("code", old), s).getStatus());
      assertEquals(200, post("/api/auth/otp/verify", Map.of("code", fresh), s).getStatus());
    }
  }

  // ---------- Đăng nhập ----------

  @Nested
  @DisplayName("Đăng nhập bằng email và mật khẩu (Login 1.1-1.16)")
  class Login {
    @Test
    @DisplayName("IT-AUTH-13 - đúng mật khẩu: tạo phiên mới, /me trả đúng tài khoản, ghi LOGIN")
    void it13() throws Exception {
      var a = active("OWNER", EMAIL);
      var s = new MockHttpSession();
      String before = s.getId();
      var r = post("/api/auth/login", Map.of("identifier", EMAIL, "password", PASSWORD), s);

      assertEquals(200, r.getStatus());
      assertFalse(body(r).get("verificationRequired").asBoolean());
      assertNotEquals(before, s.getId(), "đổi session id sau khi đăng nhập");
      var who = me(s);
      assertEquals(200, who.getStatus());
      assertEquals(a.id(), body(who).get("id").asInt());
      assertEquals("OWNER", body(who).get("role").asText());
      assertFalse(r.getContentAsString().contains("password_hash"));
      assertEquals(1, audits("LOGIN"));
    }

    @Test
    @DisplayName("IT-AUTH-14 - sai mật khẩu / email không tồn tại: cùng 401 CREDENTIALS, ghi LOGIN_FAILURE")
    void it14() throws Exception {
      active("CUSTOMER", EMAIL);
      var wrongPassword = post("/api/auth/login", Map.of("identifier", EMAIL, "password", "sai-mat-khau"), new MockHttpSession());
      var unknown = post("/api/auth/login", Map.of("identifier", "khong-co@thors.vn", "password", "sai-mat-khau"), new MockHttpSession());

      assertEquals(401, wrongPassword.getStatus());
      assertEquals("CREDENTIALS", body(wrongPassword).get("code").asText());
      assertEquals(wrongPassword.getStatus(), unknown.getStatus());
      assertEquals(wrongPassword.getContentAsString(), unknown.getContentAsString());
      assertEquals(1, audits("LOGIN_FAILURE"));
    }

    @Test
    @DisplayName("IT-AUTH-15 - sai 5 lần liên tiếp: lần 6 dù đúng mật khẩu vẫn 429 LOGIN_COOLDOWN")
    void it15() throws Exception {
      active("CUSTOMER", EMAIL);
      for (int i = 0; i < 5; i++)
        assertEquals(401, post("/api/auth/login", Map.of("identifier", EMAIL, "password", "sai-mat-khau"), new MockHttpSession()).getStatus());
      var s = new MockHttpSession();
      var r = post("/api/auth/login", Map.of("identifier", EMAIL, "password", PASSWORD), s);
      assertEquals(429, r.getStatus());
      assertEquals("LOGIN_COOLDOWN", body(r).get("code").asText());
      assertEquals(1, audits("LOGIN_LOCK"));
      assertEquals(401, me(s).getStatus(), "không tạo phiên");
    }

    @Test
    @DisplayName("IT-AUTH-16 - tài khoản bị khóa: 403 ACCOUNT_BLOCKED, phiên cũ bị hủy")
    void it16() throws Exception {
      var a = active("CUSTOMER", EMAIL);
      var old = login(EMAIL, PASSWORD);
      users.status(a.id(), "LOCKED");
      var r = post("/api/auth/login", Map.of("identifier", EMAIL, "password", PASSWORD), new MockHttpSession());
      assertEquals(403, r.getStatus());
      assertEquals("ACCOUNT_BLOCKED", body(r).get("code").asText());
      assertEquals(401, me(old).getStatus());
    }

    @Test
    @DisplayName("IT-AUTH-17 - tài khoản chưa xác minh email: trả verificationRequired, không tạo phiên")
    void it17() throws Exception {
      registered();
      var s = new MockHttpSession();
      var r = post("/api/auth/login", Map.of("identifier", EMAIL, "password", PASSWORD), s);
      assertEquals(200, r.getStatus());
      assertTrue(body(r).get("verificationRequired").asBoolean());
      assertEquals(401, me(s).getStatus());
    }

    @Test
    @DisplayName("IT-AUTH-18 - đăng xuất: hủy phiên, gọi /me sau đó trả 401")
    void it18() throws Exception {
      active("CUSTOMER", EMAIL);
      var s = login(EMAIL, PASSWORD);
      assertEquals(200, me(s).getStatus());
      assertEquals(200, post("/api/auth/logout", Map.of(), s).getStatus());
      assertTrue(s.isInvalid());
      assertEquals(401, mvc.perform(get("/api/auth/me")).andReturn().getResponse().getStatus());
    }
  }

  // ---------- Quên / đổi mật khẩu ----------

  @Nested
  @DisplayName("Quên mật khẩu và đổi mật khẩu")
  class Passwords {
    @Test
    @DisplayName("IT-AUTH-19 - quên mật khẩu: OTP email → đặt mật khẩu mới → phiên cũ bị hủy")
    void it19() throws Exception {
      active("CUSTOMER", EMAIL);
      var old = login(EMAIL, PASSWORD);
      var s = new MockHttpSession();
      assertEquals(200, post("/api/auth/forgot-password", Map.of("identifier", EMAIL), s).getStatus());
      assertEquals(200, post("/api/auth/otp/verify", Map.of("code", mail.inbox.get(EMAIL)), s).getStatus());
      var r = post("/api/auth/reset-password", Map.of("password", "moi-123456", "confirmPassword", "moi-123456"), s);

      assertEquals(200, r.getStatus());
      assertEquals(1, audits("PASSWORD_RESET"));
      assertEquals(401, me(old).getStatus());
      assertEquals(401, post("/api/auth/login", Map.of("identifier", EMAIL, "password", PASSWORD), new MockHttpSession()).getStatus());
      login(EMAIL, "moi-123456");
    }

    @Test
    @DisplayName("IT-AUTH-20 - quên mật khẩu với email không tồn tại: cùng câu trả lời, không gửi email")
    void it20() throws Exception {
      active("CUSTOMER", EMAIL);
      var known = post("/api/auth/forgot-password", Map.of("identifier", EMAIL), new MockHttpSession());
      mail.inbox.clear();
      var missing = post("/api/auth/forgot-password", Map.of("identifier", "khong-co@thors.vn"), new MockHttpSession());
      assertEquals(known.getStatus(), missing.getStatus());
      assertEquals(known.getContentAsString(), missing.getContentAsString());
      assertTrue(mail.inbox.isEmpty());
    }

    @Test
    @DisplayName("IT-AUTH-21 - đổi mật khẩu: sai mật khẩu hiện tại 400; đúng thì đổi và phải đăng nhập lại")
    void it21() throws Exception {
      active("CUSTOMER", EMAIL);
      var s = login(EMAIL, PASSWORD);
      var bad = post("/api/auth/change-password",
              Map.of("currentPassword", "sai-mat-khau", "password", "moi-123456", "confirmPassword", "moi-123456"), s);
      assertEquals(400, bad.getStatus());
      assertEquals("PASSWORD_CURRENT", body(bad).get("code").asText());

      var ok = post("/api/auth/change-password",
              Map.of("currentPassword", PASSWORD, "password", "moi-123456", "confirmPassword", "moi-123456"), s);
      assertEquals(200, ok.getStatus());
      assertEquals(1, audits("PASSWORD_CHANGE"));
      assertEquals(401, me(s).getStatus());
      login(EMAIL, "moi-123456");
    }
  }

  // ---------- Google ----------

  @Nested
  @DisplayName("Đăng nhập Google (Login 2.x): GoogleAccountService ↔ DB")
  class Google {
    @Test
    @DisplayName("IT-AUTH-22 - email Google mới: tạo CUSTOMER đã xác minh, không có mật khẩu cục bộ")
    void it22() {
      var a = google.resolve("google-sub-1", "moi@gmail.com", "Khách Google", true, null, null);
      var saved = users.byId(a.id()).orElseThrow();
      assertEquals("CUSTOMER", saved.role());
      assertEquals("ACTIVE", saved.status());
      assertNotNull(saved.emailVerifiedAt());
      assertTrue(saved.passwordHash().startsWith("!"));
      assertEquals(saved.id(), users.byGoogle("google-sub-1").orElseThrow().id());
    }

    @Test
    @DisplayName("IT-AUTH-23 - email Google trùng tài khoản chưa liên kết: báo GOOGLE_LINK_REQUIRED, không tự liên kết")
    void it23() {
      var a = active("OWNER", EMAIL);
      var e = assertThrows(ApiException.class, () -> google.resolve("google-sub-2", EMAIL, "Owner", true, null, null));
      assertEquals("GOOGLE_LINK_REQUIRED", e.code);
      assertNull(users.byId(a.id()).orElseThrow().googleSubject());
      assertEquals("OWNER", users.byId(a.id()).orElseThrow().role());
    }
  }
}
