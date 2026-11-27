package com.thors.module.auth.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AccountRepository;
import com.thors.module.account.repository.PasswordChangeRequirementRepository;
import com.thors.module.auth.dto.AuthRequests.ChangePassword;
import com.thors.module.auth.dto.AuthRequests.Register;
import com.thors.module.auth.entity.OtpChallenge;
import com.thors.module.auth.repository.OtpRepository;
import com.thors.module.notification.service.NotificationPublisher;
import com.thors.module.notification.service.NotificationTypes;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Unit test cho AuthService (đăng ký, đăng nhập, đặt lại / đổi mật khẩu) theo sheet "AuthService" của
 * Report-5.1_Unit Test. Mọi phụ thuộc (repository, OtpService, thông báo) đều là mock, không dùng DB.
 * Loại: N = Normal, A = Abnormal, B = Boundary.
 */
@DisplayName("AuthService Unit Test")
class AuthServiceTest {
  private static final String EMAIL = "minh@thors.vn";
  private static final String HASH = "bcrypt:thors123";

  private AccountRepository users;
  private OtpRepository codes;
  private OtpService otp;
  private NotificationPublisher notices;
  private PasswordChangeRequirementRepository passwordChanges;
  private AuthService service;

  /** Mã hóa giả: "bcrypt:" + mật khẩu, để test không phụ thuộc BCrypt thật. */
  private final PasswordEncoder passwords =
      new PasswordEncoder() {
        public String encode(CharSequence raw) {
          return "bcrypt:" + raw;
        }

        public boolean matches(CharSequence raw, String hash) {
          return ("bcrypt:" + raw).equals(hash);
        }
      };

  @BeforeEach
  void setUp() {
    users = mock(AccountRepository.class);
    codes = mock(OtpRepository.class);
    otp = mock(OtpService.class);
    notices = mock(NotificationPublisher.class);
    passwordChanges = mock(PasswordChangeRequirementRepository.class);
    service = new AuthService(users, passwords, codes, otp, notices, passwordChanges);
  }

  private static Account account(int id, String role, String status, String hash, long version) {
    return new Account(id, role, "Trần Minh", hash, EMAIL, null, null, null, status, null, null, null, version, null);
  }

  private static Account customer(String status) {
    return account(10, "CUSTOMER", status, HASH, 0);
  }

  /** Tài khoản có trong DB: byIdentifier tìm thấy và lock trả lại chính nó. */
  private void stored(Account a) {
    when(users.byIdentifier(a.email())).thenReturn(Optional.of(a));
    when(users.lock(a.id())).thenReturn(a);
  }

  private static ApiException fails(Executable call, int status, String code) {
    var e = assertThrows(ApiException.class, call);
    assertEquals(status, e.status);
    assertEquals(code, e.code);
    return e;
  }

  // ------------------------------------------------------------------ register

  @Nested
  @DisplayName("register(Register r)")
  class RegisterTests {
    private final OtpChallenge challenge =
        new OtpChallenge("token-1", 10, "REGISTER_EMAIL", "EMAIL", EMAIL, 0, "REGISTER");

    @Test
    @DisplayName("UTC001 - N - đăng ký hợp lệ: tạo CUSTOMER chờ xác minh và gửi OTP")
    void utc001() {
      when(users.create(any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean()))
          .thenReturn(customer("PENDING_VERIFICATION"));
      when(otp.issue(10, "REGISTER", "EMAIL", false)).thenReturn(challenge);

      var result = service.register(new Register(" Trần Minh ", " Minh@THORS.vn ", "thors123", "thors123"));

      assertSame(challenge, result);
      verify(otp).requireAvailable("EMAIL");
      verify(users).create("CUSTOMER", "Trần Minh", "bcrypt:thors123", EMAIL, null, "PENDING_VERIFICATION", null, null, false);
    }

    @Test
    @DisplayName("UTC002 - A - mật khẩu xác nhận không khớp")
    void utc002() {
      fails(() -> service.register(new Register("Trần Minh", EMAIL, "thors123", "thors124")), 400, "PASSWORD_CONFIRM");
      verifyNoInteractions(users, otp);
    }

