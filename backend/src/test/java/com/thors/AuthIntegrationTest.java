package com.thors;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.thors.common.ApiException;
import com.thors.integration.otp.OtpSender;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AccountRepository;
import com.thors.module.auth.entity.OtpChallenge;
import com.thors.module.auth.service.GoogleAccountService;
import com.thors.module.auth.service.OtpService;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(AuthIntegrationTest.TestDelivery.class)
class AuthIntegrationTest {
  @TestConfiguration
  static class TestDelivery {
    @Bean
    @Primary
    RecordingSender testSender() {
      return new RecordingSender();
    }
  }

  static class RecordingSender implements OtpSender {
    final Map<String, String> values = new ConcurrentHashMap<>();

    public void send(String channel, String destination, String code, int seconds) {
      values.put(destination, code);
    }

    public boolean available(String channel) {
      return "EMAIL".equals(channel) || "SMS".equals(channel);
    }
  }

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired AccountRepository users;
  @Autowired JdbcTemplate db;
  @Autowired PasswordEncoder passwords;
  @Autowired RecordingSender sender;
  @Autowired GoogleAccountService google;
  @Autowired OtpService otp;
  final String password = "Strong-password-123";

  @BeforeEach
  void clean() {
    db.update("DELETE FROM audit_log");
    db.update("DELETE FROM `user`");
    sender.values.clear();
  }

  Map<String, Object> registration(String channel) {
    return Map.of(
        "fullName",
        "Khách hàng",
        "email",
        "customer@example.com",
        "phone",
        "0912345678",
        "password",
        password,
        "confirmPassword",
        password,
        "channel",
        channel);
  }

