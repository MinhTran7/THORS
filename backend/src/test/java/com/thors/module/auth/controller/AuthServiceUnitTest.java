package com.thors.module.auth.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.thors.common.ApiException;
import com.thors.integration.otp.OtpSender;
import com.thors.module.account.dto.AccountView;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AccountRepository;
import com.thors.module.account.repository.PasswordChangeRequirementRepository;
import com.thors.module.auth.dto.AuthRequests.ChangePassword;
import com.thors.module.auth.dto.AuthRequests.Login;
import com.thors.module.auth.repository.OtpRepository;
import com.thors.module.auth.service.AuthService;
import com.thors.module.auth.service.OtpService;
import com.thors.module.notification.service.NotificationPublisher;
import com.thors.module.notification.service.NotificationTypes;
import com.thors.security.SessionAccess;
import java.time.LocalDateTime;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Unit test theo sheet "Account" của Report-5.1_Unit Test (UTC-ACC-087..095): kiểm tra yêu cầu đổi mật khẩu
 * lần đầu khi đăng nhập và đổi mật khẩu. Bước đăng nhập nằm ở AuthController.login (gọi
 * AuthService.authenticate rồi passwordChanges.required) nên lớp test đặt cùng package với controller.
 */
@DisplayName("Auth - đổi mật khẩu lần đầu - Unit Test")
class AuthServiceUnitTest {
  private static final LocalDateTime CREATED = LocalDateTime.of(2026, 11, 1, 9, 0);
  private static final String OLD_HASH = "$2a$10$oldhash";
  private static final String GOOD = "Password@123";
  private static final String NEW_PASS = "NewPass@2026";

  private AccountRepository users;
  private PasswordEncoder passwords;
  private OtpRepository codes;
  private NotificationPublisher notices;
  private PasswordChangeRequirementRepository passwordChanges;
  private SessionAccess sessions;
  private AuthService authService;
  private MockHttpServletRequest req;
  private MockHttpServletResponse res;

  @BeforeEach
  void setUp() {
    users = mock(AccountRepository.class);
    passwords = mock(PasswordEncoder.class);
    when(passwords.encode(anyString())).thenAnswer(i -> "bcrypt:" + i.getArgument(0));
    codes = mock(OtpRepository.class);
    notices = mock(NotificationPublisher.class);
    passwordChanges = mock(PasswordChangeRequirementRepository.class);
    sessions = mock(SessionAccess.class);
    authService = new AuthService(users, passwords, codes, mock(OtpService.class), notices, passwordChanges);
    req = new MockHttpServletRequest();
    res = new MockHttpServletResponse();
  }

  private static Account account(int id, String role, String status, String email) {
    return new Account(id, role, "User " + id, OLD_HASH, email, null, null, null, status, CREATED, CREATED,
            null, 0, 2);
  }

  private AuthController controller(AuthService auth, PasswordChangeRequirementRepository changes) {
    return new AuthController(auth, mock(OtpService.class), users, sessions, mock(OtpSender.class), null, changes);
  }

  private static ApiException apiStatus(int status, Executable call) {
    ApiException e = assertThrows(ApiException.class, call);
    assertEquals(status, e.status);
    return e;
  }

  private static ApiException api(int status, String code, Executable call) {
    ApiException e = assertThrows(ApiException.class, call);
    assertEquals(status, e.status);
    assertEquals(code, e.code);
    return e;
  }

  private static ApiException api(int status, String code, String message, Executable call) {
    ApiException e = api(status, code, call);
    assertEquals(message, e.getMessage());
    return e;
  }

  // ================================================================== login

  @Nested
  @DisplayName("AuthService.login(Login r) - kiểm tra yêu cầu đổi mật khẩu lần đầu")
  class LoginTests {
    private AuthService auth;

    @BeforeEach
    void setUp() {
      auth = mock(AuthService.class);
    }

    @Test
    @DisplayName("UTC-ACC-087: Tài khoản do Owner cấp phải đổi mật khẩu lần đầu")
    void acc087() {
      var staff = account(30, "STAFF", "PENDING_VERIFICATION", "staff@shop.com");
      when(auth.authenticate("staff@shop.com", GOOD)).thenReturn(staff);
      when(passwordChanges.required(30)).thenReturn(true);

      Object result = controller(auth, passwordChanges).login(new Login("staff@shop.com", GOOD), req, res);

      verify(sessions).login(staff, req, res);
      verify(passwordChanges, times(1)).required(30);
      var body = (Map<?, ?>) result;
      assertEquals(true, body.get("passwordChangeRequired"));
      assertTrue(((AccountView) body.get("account")).passwordChangeRequired());
    }

    @Test
    @DisplayName("UTC-ACC-088: Tài khoản không có yêu cầu đổi mật khẩu")
    void acc088() {
      var member = account(10, "FAMILY_MEMBER", "ACTIVE", "member@shop.com");
      when(auth.authenticate("member@shop.com", "Member@2026")).thenReturn(member);
      when(passwordChanges.required(10)).thenReturn(false);

      Object result =
              controller(auth, passwordChanges).login(new Login("member@shop.com", "Member@2026"), req, res);

      var body = (Map<?, ?>) result;
      assertEquals(false, body.get("passwordChangeRequired"));
      assertFalse(((AccountView) body.get("account")).passwordChangeRequired());
    }
  }