    @Test
    @DisplayName("UTC003 - A - dịch vụ email chưa cấu hình: không tạo tài khoản")
    void utc003() {
      doThrow(new ApiException(503, "DELIVERY_NOT_CONFIGURED", "Dịch vụ email OTP chưa được cấu hình."))
          .when(otp).requireAvailable("EMAIL");
      fails(() -> service.register(new Register("Trần Minh", EMAIL, "thors123", "thors123")), 503, "DELIVERY_NOT_CONFIGURED");
      verifyNoInteractions(users);
    }

    @Test
    @DisplayName("UTC004 - A - email đã có tài khoản (repository báo trùng)")
    void utc004() {
      when(users.create(any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean()))
          .thenThrow(new ApiException(409, "EMAIL_IN_USE", "Email đã được sử dụng."));
      var e = fails(() -> service.register(new Register("Trần Minh", EMAIL, "thors123", "thors123")), 409, "EMAIL_IN_USE");
      assertEquals("Email đã được sử dụng.", e.getMessage());
      verify(otp, never()).issue(anyInt(), any(), any(), anyBoolean());
    }

    @Test
    @DisplayName("UTC005 - A - không nhập ô xác nhận mật khẩu (null)")
    void utc005() {
      fails(() -> service.register(new Register("Trần Minh", EMAIL, "thors123", null)), 400, "PASSWORD_CONFIRM");
      verifyNoInteractions(users, otp);
    }

    @Test
    @DisplayName("UTC006 - A - gửi email OTP thất bại: báo lỗi 503 (giao dịch bị hủy)")
    void utc006() {
      when(users.create(any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean()))
          .thenReturn(customer("PENDING_VERIFICATION"));
      when(otp.issue(10, "REGISTER", "EMAIL", false))
          .thenThrow(new ApiException(503, "DELIVERY_FAILED", "Chưa gửi được OTP. Vui lòng thử lại sau."));
      fails(() -> service.register(new Register("Trần Minh", EMAIL, "thors123", "thors123")), 503, "DELIVERY_FAILED");
    }
  }

  // ------------------------------------------------------------------ authenticate

  @Nested
  @DisplayName("authenticate(String identifier, String password)")
  class Authenticate {
    @Test
    @DisplayName("UTC007 - N - đúng email + mật khẩu, tài khoản ACTIVE")
    void utc007() {
      var a = customer("ACTIVE");
      stored(a);
      assertSame(a, service.authenticate(EMAIL, "thors123"));
      verify(codes).loginSuccess(10);
      verify(codes, never()).loginFailure(anyInt());
    }

    @Test
    @DisplayName("UTC008 - N - email viết hoa + khoảng trắng vẫn đăng nhập được")
    void utc008() {
      var a = customer("ACTIVE");
      stored(a);
      assertSame(a, service.authenticate("  MINH@thors.VN ", "thors123"));
    }

    @Test
    @DisplayName("UTC009 - N - tài khoản PENDING_VERIFICATION đúng mật khẩu vẫn trả về")
    void utc009() {
      var a = customer("PENDING_VERIFICATION");
      stored(a);
      assertSame(a, service.authenticate(EMAIL, "thors123"));
    }

    @Test
    @DisplayName("UTC010 - A - sai mật khẩu: 401 và ghi lần sai")
    void utc010() {
      stored(customer("ACTIVE"));
      fails(() -> service.authenticate(EMAIL, "sai-mat-khau"), 401, "CREDENTIALS");
      verify(codes).loginFailure(10);
      verify(codes, never()).loginSuccess(anyInt());
    }

    @Test
    @DisplayName("UTC011 - A - email chưa có tài khoản: cùng lỗi 401, không ghi lần sai")
    void utc011() {
      when(users.byIdentifier(EMAIL)).thenReturn(Optional.empty());
      var e = fails(() -> service.authenticate(EMAIL, "thors123"), 401, "CREDENTIALS");
      assertTrue(e.getMessage().startsWith("Email hoặc mật khẩu không đúng."));
      verify(codes, never()).loginFailure(anyInt());
    }

    @Test
    @DisplayName("UTC012 - A - tài khoản chỉ đăng nhập Google (hash bắt đầu bằng '!')")
    void utc012() {
      stored(account(10, "CUSTOMER", "ACTIVE", "!google", 0));
      fails(() -> service.authenticate(EMAIL, "!google"), 401, "CREDENTIALS");
    }