  MvcResult request(String path, Object body, MockHttpSession session) throws Exception {
    return mvc.perform(
            post(path)
                .session(session)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body)))
        .andReturn();
  }

  MockHttpSession register(String channel) throws Exception {
    var session = new MockHttpSession();
    assertEquals(
        200,
        request("/api/auth/register", registration(channel), session).getResponse().getStatus());
    return session;
  }

  Account fixture(String role, String email, String phone, Integer creator) {
    var a =
        users.create(
            role, role, passwords.encode(password), email, phone, "ACTIVE", creator, null, true);
    return a;
  }

  MockHttpSession login(Account a) throws Exception {
    var s = new MockHttpSession();
    assertEquals(
        200,
        request("/api/auth/login", Map.of("identifier", a.email(), "password", password), s)
            .getResponse()
            .getStatus());
    return s;
  }

  void verify(MockHttpSession s, String destination) throws Exception {
    assertEquals(
        200,
        request("/api/auth/otp/verify", Map.of("code", sender.values.get(destination)), s)
            .getResponse()
            .getStatus());
  }

  @Test
  void customerPendingCannotUseProtectedRoutes() throws Exception {
    var s = register("EMAIL");
    var a = users.byIdentifier("customer@example.com").orElseThrow();
    assertTrue(a.pending());
    assertFalse(a.passwordHash().contains(password));
    var response =
        request("/api/auth/login", Map.of("identifier", a.email(), "password", password), s);
    assertTrue(
        json.readTree(response.getResponse().getContentAsString())
            .get("verificationRequired")
            .asBoolean());
    mvc.perform(get("/api/accounts").session(s)).andExpect(status().isUnauthorized());
    verify(s, a.email());
    a = users.byId(a.id()).orElseThrow();
    assertTrue(a.active());
    assertNotNull(a.emailVerifiedAt());
    assertNull(a.phoneVerifiedAt());
  }

  @Test
  void smsVerificationAndBothIdentifierLogins() throws Exception {
    var s = register("SMS");
    verify(s, "+84912345678");
    var a = users.byIdentifier("customer@example.com").orElseThrow();
    assertNotNull(a.phoneVerifiedAt());
    assertNull(a.emailVerifiedAt());
    assertEquals(
        200,
        request("/api/auth/login", Map.of("identifier", "0912345678", "password", password), s)
            .getResponse()
            .getStatus());
    assertEquals(
        200,
        request("/api/auth/login", Map.of("identifier", a.email(), "password", password), s)
            .getResponse()
            .getStatus());
  }

  @Test
  void otpUsedOnlyOnce() throws Exception {
    var s = register("EMAIL");
    String value = sender.values.get("customer@example.com");
    verify(s, "customer@example.com");
    assertEquals(
        400, request("/api/auth/otp/verify", Map.of("code", value), s).getResponse().getStatus());
  }

  @Test
  void wrongOtpCommitsAttemptCounterAndLocksAtFive() throws Exception {
    var s = register("EMAIL");
    String correct = sender.values.get("customer@example.com");
    String wrong = correct.equals("000000") ? "111111" : "000000";
    for (int i = 0; i < 5; i++)
      assertEquals(
          400, request("/api/auth/otp/verify", Map.of("code", wrong), s).getResponse().getStatus());
    assertEquals(
        5, db.queryForObject("SELECT verification_attempt_count FROM `user`", Integer.class));
    assertTrue(db.queryForObject("SELECT verification_used_at IS NOT NULL FROM `user`", Boolean.class));
    assertEquals(
        400, request("/api/auth/otp/verify", Map.of("code", correct), s).getResponse().getStatus());
  }

  @Test
  void expiredOtpCannotActivate() throws Exception {
    var s = register("EMAIL");
    db.update(
        "UPDATE `user` SET verification_expires_at=?",
        java.time.LocalDateTime.now(java.time.Clock.systemUTC()).minusMinutes(1));
    assertEquals(
        400,
        request(
                "/api/auth/otp/verify",
                Map.of("code", sender.values.get("customer@example.com")),
                s)
            .getResponse()
            .getStatus());
    assertTrue(users.byIdentifier("customer@example.com").orElseThrow().pending());
  }

  @Test
  void resendCooldownAndOldCodeInvalidation() throws Exception {
    var s = register("EMAIL");
    String old = sender.values.get("customer@example.com");
    assertEquals(429, request("/api/auth/otp/resend", Map.of(), s).getResponse().getStatus());
    db.update(
        "UPDATE `user` SET verification_sent_at=?",
        java.time.LocalDateTime.now(java.time.Clock.systemUTC()).minusSeconds(61));
    assertEquals(200, request("/api/auth/otp/resend", Map.of(), s).getResponse().getStatus());
    assertEquals(2, db.queryForObject("SELECT COUNT(*) FROM audit_log WHERE action_type='OTP_SENT'", Integer.class));
    assertNull(db.queryForObject("SELECT verification_used_at FROM `user`",java.time.LocalDateTime.class));
    verify(s, "customer@example.com");
  }

  @Test
  void duplicateNormalizedPhoneRejected() throws Exception {
    register("EMAIL");
    var b = new HashMap<>(registration("EMAIL"));
    b.put("email", "other@example.com");
    b.put("phone", "+84912345678");
    assertEquals(
        409, request("/api/auth/register", b, new MockHttpSession()).getResponse().getStatus());
  }

  @Test
  void clientCannotChooseCustomerRegistrationRole() throws Exception {
    var b = new HashMap<>(registration("EMAIL"));
    b.put("role", "ADMIN");
    assertEquals(
        200, request("/api/auth/register", b, new MockHttpSession()).getResponse().getStatus());
    assertEquals("CUSTOMER", users.byIdentifier("customer@example.com").orElseThrow().role());
  }

  @Test
  void csrfRequiredForMutation() throws Exception {
    mvc.perform(
            post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(registration("EMAIL"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void loginRotatesSessionAndLogoutEndsIt() throws Exception {
    var a = fixture("CUSTOMER", "a@example.com", null, null);
    var s = new MockHttpSession();
    String old = s.getId();
    assertEquals(
        200,
        request("/api/auth/login", Map.of("identifier", a.email(), "password", password), s)
            .getResponse()
            .getStatus());
    assertNotEquals(old, s.getId());
    mvc.perform(get("/api/auth/me").session(s)).andExpect(status().isOk());
    assertEquals(200, request("/api/auth/logout", Map.of(), s).getResponse().getStatus());
    assertTrue(s.isInvalid());
    mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
  }

  @Test
  void lockingAccountInvalidatesExistingSession() throws Exception {
    var a = fixture("CUSTOMER", "a@example.com", null, null);
    var s = login(a);
    users.status(a.id(), "LOCKED");
    mvc.perform(get("/api/auth/me").session(s)).andExpect(status().isUnauthorized());
    assertEquals(
        403,
        request(
                "/api/auth/login",
                Map.of("identifier", a.email(), "password", password),
                new MockHttpSession())
            .getResponse()
            .getStatus());
  }

  @Test
  void resetRequiresOtpAndRevokesOtherSession() throws Exception {
    var a = fixture("OWNER", "owner@example.com", null, null);
    var logged = login(a);
    var reset = new MockHttpSession();
    assertEquals(
        400,
        request(
                "/api/auth/reset-password",
                Map.of("password", "New-password-123", "confirmPassword", "New-password-123"),
                reset)
            .getResponse()
            .getStatus());
    assertEquals(
        200,
        request(
                "/api/auth/forgot-password",
                Map.of("identifier", a.email(), "channel", "EMAIL"),
                reset)
            .getResponse()
            .getStatus());
    verify(reset, a.email());
    assertEquals(
        200,
        request(
                "/api/auth/reset-password",
                Map.of("password", "New-password-123", "confirmPassword", "New-password-123"),
                reset)
            .getResponse()
            .getStatus());
    mvc.perform(get("/api/auth/me").session(logged)).andExpect(status().isUnauthorized());
    assertEquals(
        401,
        request(
                "/api/auth/login",
                Map.of("identifier", a.email(), "password", password),
                new MockHttpSession())
            .getResponse()
            .getStatus());
  }

  @Test
  void unverifiedRecoveryChannelNeverReceivesOtp() throws Exception {
    var a = fixture("CUSTOMER", "a@example.com", "+84912345678", null);
    assertEquals(
        200,
        request(
                "/api/auth/forgot-password",
                Map.of("identifier", a.email(), "channel", "SMS"),
                new MockHttpSession())
            .getResponse()
            .getStatus());
    assertTrue(sender.values.isEmpty());
  }

  @Test
  void adminCannotUsePublicPasswordReset() throws Exception {
    var a = fixture("ADMIN", "admin@example.com", null, null);
    assertEquals(
        200,
        request(
                "/api/auth/forgot-password",
                Map.of("identifier", a.email(), "channel", "EMAIL"),
                new MockHttpSession())
            .getResponse()
            .getStatus());
    assertTrue(sender.values.isEmpty());
  }

  Map<String, Object> createBody(String role, String email) {
    return Map.of(
        "role",
        role,
        "fullName",
        role,
        "email",
        email,
        "phone",
        "0987654321",
        "password",
        password,
        "confirmPassword",
        password);
  }

  @Test
  void adminCreatesOnlyOwner() throws Exception {
    var a = fixture("ADMIN", "admin@example.com", null, null);
    var s = login(a);
    assertEquals(
        403,
        request("/api/accounts", createBody("STAFF", "staff@example.com"), s)
            .getResponse()
            .getStatus());
    assertEquals(
        200,
        request("/api/accounts", createBody("OWNER", "owner@example.com"), s)
            .getResponse()
            .getStatus());
    assertTrue(users.byIdentifier("owner@example.com").orElseThrow().pending());
  }

  @Test
  void ownerCreatesOnlyStaffAndFamilyAndTheyNeedOtp() throws Exception {
    var owner = fixture("OWNER", "owner@example.com", null, null);
    var s = login(owner);
    assertEquals(
        403,
        request("/api/accounts", createBody("OWNER", "other@example.com"), s)
            .getResponse()
            .getStatus());
    assertEquals(
        200,
        request("/api/accounts", createBody("STAFF", "staff@example.com"), s)
            .getResponse()
            .getStatus());
    var staff = users.byIdentifier("staff@example.com").orElseThrow();
    var pending = new MockHttpSession();
    assertEquals(
        200,
        request(
                "/api/auth/activation",
                Map.of("identifier", staff.email(), "password", password, "channel", "EMAIL"),
                pending)
            .getResponse()
            .getStatus());
    verify(pending, staff.email());
    assertTrue(users.byId(staff.id()).orElseThrow().active());
  }

  @Test
  void ownerCannotManageOtherOwnersStaff() throws Exception {
    var owner = fixture("OWNER", "one@example.com", null, null);
    var other = fixture("OWNER", "two@example.com", null, null);
    var staff = fixture("STAFF", "staff@example.com", null, other.id());
    var s = login(owner);
    mvc.perform(
            patch("/api/accounts/" + staff.id())
                .session(s)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"Changed\",\"status\":\"LOCKED\"}"))
        .andExpect(status().isForbidden());
    assertEquals(
        403,
        request(
                "/api/accounts/" + staff.id() + "/reset-password",
                Map.of("password", password, "confirmPassword", password),
                s)
            .getResponse()
            .getStatus());
  }

  @Test
  void staffCannotManageAccounts() throws Exception {
    var a = fixture("STAFF", "staff@example.com", null, null);
    var s = login(a);
    mvc.perform(get("/api/accounts").session(s)).andExpect(status().isForbidden());
    assertEquals(
        403,
        request("/api/accounts", createBody("CUSTOMER", "other@example.com"), s)
            .getResponse()
            .getStatus());
  }

  @Test
  void cannotActivateUnverifiedAccountThroughAdminEdit() throws Exception {
    var admin = fixture("ADMIN", "admin@example.com", null, null);
    var target =
        users.create(
            "OWNER",
            "Owner",
            passwords.encode(password),
            "owner@example.com",
            null,
            "PENDING_VERIFICATION",
            admin.id(),
            null,
            false);
    mvc.perform(
            patch("/api/accounts/" + target.id())
                .session(login(admin))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"Owner\",\"status\":\"ACTIVE\"}"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void googleNewAccountIsCustomerWithNoPhoneOrLocalPassword() {
    var a = google.resolve("google-sub", "new@example.com", "Google User", true, null, null);
    assertEquals("CUSTOMER", a.role());
    assertNull(a.phone());
    assertTrue(a.passwordHash().startsWith("!"));
    assertNotNull(a.emailVerifiedAt());
  }

  @Test
  void googleExistingEmailDoesNotAutoLinkOrChangeRole() {
    var a = fixture("OWNER", "owner@example.com", null, null);
    var ex =
        assertThrows(
            ApiException.class,
            () -> google.resolve("google-sub", a.email(), "Owner", true, null, null));
    assertEquals("GOOGLE_LINK_REQUIRED", ex.code);
    assertNull(users.byId(a.id()).orElseThrow().googleSubject());
  }

  @Test
  void googleLinkedAccountKeepsRoleAndCannotBypassLock() {
    var a = fixture("STAFF", "staff@example.com", null, null);
    google.resolve("google-sub", a.email(), a.fullName(), true, a.id(), a.authVersion());
    var logged = google.resolve("google-sub", a.email(), a.fullName(), true, null, null);
    assertEquals(a.id(), logged.id());
    assertEquals("STAFF", logged.role());
    users.status(a.id(), "LOCKED");
    assertThrows(
        ApiException.class,
        () -> google.resolve("google-sub", a.email(), a.fullName(), true, null, null));
  }

  @Test
  void googleLinkRequiresSameVerifiedEmailAndCurrentSessionVersion() {
    var a = fixture("OWNER", "owner@example.com", null, null);
    assertThrows(
        ApiException.class,
        () ->
            google.resolve(
                "google-sub", "other@example.com", "Owner", true, a.id(), a.authVersion()));
    assertThrows(
        ApiException.class,
        () -> google.resolve("google-sub", a.email(), "Owner", false, a.id(), a.authVersion()));
    assertThrows(
        ApiException.class,
        () -> google.resolve("google-sub", a.email(), "Owner", true, a.id(), a.authVersion() + 1));
  }

  @Test
  void concurrentOtpVerificationHasExactlyOneWinner() throws Exception {
    var s = register("EMAIL");
    var challenge = (OtpChallenge) s.getAttribute("OTP_CHALLENGE");
    var code = sender.values.get("customer@example.com");
    var pool = Executors.newFixedThreadPool(2);
    try {
      var latch = new CountDownLatch(1);
      var task =
          (Callable<Boolean>)
              () -> {
                latch.await();
                return otp.verify(challenge, code).success();
              };
      var f1 = pool.submit(task);
      var f2 = pool.submit(task);
      latch.countDown();
      assertNotEquals(f1.get(10, TimeUnit.SECONDS), f2.get(10, TimeUnit.SECONDS));
    } finally {
      pool.shutdownNow();
    }
  }

  @Test
  void oldPhoneFormatsLoginAndSendSmsWithoutRewritingRecord() throws Exception {
    var a = fixture("CUSTOMER", "legacy@example.com", "+84912345678", null);
    db.update("UPDATE `user` SET phone='0912 345 678' WHERE user_id=?", a.id());
    var session = new MockHttpSession();
    assertEquals(200, request("/api/auth/login", Map.of("identifier", "+84912345678", "password", password), session).getResponse().getStatus());
    assertEquals(200, request("/api/auth/verify-contact", Map.of("channel", "SMS"), session).getResponse().getStatus());
    verify(session, "+84912345678");
    assertEquals("0912 345 678", users.byId(a.id()).orElseThrow().phone());
    assertNotNull(users.byId(a.id()).orElseThrow().phoneVerifiedAt());
  }

  @Test
  void existingDuplicatePhonesRequireEmailLoginRatherThanChoosingAnAccount() throws Exception {
    var a = fixture("CUSTOMER", "one@example.com", "+84912345678", null);
    var b = fixture("CUSTOMER", "two@example.com", null, null);
    db.update("UPDATE `user` SET phone='0912345678' WHERE user_id=?", b.id());
    assertEquals(409, request("/api/auth/login", Map.of("identifier", "0912345678", "password", password), new MockHttpSession()).getResponse().getStatus());
    login(a);
    login(b);
  }

  @Test
  void concurrentPhoneAllocationHasOneWinnerWithoutPhoneUniqueConstraint() throws Exception {
    var pool = Executors.newFixedThreadPool(2);
    var latch = new CountDownLatch(1);
    try {
      var one = pool.submit(() -> { latch.await(); return createPhoneWinner("one@example.com"); });
      var two = pool.submit(() -> { latch.await(); return createPhoneWinner("two@example.com"); });
      latch.countDown();
      assertNotEquals(one.get(15, TimeUnit.SECONDS), two.get(15, TimeUnit.SECONDS));
      assertEquals(1, db.queryForObject("SELECT COUNT(*) FROM `user`", Integer.class));
    } finally { pool.shutdownNow(); }
  }

  boolean createPhoneWinner(String email) {
    try {
      fixture("CUSTOMER", email, "+84912345678", null);
      return true;
    } catch (ApiException e) {
      assertEquals("PHONE_IN_USE", e.code);
      return false;
    }
  }

  @Test
  void oneOtpSlotInvalidatesPreviousPurposeAndDoesNotStorePlaintext() throws Exception {
    var a = fixture("CUSTOMER", "a@example.com", null, null);
    var old = otp.issue(a.id(), "CONTACT", "EMAIL", false);
    String oldValue = sender.values.get(a.email());
    db.update("UPDATE `user` SET verification_sent_at=? WHERE user_id=?", java.time.LocalDateTime.now(java.time.Clock.systemUTC()).minusSeconds(61), a.id());
    var current = otp.issue(a.id(), "RESET", "EMAIL", true);
    String currentValue = sender.values.get(a.email());
    assertFalse(otp.verify(old, oldValue).success());
    String stored = db.queryForObject("SELECT verification_code_hash FROM `user` WHERE user_id=?", String.class, a.id());
    assertEquals(101, stored.length());
    assertNotEquals(currentValue, stored);
    assertTrue(otp.verify(current, currentValue).success());
    assertFalse(otp.verify(current, currentValue).success());
  }

  @Test
  void hourlyOtpLimitUsesExistingAuditHistory() {
    var a = fixture("CUSTOMER", "a@example.com", null, null);
    for (int i = 0; i < 10; i++) users.audit(null, "OTP_SENT", a.id(), "CONTACT_EMAIL");
    var error = assertThrows(ApiException.class, () -> otp.issue(a.id(), "CONTACT", "EMAIL", false));
    assertEquals("OTP_LIMIT", error.code);
    assertTrue(sender.values.isEmpty());
  }

  @Test
  void lockThenUnlockStillRevokesPreviousSession() throws Exception {
    var a = fixture("CUSTOMER", "a@example.com", null, null);
    var session = login(a);
    users.status(a.id(), "LOCKED");
    users.status(a.id(), "ACTIVE");
    mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isUnauthorized());
    login(users.byId(a.id()).orElseThrow());
  }

  @Test
  void directDatabasePasswordChangeRevokesSessionWithoutExtraColumn() throws Exception {
    var a = fixture("CUSTOMER", "a@example.com", null, null);
    var session = login(a);
    db.update("UPDATE `user` SET password_hash=? WHERE user_id=?", passwords.encode("New-password-123"), a.id());
    mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isUnauthorized());
  }

  @Test
  void directDatabaseRoleChangeRevokesOldAuthority() throws Exception {
    var a = fixture("OWNER", "owner@example.com", null, null);
    var session = login(a);
    db.update("UPDATE `user` SET role_id=(SELECT role_id FROM `role` WHERE role_name='CUSTOMER') WHERE user_id=?", a.id());
    mvc.perform(get("/api/accounts").session(session)).andExpect(status().isUnauthorized());
  }

  @Test
  void managerResetRequiresActivationAndInvalidatesOldSession() throws Exception {
    var admin = fixture("ADMIN", "admin@example.com", null, null);
    var owner = fixture("OWNER", "owner@example.com", null, admin.id());
    var previous = login(owner);
    var manager = login(admin);
    assertEquals(200, request("/api/accounts/" + owner.id() + "/reset-password", Map.of("password", "New-password-123", "confirmPassword", "New-password-123"), manager).getResponse().getStatus());
    assertTrue(users.byId(owner.id()).orElseThrow().pending());
    mvc.perform(get("/api/auth/me").session(previous)).andExpect(status().isUnauthorized());
    var activate = new MockHttpSession();
    assertEquals(200, request("/api/auth/activation", Map.of("identifier", owner.email(), "password", "New-password-123", "channel", "EMAIL"), activate).getResponse().getStatus());
    verify(activate, owner.email());
    assertTrue(users.byId(owner.id()).orElseThrow().active());
  }

  @Test
  void googleLinkAndCreatorPersistInAuditWithoutAddingUserColumns() {
    var owner = fixture("OWNER", "owner@example.com", null, null);
    var staff = fixture("STAFF", "staff@example.com", null, owner.id());
    google.resolve("GoogleCaseSubject", staff.email(), staff.fullName(), true, staff.id(), staff.authVersion());
    var reloaded = new AccountRepository(db);
    assertEquals(owner.id(), reloaded.byId(staff.id()).orElseThrow().createdBy());
    assertEquals(staff.id(), reloaded.byGoogle("GoogleCaseSubject").orElseThrow().id());
    assertTrue(reloaded.byGoogle("googlecasesubject").isEmpty());
    assertEquals(1, reloaded.managed(owner).size());
    assertEquals(1, db.queryForObject("SELECT COUNT(*) FROM audit_log WHERE action_type='GOOGLE_LINK'", Integer.class));
  }

  @Test
  void addingPhoneToGoogleAccountRespectsExistingPhoneAndRequiresVerification() throws Exception {
    var original = fixture("CUSTOMER", "original@example.com", "+84912345678", null);
    var googleUser = google.resolve("new-google", "google@example.com", "Google", true, null, null);
    var session = new MockHttpSession();
    var response = new org.springframework.mock.web.MockHttpServletResponse();
    var request = new org.springframework.mock.web.MockHttpServletRequest();
    request.setSession(session);
    new com.thors.security.SessionAccess(users).login(googleUser, request, response);
    assertEquals(409, request("/api/accounts/profile/phone", Map.of("phone", "0912345678"), session).getResponse().getStatus());
    assertEquals(200, request("/api/accounts/profile/phone", Map.of("phone", "0987654321"), session).getResponse().getStatus());
    assertNull(users.byId(googleUser.id()).orElseThrow().phoneVerifiedAt());
    assertEquals(200, request("/api/auth/verify-contact", Map.of("channel", "SMS"), session).getResponse().getStatus());
    verify(session, "+84987654321");
    assertNotNull(users.byId(googleUser.id()).orElseThrow().phoneVerifiedAt());
  }
}
