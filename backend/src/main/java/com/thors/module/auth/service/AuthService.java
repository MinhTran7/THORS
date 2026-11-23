package com.thors.module.auth.service;

import com.thors.common.*;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AccountRepository;
import com.thors.module.account.repository.PasswordChangeRequirementRepository;
import com.thors.module.auth.dto.AuthRequests.*;
import com.thors.module.auth.repository.OtpRepository;
import com.thors.module.notification.service.NotificationPublisher;
import com.thors.module.notification.service.NotificationTypes;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
  private final AccountRepository users;
  private final PasswordEncoder passwords;
  private final OtpRepository codes;
  private final OtpService otp;
  private final NotificationPublisher notices;
  private final PasswordChangeRequirementRepository passwordChanges;
  private final String dummy;

  public AuthService(
          AccountRepository users,
          PasswordEncoder passwords,
          OtpRepository codes,
          OtpService otp,
          NotificationPublisher notices,
          PasswordChangeRequirementRepository passwordChanges) {
    this.users = users;
    this.passwords = passwords;
    this.codes = codes;
    this.otp = otp;
    this.notices = notices;
    this.passwordChanges = passwordChanges;
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

  /**
   * KIỂM TRA ĐĂNG NHẬP bằng email + mật khẩu (gọi từ AuthController.login và AuthController.activation).
   * Trả Account nếu được phép đăng nhập; không thì ném ApiException:
   *   - 400 EMAIL           : email sai dạng (ContactNormalizer.email)
   *   - 401 CREDENTIALS     : không có tài khoản hoặc sai mật khẩu (cùng một câu, để không lộ email nào có tài khoản)
   *   - 429 LOGIN_COOLDOWN  : mật khẩu ĐÚNG nhưng đang bị khóa 15 phút do sai 5 lần liên tiếp
   *   - 403 ACCOUNT_BLOCKED : mật khẩu ĐÚNG nhưng tài khoản bị khóa / vô hiệu hóa
   * noRollbackFor = ApiException: khi ném lỗi, các dòng audit_log đã ghi (LOGIN_FAILURE, LOGIN_LOCK) VẪN được lưu.
   */
  @Transactional(noRollbackFor = ApiException.class)
  public Account authenticate(String identifier, String password) {
    // Kiểm tra + chuẩn hóa email (bỏ khoảng trắng, chữ thường), rồi tìm tài khoản: SELECT user WHERE email = ?
    var a = users.byIdentifier(ContactNormalizer.email(identifier));
    // Khóa dòng user (SELECT ... FOR UPDATE) để 2 lần đăng nhập cùng lúc không đếm sai số lần sai
    if (a.isPresent()) a = java.util.Optional.of(users.lock(a.get().id()));
    // Không có tài khoản thì vẫn so với một hash giả (dummy) để thời gian trả lời như nhau,
    // kẻ dò không đoán được email nào có tài khoản qua tốc độ phản hồi
    String hash = a.map(Account::passwordHash).orElse(dummy);
    // So mật khẩu bằng BCrypt. Hash bắt đầu bằng "!" = tài khoản không có mật khẩu (vd tạo bằng Google) → luôn sai
    boolean correct =
            passwords.matches(password == null ? "" : password, hash.startsWith("!") ? dummy : hash);
    // Đang bị khóa 15 phút không? (đọc audit_log, xem OtpRepository.loginCoolingDown)
    boolean coolingDown = a.isPresent() && codes.loginCoolingDown(a.get().id());
    // SAI: không có tài khoản / không có mật khẩu / sai mật khẩu
    if (a.isEmpty() || hash.startsWith("!") || !correct) {
      // Ghi lần sai (đủ 5 lần liên tiếp thì ghi thêm LOGIN_LOCK). Đang khóa thì không đếm thêm.
      if (a.isPresent() && !coolingDown) codes.loginFailure(a.get().id());
      // Identical error for missing accounts, incorrect passwords and blocked guessing.
      throw new ApiException(401, "CREDENTIALS", "Email hoặc mật khẩu không đúng. Nếu đã sai 5 lần liên tiếp, vui lòng đợi 15 phút.");
    }
    // ĐÚNG mật khẩu nhưng đang trong 15 phút bị khóa
    if (coolingDown)
      throw new ApiException(429, "LOGIN_COOLDOWN", "Đã nhập sai mật khẩu 5 lần. Vui lòng đợi hết 15 phút kể từ lần sai thứ 5.");
    var account = a.get();
    // ĐÚNG mật khẩu nhưng tài khoản bị khóa / vô hiệu hóa. Tài khoản chờ xác minh (pending) vẫn đi tiếp,
    // AuthController sẽ trả verificationRequired cho nó.
    if (!account.active() && !account.pending())
      throw new ApiException(403, "ACCOUNT_BLOCKED", "Tài khoản đã bị khóa hoặc vô hiệu hóa.");
    // Thành công: ghi LOGIN_SUCCESS (dòng này cũng "xóa" chuỗi sai liên tiếp vì loginFailure đếm tới khi gặp nó)
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
    notices.toUser(
            user,
            NotificationTypes.ACCOUNT_SECURITY,
            "Mật khẩu đã được đặt lại",
            "Mật khẩu của bạn vừa được đặt lại và bạn đã bị đăng xuất khỏi mọi thiết bị. Nếu không phải bạn thực hiện, hãy liên hệ quản trị viên ngay.");
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
    if (passwords.matches(request.password(), a.passwordHash()))
      throw new ApiException(400, "PASSWORD_SAME", "Mật khẩu mới phải khác mật khẩu hiện tại.");
    users.password(a.id(), passwords.encode(request.password()), false);
    passwordChanges.clear(a.id());
    codes.invalidateAll(a.id());
    users.audit(a.id(), "PASSWORD_CHANGE", a.id(), "Password replaced; sessions revoked");
    notices.toUser(
            a.id(),
            NotificationTypes.ACCOUNT_SECURITY,
            "Mật khẩu đã được thay đổi",
            "Mật khẩu của bạn vừa được thay đổi và bạn đã bị đăng xuất khỏi mọi thiết bị. Nếu không phải bạn thực hiện, hãy liên hệ quản trị viên ngay.");
  }

  public static void confirm(String p, String confirmation) {
    ContactNormalizer.password(p);
    if (!p.equals(confirmation))
      throw new ApiException(400, "PASSWORD_CONFIRM", "Mật khẩu xác nhận không khớp.");
  }
}