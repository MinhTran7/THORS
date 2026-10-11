package com.thors.module.auth.controller;

import com.thors.common.*;
import com.thors.config.Settings;
import com.thors.integration.otp.OtpSender;
import com.thors.module.account.mapper.AccountMapper;
import com.thors.module.account.repository.AccountRepository;
import com.thors.module.auth.dto.AuthRequests.*;
import com.thors.module.auth.entity.OtpChallenge;
import com.thors.module.auth.service.*;
import com.thors.security.*;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import java.io.Serializable;
import java.util.*;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private final AuthService auth;
  private final OtpService otp;
  private final AccountRepository users;
  private final SessionAccess sessions;
  private final OtpSender sender;
  private final Settings settings;

  public AuthController(
      AuthService auth,
      OtpService otp,
      AccountRepository users,
      SessionAccess sessions,
      OtpSender sender,
      Settings settings) {
    this.auth = auth;
    this.otp = otp;
    this.users = users;
    this.sessions = sessions;
    this.sender = sender;
    this.settings = settings;
  }

  record ResetGrant(int user, long version, long expires) implements Serializable {}

  @GetMapping("/csrf")
  Object csrf(CsrfToken token) {
    return Map.of("token", token.getToken(), "headerName", token.getHeaderName());
  }

  @GetMapping("/capabilities")
  Object capabilities() {
    return Map.of(
        "email",
        sender.available("EMAIL"),
        "sms",
        sender.available("SMS"),
        "google",
        settings.google().enabled(),
        "otpSeconds",
        settings.auth().otpSeconds(),
        "resendSeconds",
        settings.auth().resendSeconds());
  }

  @GetMapping("/me")
  Object me() {
    return AccountMapper.view(sessions.current());
  }

  @PostMapping("/register")
  Object register(@Valid @RequestBody Register r, HttpServletRequest req) {
    if (!sender.available(r.channel()))
      throw new ApiException(503, "DELIVERY_NOT_CONFIGURED", "Kênh gửi OTP chưa được cấu hình.");
    var a = auth.register(r);
    var c = otp.issue(a.id(), "REGISTER", r.channel(), false);
    req.getSession().setAttribute("OTP_CHALLENGE", c);
    return challenge(c);
  }

  @PostMapping("/login")
  Object login(@Valid @RequestBody Login r, HttpServletRequest req, HttpServletResponse res) {
    var a = auth.authenticate(r.identifier(), r.password());
    if (a.pending())
      return Map.of(
          "verificationRequired",
          true,
          "identifier",
          a.email(),
          "emailAvailable",
          sender.available("EMAIL"),
          "smsAvailable",
          a.phone() != null && sender.available("SMS"));
    sessions.login(a, req, res);
    return Map.of("verificationRequired", false, "account", AccountMapper.view(a));
  }

  @PostMapping("/activation")
  Object activation(@Valid @RequestBody Activation r, HttpServletRequest req) {
    var a = auth.authenticate(r.identifier(), r.password());
    if (!a.pending())
      throw new ApiException(400, "ALREADY_ACTIVE", "Tài khoản không cần kích hoạt.");
    var c = otp.issue(a.id(), "ACTIVATE", r.channel(), false);
    req.getSession().setAttribute("OTP_CHALLENGE", c);
    return challenge(c);
  }

  @PostMapping("/forgot-password")
  Object forgot(@Valid @RequestBody Forgot r, HttpServletRequest req) {
    req.getSession().removeAttribute("RESET_GRANT");
    req.getSession().removeAttribute("OTP_CHALLENGE");
    var a = users.byIdentifier(ContactNormalizer.identifier(r.identifier()));
    if (a.isPresent()
        && a.get().active()
        && !"ADMIN".equals(a.get().role())
        && a.get().verified(r.channel())) {
      var c = otp.issue(a.get().id(), "RESET", r.channel(), true);
      req.getSession().setAttribute("OTP_CHALLENGE", c);
    }
    return Map.of(
        "message",
        "Nếu tài khoản có kênh đã xác minh phù hợp, hệ thống sẽ gửi OTP. Admin cần liên hệ quản trị"
            + " nội bộ.");
  }

  @GetMapping("/otp/context")
  Object context(HttpServletRequest req) {
    var c = getChallenge(req);
    return challenge(c);
  }

  @PostMapping("/otp/resend")
  Object resend(HttpServletRequest req) {
    var old = getChallenge(req);
    var c = otp.issue(old.userId(), old.context(), old.channel(), "RESET".equals(old.context()));
    req.getSession().setAttribute("OTP_CHALLENGE", c);
    return challenge(c);
  }

  @PostMapping("/otp/verify")
  Object verify(@Valid @RequestBody Code r, HttpServletRequest req) {
    var c = getChallenge(req);
    var check = otp.verify(c, r.code());
    if (!check.success()) throw new ApiException(400, check.code(), check.message());
    req.getSession().removeAttribute("OTP_CHALLENGE");
    if ("RESET".equals(c.context()))
      req.getSession()
          .setAttribute(
              "RESET_GRANT",
              new ResetGrant(c.userId(), c.authVersion(), System.currentTimeMillis() + 600000));
    return Map.of("context", c.context(), "message", check.message());
  }

  @PostMapping("/reset-password")
  Object reset(@Valid @RequestBody Reset r, HttpServletRequest req, HttpServletResponse res) {
    var session = req.getSession(false);
    var grant = session == null ? null : (ResetGrant) session.getAttribute("RESET_GRANT");
    if (grant == null || grant.expires() < System.currentTimeMillis())
      throw new ApiException(400, "RESET_INVALID", "Vui lòng xác minh OTP trước.");
    auth.reset(grant.user(), grant.version(), r.password(), r.confirmPassword());
    sessions.clear(req, res);
    return Map.of("message", "Đã đặt lại mật khẩu. Vui lòng đăng nhập lại.");
  }

  @PostMapping("/logout")
  Object logout(HttpServletRequest req, HttpServletResponse res) {
    sessions.clear(req, res);
    return Map.of("message", "Đã đăng xuất.");
  }

  @PostMapping("/change-password")
  Object change(
      @Valid @RequestBody ChangePassword r, HttpServletRequest req, HttpServletResponse res) {
    auth.change(sessions.current(), r);
    sessions.clear(req, res);
    return Map.of("message", "Đã đổi mật khẩu. Vui lòng đăng nhập lại.");
  }

  @PostMapping("/verify-contact")
  Object contact(@Valid @RequestBody Channel r, HttpServletRequest req) {
    var c = otp.issue(sessions.current().id(), "CONTACT", r.channel(), false);
    req.getSession().setAttribute("OTP_CHALLENGE", c);
    return challenge(c);
  }

  @PostMapping("/google/link")
  Object link(HttpServletRequest req) {
    var a = sessions.current();
    if (!settings.google().enabled())
      throw new ApiException(503, "GOOGLE_NOT_CONFIGURED", "Google chưa được cấu hình.");
    req.getSession().setAttribute("GOOGLE_LINK_USER", SessionUser.from(a));
    req.getSession().setAttribute("GOOGLE_LINK_AT", System.currentTimeMillis());
    return Map.of("url", "/oauth2/authorization/google");
  }

  private OtpChallenge getChallenge(HttpServletRequest req) {
    var s = req.getSession(false);
    var c = s == null ? null : (OtpChallenge) s.getAttribute("OTP_CHALLENGE");
    if (c == null)
      throw new ApiException(
          400, "OTP_CONTEXT", "Yêu cầu OTP không còn hiệu lực. Vui lòng bắt đầu lại.");
    return c;
  }

  private Object challenge(OtpChallenge c) {
    String d = c.destination();
    String masked =
        "EMAIL".equals(c.channel())
            ? d.substring(0, 1) + "***" + d.substring(d.indexOf('@'))
            : "***" + d.substring(Math.max(0, d.length() - 4));
    return Map.of(
        "context",
        c.context(),
        "channel",
        c.channel(),
        "destination",
        masked,
        "otpSeconds",
        settings.auth().otpSeconds(),
        "resendSeconds",
        settings.auth().resendSeconds());
  }
}
