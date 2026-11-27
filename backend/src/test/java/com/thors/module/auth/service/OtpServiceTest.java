package com.thors.module.auth.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.thors.common.ApiException;
import com.thors.config.OtpKeyProvider;
import com.thors.config.Settings;
import com.thors.integration.otp.OtpSender;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AccountRepository;
import com.thors.module.auth.entity.OtpChallenge;
import com.thors.module.auth.repository.OtpRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.mockito.ArgumentCaptor;

/**
 * Unit test cho OtpService (gửi và kiểm tra mã OTP qua email) theo sheet "OtpService" của
 * Report-5.1_Unit Test. Repository và kênh gửi đều là mock. Cấu hình: OTP hiệu lực 300 giây (5 phút),
 * gửi lại sau 60 giây, tối đa 5 lần gửi / giờ, tối đa 5 lần nhập sai.
 * Loại: N = Normal, A = Abnormal, B = Boundary.
 */
@DisplayName("OtpService Unit Test")
class OtpServiceTest {
  private static final String EMAIL = "minh@thors.vn";
  private static final Settings SETTINGS =
      new Settings("http://localhost:3000", new Settings.Auth("k".repeat(32), 300, 60, 5), null, null, null, null);

  private OtpRepository codes;
  private AccountRepository users;
  private OtpSender sender;
  private OtpService service;

  /** Mã, token và hash thật mà service đã tạo ở lần issue gần nhất (lấy qua ArgumentCaptor). */
  private String sentCode;
  private String token;
  private String hash;

  @BeforeEach
  void setUp() {
    codes = mock(OtpRepository.class);
    users = mock(AccountRepository.class);
    sender = mock(OtpSender.class);
    service = new OtpService(codes, users, sender, SETTINGS, new OtpKeyProvider(SETTINGS));
    when(sender.available("EMAIL")).thenReturn(true);
    when(codes.create(anyInt(), any(), any(), any(), any())).thenAnswer(i -> i.getArgument(2));
  }

  private static Account account(String status, String email, LocalDateTime verifiedAt, long version) {
    return new Account(10, "CUSTOMER", "Trần Minh", "bcrypt:x", email, null, null, null, status, null, verifiedAt, null, version, null);
  }

  private static LocalDateTime now() {
    return LocalDateTime.now(Clock.systemUTC());
  }

  private static ApiException fails(Executable call, int status, String code) {
    var e = assertThrows(ApiException.class, call);
    assertEquals(status, e.status);
    assertEquals(code, e.code);
    return e;
  }

  /** Gửi một mã REGISTER cho tài khoản chờ xác minh và ghi lại mã, token, hash đã tạo. */
  private OtpChallenge issued(String context) {
    when(users.lock(10)).thenReturn(account("PENDING_VERIFICATION", EMAIL, null, 0));
    var challenge = service.issue(10, context, "EMAIL", false);
    var t = ArgumentCaptor.forClass(String.class);
    var h = ArgumentCaptor.forClass(String.class);
    verify(codes).create(eq(10), eq(context + "_EMAIL"), t.capture(), h.capture(), any());
    var c = ArgumentCaptor.forClass(String.class);
    verify(sender).send(eq("EMAIL"), eq(EMAIL), c.capture(), eq(300));
    token = t.getValue();
    hash = h.getValue();
    sentCode = c.getValue();
    return challenge;
  }

  /** Bản ghi OTP đang lưu trong DB cho challenge vừa gửi. */
  private void storedCode(int attempts, LocalDateTime expires) {
    when(codes.lock(token, 10)).thenReturn(new OtpRepository.Code(token, 10, hash, expires, attempts));
  }

  private static String other(String code) {
    return code.equals("000000") ? "111111" : "000000";
  }

  // ------------------------------------------------------------------ requireAvailable

