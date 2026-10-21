package com.thors.module.auth.service;

import com.thors.common.*;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AccountRepository;
import com.thors.module.auth.dto.AuthRequests.*;
import com.thors.module.auth.repository.OtpRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
  private final AccountRepository users;
  private final PasswordEncoder passwords;
  private final OtpRepository codes;
  private final OtpService otp;
  private final String dummy;

  public AuthService(AccountRepository users, PasswordEncoder passwords, OtpRepository codes, OtpService otp) {
    this.users = users;
    this.passwords = passwords;
    this.codes = codes;
    this.otp = otp;
    this.dummy = passwords.encode(java.util.UUID.randomUUID().toString());
  }

  @Transactional
  public com.thors.module.auth.entity.OtpChallenge register(Register r) {
    confirm(r.password(), r.confirmPassword());
    String email = ContactNormalizer.email(r.identifier());
    otp.requireAvailable("EMAIL");
    var account = users.create(
            "CUSTOMER",
            ContactNormalizer.name(r.fullName()),
            passwords.encode(r.password()),
            email,
            null,
            "PENDING_VERIFICATION",
            null,
            null,
            false);
    // Account, audit and OTP writes roll back together if delivery fails.
    return otp.issue(account.id(), "REGISTER", "EMAIL", false);
  }

  @Transactional(noRollbackFor = ApiException.class)
  public Account authenticate(String identifier, String password) {
    var a = users.byIdentifier(ContactNormalizer.email(identifier));
    if (a.isPresent()) a = java.util.Optional.of(users.lock(a.get().id()));
    String hash = a.map(Account::passwordHash).orElse(dummy);
    boolean correct =
            passwords.matches(password == null ? "" : password, hash.startsWith("!") ? dummy : hash);
    boolean coolingDown = a.isPresent() && codes.loginCoolingDown(a.get().id());
    if (a.isEmpty() || hash.startsWith("!") || !correct) {
      if (a.isPresent() && !coolingDown) codes.loginFailure(a.get().id());
      // Identical error for missing accounts, incorrect passwords and blocked guessing.
      throw new ApiException(401, "CREDENTIALS", "Email hoặc mật khẩu không đúng. Nếu đã sai 5 lần liên tiếp, vui lòng đợi 15 phút.");
    }
    if (coolingDown)
      throw new ApiException(429, "LOGIN_COOLDOWN", "Đã nhập sai mật khẩu 5 lần. Vui lòng đợi hết 15 phút kể từ lần sai thứ 5.");
    var account = a.get();
    if (!account.active() && !account.pending())
      throw new ApiException(403, "ACCOUNT_BLOCKED", "Tài khoản đã bị khóa hoặc vô hiệu hóa.");
    codes.loginSuccess(account.id());
    return account;
  }

  @Transactional
  public void reset(int user, long version, String password, String confirmation) {
    confirm(password, confirmation);
    var a = users.lock(user);
    if (!a.active() || a.authVersion() != version || "ADMIN".equals(a.role()))
      throw new ApiException(400, "RESET_INVALID", "Yêu cầu đặt lại mật khẩu không còn hiệu lực.");
    users.password(user, passwords.encode(password), false);
    codes.invalidateAll(user);
    users.audit(user, "PASSWORD_RESET", user, "Password replaced; sessions revoked");
  }

  @Transactional
  public void change(Account actor, ChangePassword request) {
    confirm(request.password(), request.confirmPassword());
    var a = users.lock(actor.id());
    if (a.authVersion() != actor.authVersion()
            || !a.active()
            || a.passwordHash().startsWith("!")
            || !passwords.matches(request.currentPassword(), a.passwordHash()))
      throw new ApiException(400, "PASSWORD_CURRENT", "Mật khẩu hiện tại không đúng.");
    users.password(a.id(), passwords.encode(request.password()), false);
    codes.invalidateAll(a.id());
    users.audit(a.id(), "PASSWORD_CHANGE", a.id(), "Password replaced; sessions revoked");
  }

  public static void confirm(String p, String confirmation) {
    ContactNormalizer.password(p);
    if (!p.equals(confirmation))
      throw new ApiException(400, "PASSWORD_CONFIRM", "Mật khẩu xác nhận không khớp.");
  }
}
