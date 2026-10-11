package com.thors.module.account.service;

import com.thors.common.*;
import com.thors.module.account.dto.AccountRequests.*;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AccountRepository;
import com.thors.module.auth.repository.OtpRepository;
import com.thors.module.auth.service.AuthService;
import java.util.List;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService {
  private final AccountRepository users;
  private final OtpRepository codes;
  private final PasswordEncoder passwords;

  public AccountService(AccountRepository users, OtpRepository codes, PasswordEncoder passwords) {
    this.users = users;
    this.codes = codes;
    this.passwords = passwords;
  }

  public List<Account> list(Account actor) {
    manager(actor);
    return users.managed(actor);
  }

  @Transactional
  public Account create(Account actor, Create r) {
    manager(actor);
    boolean allowed =
        "ADMIN".equals(actor.role())
            ? "OWNER".equals(r.role())
            : List.of("STAFF", "FAMILY_MEMBER").contains(r.role());
    if (!allowed) throw new ApiException(403, "ROLE", "Không được tạo vai trò này.");
    AuthService.confirm(r.password(), r.confirmPassword());
    var a =
        users.create(
            r.role(),
            ContactNormalizer.name(r.fullName()),
            passwords.encode(r.password()),
            ContactNormalizer.email(r.email()),
            ContactNormalizer.phone(r.phone()),
            "PENDING_VERIFICATION",
            actor.id(),
            null,
            false);
    return a;
  }

  @Transactional
  public Account edit(Account actor, int id, Edit r) {
    var target = target(actor, id);
    users.name(id, ContactNormalizer.name(r.fullName()));
    if (r.status() != null && !r.status().equals(target.status())) {
      if (id == actor.id())
        throw new ApiException(
            400, "SELF_LOCK", "Không thể thay trạng thái tài khoản của chính mình.");
      if (!List.of("ACTIVE", "LOCKED", "DISABLED").contains(r.status()))
        throw new ApiException(400, "STATUS", "Trạng thái không hợp lệ.");
      if ("ACTIVE".equals(r.status())
          && target.emailVerifiedAt() == null
          && target.phoneVerifiedAt() == null)
        throw new ApiException(
            400, "UNVERIFIED", "Tài khoản cần xác minh OTP trước khi kích hoạt.");
      users.status(id, r.status());
      codes.invalidateAll(id);
    }
    users.audit(actor.id(), "ACCOUNT_EDIT", id, "Account details/status updated");
    return users.byId(id).orElseThrow();
  }

  @Transactional
  public void resetByManager(Account actor, int id, Password r) {
    var target = target(actor, id);
    boolean allowed =
        "ADMIN".equals(actor.role())
            ? "OWNER".equals(target.role())
            : List.of("STAFF", "FAMILY_MEMBER").contains(target.role());
    if (!allowed)
      throw new ApiException(
          403, "RESET_ROLE", "Vai trò này cần khôi phục mật khẩu theo luồng riêng.");
    AuthService.confirm(r.password(), r.confirmPassword());
    users.password(id, passwords.encode(r.password()), true);
    codes.invalidateAll(id);
    users.audit(
        actor.id(), "PASSWORD_RESET_ADMIN", id, "Initial password replaced; verification required");
  }

  @Transactional
  public Account profile(Account actor, Edit r) {
    users.lock(actor.id());
    users.name(actor.id(), ContactNormalizer.name(r.fullName()));
    return users.byId(actor.id()).orElseThrow();
  }

  @Transactional
  public Account phone(Account actor, String input) {
    users.lockIdentityRegistry();
    var a = users.lock(actor.id());
    if (a.phone() != null)
      throw new ApiException(400, "PHONE_EXISTS", "Tài khoản đã có số điện thoại.");
    String p = ContactNormalizer.phone(input);
    if (p == null) throw new ApiException(400, "PHONE", "Nhập số điện thoại.");
    users.addPhone(a.id(), p);
    users.audit(a.id(), "PHONE_ADDED", a.id(), "Unverified phone added");
    return users.byId(a.id()).orElseThrow();
  }

  private Account target(Account actor, int id) {
    manager(actor);
    var a = users.lock(id);
    if ("OWNER".equals(actor.role())
        && (!java.util.Objects.equals(a.createdBy(), actor.id())
            || !List.of("STAFF", "FAMILY_MEMBER").contains(a.role())))
      throw new ApiException(403, "OWNERSHIP", "Không được quản lý tài khoản này.");
    return a;
  }

  private void manager(Account actor) {
    if (!List.of("ADMIN", "OWNER").contains(actor.role()))
      throw new ApiException(403, "ROLE", "Không có quyền quản lý tài khoản.");
  }
}