  @Nested
  @DisplayName("requireAvailable(String channel)")
  class RequireAvailable {
    @Test
    @DisplayName("UTC001 - N - kênh EMAIL đã cấu hình")
    void utc001() {
      assertDoesNotThrow(() -> service.requireAvailable("EMAIL"));
    }

    @Test
    @DisplayName("UTC002 - A - kênh EMAIL chưa cấu hình")
    void utc002() {
      when(sender.available("EMAIL")).thenReturn(false);
      var e = fails(() -> service.requireAvailable("EMAIL"), 503, "DELIVERY_NOT_CONFIGURED");
      assertEquals("Dịch vụ email OTP chưa được cấu hình.", e.getMessage());
    }
  }

  // ------------------------------------------------------------------ issue

  @Nested
  @DisplayName("issue(int userId, String context, String channel, boolean requireVerified)")
  class Issue {
    @Test
    @DisplayName("UTC003 - N - gửi mã 6 chữ số, hiệu lực 300 giây, lưu hash chứ không lưu mã")
    void utc003() {
      var before = now();
      var challenge = issued("REGISTER");

      assertTrue(sentCode.matches("\\d{6}"));
      assertNotEquals(sentCode, hash);
      assertEquals(new OtpChallenge(token, 10, "REGISTER_EMAIL", "EMAIL", EMAIL, 0, "REGISTER"), challenge);
      var expires = ArgumentCaptor.forClass(LocalDateTime.class);
      verify(codes).create(anyInt(), any(), any(), any(), expires.capture());
      assertFalse(expires.getValue().isBefore(before.plusSeconds(300)));
      assertTrue(expires.getValue().isBefore(now().plusSeconds(301)));
    }

    @Test
    @DisplayName("UTC004 - A - kênh SMS không được hỗ trợ")
    void utc004() {
      fails(() -> service.issue(10, "REGISTER", "SMS", false), 400, "CHANNEL");
      verifyNoInteractions(users);
    }

    @Test
    @DisplayName("UTC005 - A - tài khoản bị khóa")
    void utc005() {
      when(users.lock(10)).thenReturn(account("LOCKED", EMAIL, null, 0));
      fails(() -> service.issue(10, "REGISTER", "EMAIL", false), 403, "ACCOUNT_BLOCKED");
      verify(sender, never()).send(any(), any(), any(), anyInt());
    }

    @Test
    @DisplayName("UTC006 - A - tài khoản không có email")
    void utc006() {
      when(users.lock(10)).thenReturn(account("ACTIVE", null, null, 0));
      fails(() -> service.issue(10, "RESET", "EMAIL", false), 400, "CONTACT_UNVERIFIED");
    }

    @Test
    @DisplayName("UTC007 - A - yêu cầu email đã xác minh nhưng email chưa xác minh")
    void utc007() {
      when(users.lock(10)).thenReturn(account("ACTIVE", EMAIL, null, 0));
      fails(() -> service.issue(10, "RESET", "EMAIL", true), 400, "CONTACT_UNVERIFIED");
    }

    @Test
    @DisplayName("UTC008 - N - yêu cầu email đã xác minh và email đã xác minh")
    void utc008() {
      when(users.lock(10)).thenReturn(account("ACTIVE", EMAIL, now().minusDays(1), 0));
      assertEquals("RESET_EMAIL", service.issue(10, "RESET", "EMAIL", true).purpose());
    }

    @Test
    @DisplayName("UTC009 - A - đang bị khóa 15 phút do nhập sai OTP 5 lần")
    void utc009() {
      when(users.lock(10)).thenReturn(account("ACTIVE", EMAIL, null, 0));
      when(codes.otpCoolingDown(10)).thenReturn(true);
      fails(() -> service.issue(10, "REGISTER", "EMAIL", false), 429, "OTP_LOCKED");
    }

