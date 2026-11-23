package com.thors.module.account.service;

import com.thors.config.Settings;
import com.thors.module.account.entity.Account;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/**
 * Gửi email báo tài khoản mới (do Admin / Owner tạo) cho chính người được tạo: email đăng nhập, mật khẩu
 * tạm và các bước kích hoạt.
 *
 * <p>Gọi SAU khi tạo tài khoản đã commit. Gửi lỗi hoặc chưa cấu hình mail thì chỉ ghi log và trả false,
 * không làm hỏng việc tạo tài khoản; người tạo sẽ được nhắc tự báo thông tin cho người dùng.
 */
@Service
public class AccountMailService {
  private static final Logger log = LoggerFactory.getLogger(AccountMailService.class);
  private static final Map<String, String> ROLE_NAMES =
          Map.of(
                  "ADMIN", "Quản trị viên",
                  "OWNER", "Chủ cửa hàng",
                  "FAMILY_MEMBER", "Thành viên gia đình",
                  "STAFF", "Nhân viên",
                  "CUSTOMER", "Khách hàng");

  private final Settings settings;
  private final ObjectProvider<JavaMailSender> mail;

  public AccountMailService(Settings settings, ObjectProvider<JavaMailSender> mail) {
    this.settings = settings;
    this.mail = mail;
  }

  /** @return true nếu đã gửi được email. */
  public boolean sendAccountCreated(Account account, String temporaryPassword) {
    var delivery = settings.delivery();
    JavaMailSender sender = mail.getIfAvailable();
    if (delivery == null || !delivery.emailEnabled() || sender == null
            || delivery.emailFrom() == null || delivery.emailFrom().isBlank()) {
      log.info("Chưa gửi email tài khoản mới #{}: dịch vụ email chưa được cấu hình", account.id());
      return false;
    }
    try {
      var m = new SimpleMailMessage();
      m.setFrom(delivery.emailFrom());
      m.setTo(account.email());
      m.setSubject("THORS - Tài khoản của bạn đã được tạo");
      m.setText(body(account, temporaryPassword));
      sender.send(m);
      return true;
    } catch (RuntimeException e) {
      log.warn("Gửi email tài khoản mới #{} thất bại: {}", account.id(), e.getMessage());
      return false;
    }
  }

  String body(Account a, String temporaryPassword) {
    String loginUrl = (settings.frontendUrl() == null ? "" : settings.frontendUrl().replaceAll("/+$", ""))
            + "/login";
    return "Xin chào " + a.fullName() + ",\n\n"
            + "Tài khoản THORS của bạn đã được tạo với vai trò "
            + ROLE_NAMES.getOrDefault(a.role(), a.role()) + ".\n\n"
            + "Thông tin đăng nhập:\n"
            + "  - Email: " + a.email() + "\n"
            + "  - Mật khẩu tạm: " + temporaryPassword + "\n\n"
            + "Các bước để bắt đầu sử dụng:\n"
            + "  1. Mở " + loginUrl + " và đăng nhập bằng thông tin trên.\n"
            + "  2. Bấm \"Gửi mã xác minh\" và nhập mã OTP được gửi tới email này.\n"
            + "  3. Đăng nhập lại và đổi sang mật khẩu của riêng bạn (bắt buộc ở lần đầu).\n\n"
            + "Mật khẩu tạm chỉ dùng cho lần đăng nhập đầu tiên. Không chia sẻ email này cho người khác.\n"
            + "Nếu bạn không biết về tài khoản này, hãy bỏ qua email hoặc liên hệ cửa hàng.\n\n"
            + "THORS";
  }
}