    @Test
    @DisplayName("UTC013 - A - đúng mật khẩu nhưng đang bị khóa 15 phút")
    void utc013() {
      stored(customer("ACTIVE"));
      when(codes.loginCoolingDown(10)).thenReturn(true);
      fails(() -> service.authenticate(EMAIL, "thors123"), 429, "LOGIN_COOLDOWN");
      verify(codes, never()).loginSuccess(anyInt());
    }

    @Test
    @DisplayName("UTC014 - A - sai mật khẩu khi đang bị khóa: 401, không đếm thêm lần sai")
    void utc014() {
      stored(customer("ACTIVE"));
      when(codes.loginCoolingDown(10)).thenReturn(true);
      fails(() -> service.authenticate(EMAIL, "sai-mat-khau"), 401, "CREDENTIALS");
      verify(codes, never()).loginFailure(anyInt());
    }

    @Test
    @DisplayName("UTC015 - A - đúng mật khẩu nhưng tài khoản bị khóa (LOCKED)")
    void utc015() {
      stored(customer("LOCKED"));
      fails(() -> service.authenticate(EMAIL, "thors123"), 403, "ACCOUNT_BLOCKED");
      verify(codes, never()).loginSuccess(anyInt());
    }

    @Test
    @DisplayName("UTC016 - B - mật khẩu null được coi như chuỗi rỗng")
    void utc016() {
      stored(customer("ACTIVE"));
      fails(() -> service.authenticate(EMAIL, null), 401, "CREDENTIALS");
    }

    @Test
    @DisplayName("UTC017 - A - đúng mật khẩu nhưng tài khoản bị vô hiệu hóa (DISABLED)")
    void utc017() {
      stored(customer("DISABLED"));
      fails(() -> service.authenticate(EMAIL, "thors123"), 403, "ACCOUNT_BLOCKED");
      verify(codes, never()).loginSuccess(anyInt());
    }

    @Test
    @DisplayName("UTC018 - A - mật khẩu sai chữ hoa / thường ('THORS123')")
    void utc018() {
      stored(customer("ACTIVE"));
      fails(() -> service.authenticate(EMAIL, "THORS123"), 401, "CREDENTIALS");
      verify(codes).loginFailure(10);
    }
  }

  // ------------------------------------------------------------------ reset

  @Nested
  @DisplayName("reset(int user, long version, String password, String confirmation)")
  class Reset {
    @Test
    @DisplayName("UTC019 - N - đặt lại mật khẩu: lưu hash mới, đăng xuất mọi nơi, báo người dùng")
    void utc019() {
      when(users.lock(10)).thenReturn(account(10, "OWNER", "ACTIVE", HASH, 3));
      service.reset(10, 3, "matkhaumoi", "matkhaumoi");
      verify(users).password(10, "bcrypt:matkhaumoi", false);
      verify(codes).invalidateAll(10);
      verify(users).audit(10, "PASSWORD_RESET", 10, "Password replaced; sessions revoked");
      verify(notices).toUser(eq(10), eq(NotificationTypes.ACCOUNT_SECURITY), eq("Mật khẩu đã được đặt lại"), anyString());
    }

    @Test
    @DisplayName("UTC020 - A - link đặt lại đã cũ (authVersion khác)")
    void utc020() {
      when(users.lock(10)).thenReturn(account(10, "OWNER", "ACTIVE", HASH, 4));
      fails(() -> service.reset(10, 3, "matkhaumoi", "matkhaumoi"), 400, "RESET_INVALID");
      verify(users, never()).password(anyInt(), any(), anyBoolean());
    }

    @Test
    @DisplayName("UTC021 - A - tài khoản không còn ACTIVE")
    void utc021() {
      when(users.lock(10)).thenReturn(account(10, "OWNER", "LOCKED", HASH, 3));
      fails(() -> service.reset(10, 3, "matkhaumoi", "matkhaumoi"), 400, "RESET_INVALID");
    }

    @Test
    @DisplayName("UTC022 - A - tài khoản ADMIN không được đặt lại qua luồng này")
    void utc022() {
      when(users.lock(1)).thenReturn(account(1, "ADMIN", "ACTIVE", HASH, 0));
      fails(() -> service.reset(1, 0, "matkhaumoi", "matkhaumoi"), 400, "RESET_INVALID");
    }