    @Test
    @DisplayName("UTC010 - B - gửi lại khi mới qua 59 giây")
    void utc010() {
      when(users.lock(10)).thenReturn(account("ACTIVE", EMAIL, null, 0));
      when(codes.lastSent(10)).thenReturn(now().minusSeconds(59));
      fails(() -> service.issue(10, "REGISTER", "EMAIL", false), 429, "OTP_COOLDOWN");
    }

    @Test
    @DisplayName("UTC011 - B - gửi lại khi đã qua 61 giây")
    void utc011() {
      when(users.lock(10)).thenReturn(account("ACTIVE", EMAIL, null, 0));
      when(codes.lastSent(10)).thenReturn(now().minusSeconds(61));
      assertNotNull(service.issue(10, "REGISTER", "EMAIL", false));
    }

    @Test
    @DisplayName("UTC012 - B - đã gửi 4 lần trong giờ (dưới giới hạn 5)")
    void utc012() {
      when(users.lock(10)).thenReturn(account("ACTIVE", EMAIL, null, 0));
      when(codes.sentLastHour(10)).thenReturn(4);
      assertNotNull(service.issue(10, "REGISTER", "EMAIL", false));
    }

    @Test
    @DisplayName("UTC013 - B - đã gửi đủ 5 lần trong giờ")
    void utc013() {
      when(users.lock(10)).thenReturn(account("ACTIVE", EMAIL, null, 0));
      when(codes.sentLastHour(10)).thenReturn(5);
      fails(() -> service.issue(10, "REGISTER", "EMAIL", false), 429, "OTP_LIMIT");
    }

    @Test
    @DisplayName("UTC014 - A - kênh gửi email chưa cấu hình")
    void utc014() {
      when(users.lock(10)).thenReturn(account("ACTIVE", EMAIL, null, 0));
      when(sender.available("EMAIL")).thenReturn(false);
      fails(() -> service.issue(10, "REGISTER", "EMAIL", false), 503, "DELIVERY_NOT_CONFIGURED");
      verify(codes, never()).create(anyInt(), any(), any(), any(), any());
    }
  }


  // ------------------------------------------------------------------ verify

  @Nested
  @DisplayName("verify(OtpChallenge challenge, String value)")
  class Verify {
    @Test
    @DisplayName("UTC015 - N - đúng mã khi đăng ký: kích hoạt tài khoản")
    void utc015() {
      var challenge = issued("REGISTER");
      storedCode(0, now().plusSeconds(300));
      var result = service.verify(challenge, sentCode);
      assertEquals(new OtpService.Check(true, "OK", "Xác minh thành công."), result);
      verify(codes).used(any());
      verify(users).verify(10, "EMAIL", true);
      verify(users).audit(10, "ACCOUNT_VERIFIED", 10, "EMAIL");
    }

    @Test
    @DisplayName("UTC016 - N - đúng mã khi đổi email (CONTACT): xác minh email, không kích hoạt")
    void utc016() {
      var challenge = issued("CONTACT");
      storedCode(0, now().plusSeconds(300));
      assertTrue(service.verify(challenge, sentCode).success());
      verify(users).verify(10, "EMAIL", false);
      verify(users, never()).audit(anyInt(), eq("ACCOUNT_VERIFIED"), anyInt(), any());
    }

    @Test
    @DisplayName("UTC017 - N - đúng mã khi quên mật khẩu (RESET): không đổi trạng thái tài khoản")
    void utc017() {
      var challenge = issued("RESET");
      storedCode(0, now().plusSeconds(300));
      assertTrue(service.verify(challenge, sentCode).success());
      verify(users, never()).verify(anyInt(), any(), anyBoolean());
    }

    @Test
    @DisplayName("UTC018 - A - sai mã lần đầu")
    void utc018() {
      var challenge = issued("REGISTER");
      storedCode(0, now().plusSeconds(300));
      var result = service.verify(challenge, other(sentCode));
      assertEquals("OTP_INVALID", result.code());
      assertFalse(result.success());
      verify(codes).wrong(any());
      verify(codes, never()).used(any());
    }

