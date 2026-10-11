package com.thors.module.auth.service;

import com.thors.common.*;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AccountRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GoogleAccountService {
  private final AccountRepository users;

  public GoogleAccountService(AccountRepository users) {
    this.users = users;
  }

  @Transactional
  public Account resolve(
      String subject,
      String email,
      String name,
      boolean verified,
      Integer linkUser,
      Long linkVersion) {
    if (!verified || subject == null || subject.isBlank() || subject.length() > 255)
      throw new ApiException(400, "GOOGLE_EMAIL", "Google chưa xác minh email.");
    users.lockIdentityRegistry();
    var linked = users.byGoogle(subject);
    if (linkUser != null) {
      var actor = users.lock(linkUser);
      if (!actor.active() || linkVersion == null || actor.authVersion() != linkVersion)
        throw new ApiException(401, "LINK_EXPIRED", "Phiên liên kết đã hết hiệu lực.");
      if (!ContactNormalizer.email(actor.email()).equals(ContactNormalizer.email(email)))
        throw new ApiException(
            409,
            "GOOGLE_EMAIL_MISMATCH",
            "Hãy chọn tài khoản Google có cùng email với tài khoản THORS.");
      if (linked.isPresent() && linked.get().id() != actor.id())
        throw new ApiException(409, "GOOGLE_IN_USE", "Google đã liên kết với tài khoản khác.");
      if (actor.googleSubject() != null && !actor.googleSubject().equals(users.googleKey(subject)))
        throw new ApiException(409, "GOOGLE_ALREADY_LINKED", "Tài khoản đã liên kết Google khác.");
      users.linkGoogle(actor.id(), subject);
      users.verify(actor.id(), "EMAIL", false);
      return users.byId(actor.id()).orElseThrow();
    }
    if (linked.isPresent()) {
      var a = linked.get();
      if (!a.active())
        throw new ApiException(403, "ACCOUNT_BLOCKED", "Tài khoản chưa kích hoạt hoặc đã bị khóa.");
      return a;
    }
    String normalized = ContactNormalizer.email(email);
    if (users.byIdentifier(normalized).isPresent())
      throw new ApiException(
          409,
          "GOOGLE_LINK_REQUIRED",
          "Email đã có tài khoản THORS. Đăng nhập bằng mật khẩu để liên kết Google trước.");
    return users.create(
        "CUSTOMER",
        ContactNormalizer.name(name == null || name.isBlank() ? normalized : name),
        "!GOOGLE_ONLY",
        normalized,
        null,
        "ACTIVE",
        null,
        subject,
        true);
  }
}