  // ================================================================== change

  @Nested
  @DisplayName("AuthService.change(Account actor, ChangePassword r)")
  class ChangeTests {
    private final Account actor = account(30, "STAFF", "ACTIVE", "staff@shop.com");

    @BeforeEach
    void setUp() {
      when(users.lock(30)).thenReturn(actor);
      when(passwords.matches(GOOD, OLD_HASH)).thenReturn(true);
    }

    private void verifyNoPasswordChange() {
      verify(users, never()).password(anyInt(), anyString(), anyBoolean());
      verify(passwordChanges, never()).clear(anyInt());
    }

    @Test
    @DisplayName("UTC-ACC-089: Đổi mật khẩu lần đầu thành công và đăng xuất")
    void acc089() {
      when(passwords.matches(NEW_PASS, OLD_HASH)).thenReturn(false);
      when(sessions.current()).thenReturn(actor);

      Object result = controller(authService, passwordChanges)
              .change(new ChangePassword(GOOD, NEW_PASS, NEW_PASS), req, res);

      verify(users).lock(30);
      verify(passwords).matches(GOOD, OLD_HASH);
      verify(passwords).matches(NEW_PASS, OLD_HASH);
      verify(users).password(30, "bcrypt:" + NEW_PASS, false);
      verify(passwordChanges).clear(30);
      verify(codes).invalidateAll(30);
      verify(users).audit(eq(30), anyString(), eq(30), anyString());
      verify(notices).toUser(eq(30), eq(NotificationTypes.ACCOUNT_SECURITY), anyString(), anyString());
      verify(sessions).clear(req, res);
      assertNotNull(((Map<?, ?>) result).get("message"));
    }

    @Test
    @DisplayName("UTC-ACC-090: Mật khẩu xác nhận không khớp")
    void acc090() {
      api(400, "PASSWORD_CONFIRM", "Mật khẩu xác nhận không khớp.",
              () -> authService.change(actor, new ChangePassword(GOOD, NEW_PASS, "NewPass@2027")));
      verify(users, never()).lock(anyInt());
      verifyNoPasswordChange();
    }

    @Test
    @DisplayName("UTC-ACC-091: Mật khẩu hiện tại không đúng")
    void acc091() {
      when(passwords.matches("SaiMatKhau@1", OLD_HASH)).thenReturn(false);
      apiStatus(400,
              () -> authService.change(actor, new ChangePassword("SaiMatKhau@1", NEW_PASS, NEW_PASS)));
      verify(passwords, never()).encode(NEW_PASS);
      verifyNoPasswordChange();
    }

    @Test
    @DisplayName("UTC-ACC-092: Mật khẩu mới trùng mật khẩu cũ")
    void acc092() {
      apiStatus(400, () -> authService.change(actor, new ChangePassword(GOOD, GOOD, GOOD)));
      verify(users, never()).password(anyInt(), anyString(), anyBoolean());
    }

    @Test
    @DisplayName("UTC-ACC-093: Mật khẩu mới 9 ký tự")
    void acc093() {
      api(400, "PASSWORD", "Mật khẩu cần 10–64 ký tự và tối đa 72 byte.",
              () -> authService.change(actor, new ChangePassword(GOOD, "Pass@1234", "Pass@1234")));
      verifyNoPasswordChange();
    }

    @Test
    @DisplayName("UTC-ACC-094: Mật khẩu mới đúng 10 ký tự")
    void acc094() {
      when(passwords.matches("Pass@12345", OLD_HASH)).thenReturn(false);
      assertDoesNotThrow(() -> authService.change(actor, new ChangePassword(GOOD, "Pass@12345", "Pass@12345")));
      verify(users).password(30, "bcrypt:Pass@12345", false);
      verify(passwordChanges).clear(30);
    }

    @Test
    @DisplayName("UTC-ACC-095: Không có yêu cầu đổi mật khẩu thì clear xóa 0 dòng, không lỗi")
    void acc095() {
      var member = account(10, "FAMILY_MEMBER", "ACTIVE", "member@shop.com");
      when(users.lock(10)).thenReturn(member);
      when(passwords.matches("Member@2026", OLD_HASH)).thenReturn(true);
      when(passwords.matches("NewMember@2026", OLD_HASH)).thenReturn(false);
      // Repository thật trên JdbcTemplate giả: bảng đã có, DELETE ảnh hưởng 0 dòng
      JdbcTemplate db = mock(JdbcTemplate.class);
      when(db.queryForObject(contains("information_schema"), eq(Integer.class))).thenReturn(1);
      when(db.update(contains("DELETE FROM user_password_change_required"), any(Object[].class))).thenReturn(0);
      var changes = spy(new PasswordChangeRequirementRepository(db));
      var auth = new AuthService(users, passwords, codes, mock(OtpService.class), notices, changes);

      assertDoesNotThrow(
              () -> auth.change(member, new ChangePassword("Member@2026", "NewMember@2026", "NewMember@2026")));
      verify(users).password(10, "bcrypt:NewMember@2026", false);
      verify(changes).clear(10);
      verify(db).update(contains("DELETE FROM user_password_change_required"), any(Object[].class));
    }
  }
}