    @Test
    @DisplayName("UTC019 - B - sai mã lần thứ 4 (vẫn còn 1 lần)")
    void utc019() {
      var challenge = issued("REGISTER");
      storedCode(3, now().plusSeconds(300));
      assertEquals("OTP_INVALID", service.verify(challenge, other(sentCode)).code());
    }

    @Test
    @DisplayName("UTC020 - B - sai mã lần thứ 5: khóa mã")
    void utc020() {
      var challenge = issued("REGISTER");
      storedCode(4, now().plusSeconds(300));
      assertEquals("OTP_LOCKED", service.verify(challenge, other(sentCode)).code());
    }

    @Test
    @DisplayName("UTC021 - B - đã sai đủ 5 lần, nhập đúng cũng không nhận")
    void utc021() {
      var challenge = issued("REGISTER");
      storedCode(5, now().plusSeconds(300));
      assertEquals("OTP_EXPIRED", service.verify(challenge, sentCode).code());
      verify(codes, never()).used(any());
    }

    @Test
    @DisplayName("UTC022 - B - mã đã quá hạn 1 giây")
    void utc022() {
      var challenge = issued("REGISTER");
      storedCode(0, now().minusSeconds(1));
      assertEquals("OTP_EXPIRED", service.verify(challenge, sentCode).code());
    }

    @Test
    @DisplayName("UTC023 - B - mã còn hạn 1 giây")
    void utc023() {
      var challenge = issued("REGISTER");
      storedCode(0, now().plusSeconds(1));
      assertTrue(service.verify(challenge, sentCode).success());
    }

    @Test
    @DisplayName("UTC024 - A - mã không còn trong DB (đã dùng / đã gửi mã mới)")
    void utc024() {
      var challenge = issued("REGISTER");
      when(codes.lock(token, 10)).thenReturn(null);
      assertEquals("OTP_EXPIRED", service.verify(challenge, sentCode).code());
    }

    @Test
    @DisplayName("UTC025 - A - đang bị khóa 15 phút")
    void utc025() {
      var challenge = issued("REGISTER");
      when(codes.otpCoolingDown(10)).thenReturn(true);
      assertEquals("OTP_LOCKED", service.verify(challenge, sentCode).code());
      verify(codes, never()).lock(any(), anyInt());
    }

    @Test
    @DisplayName("UTC026 - A - tài khoản đã đổi mật khẩu sau khi gửi mã (authVersion khác)")
    void utc026() {
      var challenge = issued("REGISTER");
      storedCode(0, now().plusSeconds(300));
      when(users.lock(10)).thenReturn(account("PENDING_VERIFICATION", EMAIL, null, 1));
      assertEquals("OTP_EXPIRED", service.verify(challenge, sentCode).code());
    }

    @Test
    @DisplayName("UTC027 - A - email tài khoản đã đổi sau khi gửi mã")
    void utc027() {
      var challenge = issued("REGISTER");
      storedCode(0, now().plusSeconds(300));
      when(users.lock(10)).thenReturn(account("PENDING_VERIFICATION", "khac@thors.vn", null, 0));
      assertEquals("OTP_EXPIRED", service.verify(challenge, sentCode).code());
    }

    @Test
    @DisplayName("UTC028 - A - tài khoản bị khóa trong lúc chờ nhập mã")
    void utc028() {
      var challenge = issued("REGISTER");
      storedCode(0, now().plusSeconds(300));
      when(users.lock(10)).thenReturn(account("LOCKED", EMAIL, null, 0));
      assertEquals("ACCOUNT_BLOCKED", service.verify(challenge, sentCode).code());
    }

    @Test
    @DisplayName("UTC029 - A - không nhập mã (null)")
    void utc029() {
      var challenge = issued("REGISTER");
      storedCode(0, now().plusSeconds(300));
      assertEquals("OTP_INVALID", service.verify(challenge, null).code());
      verify(codes).wrong(any());
    }
  }
}