    @Test
    @DisplayName("UTC023 - A - mật khẩu xác nhận không khớp")
    void utc023() {
      fails(() -> service.reset(10, 3, "matkhaumoi", "matkhaukhac"), 400, "PASSWORD_CONFIRM");
      verifyNoInteractions(users);
    }

    @Test
    @DisplayName("UTC024 - A - tài khoản đang chờ xác minh (PENDING_VERIFICATION)")
    void utc024() {
      when(users.lock(10)).thenReturn(account(10, "OWNER", "PENDING_VERIFICATION", HASH, 3));
      fails(() -> service.reset(10, 3, "matkhaumoi", "matkhaumoi"), 400, "RESET_INVALID");
      verify(users, never()).password(anyInt(), any(), anyBoolean());
    }
  }

  // ------------------------------------------------------------------ change

  @Nested
  @DisplayName("change(Account actor, ChangePassword request)")
  class Change {
    private final Account owner = account(10, "OWNER", "ACTIVE", HASH, 2);

    @Test
    @DisplayName("UTC025 - N - đổi mật khẩu hợp lệ")
    void utc025() {
      when(users.lock(10)).thenReturn(owner);
      service.change(owner, new ChangePassword("thors123", "matkhaumoi", "matkhaumoi"));
      verify(users).password(10, "bcrypt:matkhaumoi", false);
      verify(passwordChanges).clear(10);
      verify(codes).invalidateAll(10);
      verify(users).audit(10, "PASSWORD_CHANGE", 10, "Password replaced; sessions revoked");
      verify(notices).toUser(eq(10), eq(NotificationTypes.ACCOUNT_SECURITY), eq("Mật khẩu đã được thay đổi"), anyString());
    }

    @Test
    @DisplayName("UTC026 - A - mật khẩu hiện tại sai")
    void utc026() {
      when(users.lock(10)).thenReturn(owner);
      fails(() -> service.change(owner, new ChangePassword("saimatkhau", "matkhaumoi", "matkhaumoi")), 400, "PASSWORD_CURRENT");
      verify(users, never()).password(anyInt(), any(), anyBoolean());
    }

    @Test
    @DisplayName("UTC027 - A - tài khoản Google chưa có mật khẩu")
    void utc027() {
      var google = account(10, "CUSTOMER", "ACTIVE", "!google", 2);
      when(users.lock(10)).thenReturn(google);
      fails(() -> service.change(google, new ChangePassword("!google", "matkhaumoi", "matkhaumoi")), 400, "PASSWORD_CURRENT");
    }

    @Test
    @DisplayName("UTC028 - A - phiên đăng nhập cũ (authVersion đã đổi)")
    void utc028() {
      when(users.lock(10)).thenReturn(account(10, "OWNER", "ACTIVE", HASH, 3));
      fails(() -> service.change(owner, new ChangePassword("thors123", "matkhaumoi", "matkhaumoi")), 400, "PASSWORD_CURRENT");
    }

    @Test
    @DisplayName("UTC029 - A - mật khẩu mới trùng mật khẩu hiện tại")
    void utc029() {
      when(users.lock(10)).thenReturn(owner);
      fails(() -> service.change(owner, new ChangePassword("thors123", "thors123", "thors123")), 400, "PASSWORD_SAME");
    }

    @Test
    @DisplayName("UTC030 - A - mật khẩu xác nhận không khớp")
    void utc030() {
      fails(() -> service.change(owner, new ChangePassword("thors123", "matkhaumoi", "matkhaukhac")), 400, "PASSWORD_CONFIRM");
      verifyNoInteractions(users);
    }

    @Test
    @DisplayName("UTC031 - A - tài khoản bị khóa (LOCKED) trong lúc đang đăng nhập")
    void utc031() {
      when(users.lock(10)).thenReturn(account(10, "OWNER", "LOCKED", HASH, 2));
      fails(() -> service.change(owner, new ChangePassword("thors123", "matkhaumoi", "matkhaumoi")), 400, "PASSWORD_CURRENT");
      verify(users, never()).password(anyInt(), any(), anyBoolean());
    }
  }
}
