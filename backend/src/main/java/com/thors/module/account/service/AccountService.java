package com.thors.module.account.service;

import com.thors.common.*;
import com.thors.module.account.dto.AccountDetail;
import com.thors.module.account.dto.AccountPage;
import com.thors.module.account.dto.AccountSummary;
import com.thors.module.account.dto.AccountRequests.*;
import com.thors.module.account.entity.Account;
import com.thors.module.account.mapper.AccountMapper;
import com.thors.module.account.repository.AccountRepository;
import com.thors.module.auth.repository.OtpRepository;
import com.thors.module.auth.service.AuthService;
import java.util.List;
import java.util.Objects;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService {
  private static final List<String> MANAGED_ROLES = List.of("STAFF", "FAMILY_MEMBER");
  private static final List<String> ROLES =
          List.of("ADMIN", "OWNER", "FAMILY_MEMBER", "STAFF", "CUSTOMER");
  private static final List<String> STATUSES =
          List.of("PENDING_VERIFICATION", "ACTIVE", "LOCKED", "DISABLED");
  private static final int MAX_PAGE_SIZE = 100;

  private final AccountRepository users;
  private final OtpRepository codes;
  private final PasswordEncoder passwords;

  public AccountService(AccountRepository users, OtpRepository codes, PasswordEncoder passwords) {
    this.users = users;
    this.codes = codes;
    this.passwords = passwords;
  }

  // ---------------------------------------------------------------- View / Update Profile

  /** View Profile: thông tin của chính người đang đăng nhập. */
  public AccountDetail profile(Account actor) {
    return detail(users.byId(actor.id()).orElseThrow());
  }

  /**
   * Update Profile: tên, số điện thoại, địa chỉ, ảnh đại diện. Email không đổi được. Trường null =
   * giữ nguyên; address/avatarUrl là chuỗi rỗng = xóa; phone để trống = giữ nguyên.
   */
  @Transactional
  public AccountDetail updateProfile(Account actor, UpdateProfile r) {
    boolean phoneChanges = r.phone() != null && !r.phone().isBlank();
    if (phoneChanges) users.lockIdentityRegistry(); // tuần tự hóa việc kiểm tra trùng số điện thoại
    var a = users.lock(actor.id());
    String name = ContactNormalizer.name(r.fullName());
    String phone = phoneChanges ? ContactNormalizer.phone(r.phone()) : a.phone();
    String address = r.address() == null ? a.address() : emptyToNull(r.address());
    String avatar = r.avatarUrl() == null ? a.avatarUrl() : avatarUrl(r.avatarUrl());
    users.updateProfile(a.id(), name, phone, address, avatar);
    users.audit(a.id(), "PROFILE_UPDATE", a.id(), "Profile information updated");
    return detail(users.byId(a.id()).orElseThrow());
  }

  /** Giữ lại cho client cũ: thêm số điện thoại khi tài khoản chưa có. */
  @Transactional
  public Account phone(Account actor, String input) {
    users.lockIdentityRegistry();
    var a = users.lock(actor.id());
    if (a.phone() != null)
      throw new ApiException(400, "PHONE_EXISTS", "Tài khoản đã có số điện thoại.");
    String p = ContactNormalizer.phone(input);
    if (p == null) throw new ApiException(400, "PHONE", "Nhập số điện thoại.");
    users.addPhone(a.id(), p);
    users.audit(a.id(), "PHONE_ADDED", a.id(), "Phone added");
    return users.byId(a.id()).orElseThrow();
  }

  // ---------------------------------------------------------------- Lists and details

  /**
   * View Staff List (Owner) và View Account List (Admin). Admin thấy mọi tài khoản; Owner chỉ thấy
   * STAFF và FAMILY_MEMBER do mình tạo. Có tìm kiếm (q), lọc role/status và phân trang.
   */
  public AccountPage list(
          Account actor, String q, String role, String status, int page, int size) {
    manager(actor);
    if (page < 0) throw new ApiException(400, "PAGE", "Trang không hợp lệ.");
    if (size < 1 || size > MAX_PAGE_SIZE)
      throw new ApiException(400, "PAGE_SIZE", "Kích thước trang phải từ 1 đến " + MAX_PAGE_SIZE + ".");
    role = emptyToNull(role);
    status = emptyToNull(status);
    q = emptyToNull(q);
    if (role != null && !ROLES.contains(role))
      throw new ApiException(400, "ROLE_FILTER", "Vai trò lọc không hợp lệ.");
    if (status != null && !STATUSES.contains(status))
      throw new ApiException(400, "STATUS_FILTER", "Trạng thái lọc không hợp lệ.");
    if (q != null && q.length() > 100)
      throw new ApiException(400, "QUERY", "Từ khóa tìm kiếm quá dài.");
    var result = users.search(actor, q, role, status, page, size);
    int totalPages = (int) ((result.total() + size - 1) / size);
    return new AccountPage(
            result.items().stream().map(AccountMapper::view).toList(),
            page,
            size,
            result.total(),
            totalPages);
  }

  /** Số lượng tài khoản theo trạng thái/vai trò cho các thẻ thống kê (cùng phạm vi với danh sách). */
  public AccountSummary summary(Account actor) {
    manager(actor);
    return users.summary(actor);
  }

  /** View Staff Details. */
  public AccountDetail detail(Account actor, int id) {
    manager(actor);
    var a =
            users
                    .byId(id)
                    .orElseThrow(
                            () -> new ApiException(404, "ACCOUNT_NOT_FOUND", "Không tìm thấy tài khoản."));
    ownership(actor, a);
    return detail(a);
  }

  // ---------------------------------------------------------------- Create

  /** Create Staff Account: Owner tạo STAFF/FAMILY_MEMBER; Admin chỉ tạo OWNER. Tài khoản ACTIVE ngay. */
  @Transactional
  public Account create(Account actor, Create r) {
    manager(actor);
    boolean allowed =
            "ADMIN".equals(actor.role())
                    ? "OWNER".equals(r.role())
                    : MANAGED_ROLES.contains(r.role());
    if (!allowed) throw new ApiException(403, "ROLE", "Không được tạo vai trò này.");
    AuthService.confirm(r.password(), r.confirmPassword());
    return users.create(
            r.role(),
            ContactNormalizer.name(r.fullName()),
            passwords.encode(r.password()),
            ContactNormalizer.email(r.email()),
            ContactNormalizer.phone(r.phone()),
            "ACTIVE",
            actor.id(),
            null,
            false);
  }

  @Transactional
  public Account edit(Account actor, int id, Edit r) {
    var target = target(actor, id);
    users.name(id, ContactNormalizer.name(r.fullName()));
    if (r.status() != null) applyStatus(actor, target, r.status());
    users.audit(actor.id(), "ACCOUNT_EDIT", id, "Account details/status updated");
    return users.byId(id).orElseThrow();
  }

  // ---------------------------------------------------------------- Status, lock / unlock

  /**
   * Change Staff Account Status. Owner chỉ kích hoạt (ACTIVE) hoặc vô hiệu hóa (DISABLED) tài khoản
   * mình tạo; khóa (LOCKED) chỉ Admin được làm.
   */
  @Transactional
  public Account changeStatus(Account actor, int id, String status) {
    applyStatus(actor, target(actor, id), status);
    return users.byId(id).orElseThrow();
  }

  /** Lock Account (Admin). Tài khoản bị khóa không đăng nhập được cho đến khi được mở khóa. */
  @Transactional
  public Account lock(Account actor, int id) {
    admin(actor);
    return changeStatus(actor, id, "LOCKED");
  }

  /** Unlock Account (Admin). Chỉ áp dụng cho tài khoản đang LOCKED. */
  @Transactional
  public Account unlock(Account actor, int id) {
    admin(actor);
    var target = target(actor, id);
    if (!"LOCKED".equals(target.status()))
      throw new ApiException(400, "NOT_LOCKED", "Tài khoản không ở trạng thái khóa.");
    applyStatus(actor, target, "ACTIVE");
    return users.byId(id).orElseThrow();
  }

  /** Dùng chung cho edit, changeStatus, lock và unlock. Cùng trạng thái thì không làm gì. */
  private void applyStatus(Account actor, Account target, String status) {
    if (status.equals(target.status())) return;
    if (target.id() == actor.id())
      throw new ApiException(
              400, "SELF_LOCK", "Không thể thay trạng thái tài khoản của chính mình.");
    if (!List.of("ACTIVE", "LOCKED", "DISABLED").contains(status))
      throw new ApiException(400, "STATUS", "Trạng thái không hợp lệ.");
    if (!"ADMIN".equals(actor.role())) {
      if ("LOCKED".equals(status))
        throw new ApiException(403, "LOCK_ADMIN_ONLY", "Chỉ quản trị viên được khóa tài khoản.");
      if ("LOCKED".equals(target.status()))
        throw new ApiException(
                403, "LOCKED_BY_ADMIN", "Tài khoản đang bị quản trị viên khóa, chỉ Admin mở khóa được.");
    }
    users.status(target.id(), status);
    codes.invalidateAll(target.id());
    users.audit(
            actor.id(),
            statusAction(target.status(), status),
            target.id(),
            target.status() + " -> " + status);
  }

  private static String statusAction(String from, String to) {
    if ("LOCKED".equals(to)) return "ACCOUNT_LOCK";
    if ("LOCKED".equals(from) && "ACTIVE".equals(to)) return "ACCOUNT_UNLOCK";
    if ("DISABLED".equals(to)) return "ACCOUNT_DEACTIVATE";
    return "ACCOUNT_ACTIVATE";
  }

  // ---------------------------------------------------------------- Reset password

  /**
   * Reset Shop Owner Password (Admin): chỉ khi Owner đã gửi yêu cầu. Owner cũng đặt lại được mật
   * khẩu cho STAFF/FAMILY_MEMBER do mình tạo (không cần yêu cầu).
   */
  @Transactional
  public void resetByManager(Account actor, int id, Password r) {
    var target = target(actor, id);
    boolean admin = "ADMIN".equals(actor.role());
    boolean allowed = admin ? "OWNER".equals(target.role()) : MANAGED_ROLES.contains(target.role());
    if (!allowed)
      throw new ApiException(
              403, "RESET_ROLE", "Vai trò này cần khôi phục mật khẩu theo luồng riêng.");
    if (admin && !users.hasOpenResetRequest(id))
      throw new ApiException(
              400, "NO_RESET_REQUEST", "Chủ cửa hàng chưa gửi yêu cầu đặt lại mật khẩu.");
    AuthService.confirm(r.password(), r.confirmPassword());
    users.password(id, passwords.encode(r.password()), false);
    codes.invalidateAll(id);
    users.audit(
            actor.id(),
            "PASSWORD_RESET_ADMIN",
            id,
            "Password replaced by " + actor.role() + "; sessions revoked");
  }

  /** Owner quên mật khẩu gửi yêu cầu (chưa đăng nhập). Luôn im lặng để không lộ tài khoản có tồn tại. */
  @Transactional
  public void requestOwnerReset(String identifier) {
    java.util.Optional<Account> found;
    try {
      found = users.byIdentifier(ContactNormalizer.identifier(identifier));
    } catch (ApiException e) {
      return;
    }
    if (found.isEmpty()) return;
    var a = found.get();
    if (!"OWNER".equals(a.role()) || !a.active() || users.hasOpenResetRequest(a.id())) return;
    users.audit(null, "PASSWORD_RESET_REQUEST", a.id(), "Shop Owner submitted a password reset request");
  }

  /** Danh sách yêu cầu đặt lại mật khẩu của Owner chưa được xử lý (Admin). */
  public List<AccountRepository.OpenResetRequest> resetRequests(Account actor) {
    admin(actor);
    return users.openResetRequests();
  }

  // ---------------------------------------------------------------- helpers

  private AccountDetail detail(Account a) {
    String creator =
            a.createdBy() == null
                    ? null
                    : users.byId(a.createdBy()).map(Account::fullName).orElse(null);
    return new AccountDetail(
            a.id(),
            a.role(),
            a.fullName(),
            a.email(),
            a.phone(),
            a.address(),
            a.avatarUrl(),
            a.status(),
            a.googleSubject() != null,
            !a.passwordHash().startsWith("!"),
            a.createdAt(),
            a.createdBy(),
            creator);
  }

  private Account target(Account actor, int id) {
    manager(actor);
    var a = users.lock(id);
    ownership(actor, a);
    return a;
  }

  /** OWNER chỉ được xem/quản lý STAFF và FAMILY_MEMBER do chính mình tạo; ADMIN không bị giới hạn. */
  private void ownership(Account actor, Account a) {
    if ("OWNER".equals(actor.role())
            && (!Objects.equals(a.createdBy(), actor.id()) || !MANAGED_ROLES.contains(a.role())))
      throw new ApiException(403, "OWNERSHIP", "Không được quản lý tài khoản này.");
  }

  private void manager(Account actor) {
    if (!List.of("ADMIN", "OWNER").contains(actor.role()))
      throw new ApiException(403, "ROLE", "Không có quyền quản lý tài khoản.");
  }

  private void admin(Account actor) {
    if (!"ADMIN".equals(actor.role()))
      throw new ApiException(403, "ROLE", "Chỉ quản trị viên được thực hiện thao tác này.");
  }

  private static String emptyToNull(String v) {
    if (v == null) return null;
    var s = v.trim();
    return s.isEmpty() ? null : s;
  }

  private static String avatarUrl(String v) {
    String s = emptyToNull(v);
    if (s == null) return null;
    if (s.length() > 500 || !s.startsWith("https://"))
      throw new ApiException(400, "AVATAR_URL", "Đường dẫn ảnh đại diện không hợp lệ.");
    return s;
  }
}