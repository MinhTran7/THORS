package com.thors.module.account;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.thors.common.ApiException;
import com.thors.module.account.dto.AccountDetail;
import com.thors.module.account.dto.AccountPage;
import com.thors.module.account.dto.AccountRequests.Create;
import com.thors.module.account.dto.AccountRequests.Edit;
import com.thors.module.account.dto.AccountRequests.Password;
import com.thors.module.account.dto.AccountRequests.UpdateProfile;
import com.thors.module.account.dto.AccountSummary;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AccountRepository;
import com.thors.module.account.repository.AccountRepository.OpenResetRequest;
import com.thors.module.account.repository.PasswordChangeRequirementRepository;
import com.thors.module.account.service.AccountService;
import com.thors.module.auth.repository.OtpRepository;
import com.thors.module.notification.service.NotificationPublisher;
import com.thors.module.notification.service.NotificationTypes;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Unit test cho AccountService theo sheet "Account" của Report-5.1_Unit Test (UTC-ACC-001..080). Mỗi
 * test mang đúng mã Test Case ID trong sheet.
 */
@DisplayName("AccountService Unit Test")
class AccountServiceUnitTest {
  private static final LocalDateTime CREATED = LocalDateTime.of(2026, 11, 1, 9, 0);
  private static final String HASH = "$2a$10$hash";
  private static final String PHONE_MESSAGE = "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.";

  private AccountRepository users;
  private OtpRepository codes;
  private PasswordEncoder passwords;
  private NotificationPublisher notices;
  private PasswordChangeRequirementRepository passwordChanges;
  private AccountService service;

  private final Account admin = account(1, "ADMIN", "ACTIVE", null);
  private final Account owner = account(2, "OWNER", "ACTIVE", 1);

  @BeforeEach
  void setUp() {
    users = mock(AccountRepository.class);
    codes = mock(OtpRepository.class);
    passwords = mock(PasswordEncoder.class);
    notices = mock(NotificationPublisher.class);
    when(passwords.encode(anyString())).thenAnswer(i -> "bcrypt:" + i.getArgument(0));
    passwordChanges = mock(PasswordChangeRequirementRepository.class);
    service = new AccountService(users, codes, passwords, notices, passwordChanges);
  }

  // ------------------------------------------------------------------ helpers

  private static Account account(int id, String role, String status, Integer createdBy) {
    return new Account(id, role, "User " + id, HASH, "user" + id + "@shop.com", null, null, null,
            status, CREATED, CREATED, null, 0, createdBy);
  }

  private static Account withPhone(Account a, String phone) {
    return new Account(a.id(), a.role(), a.fullName(), a.passwordHash(), a.email(), phone,
            a.address(), a.avatarUrl(), a.status(), a.createdAt(), a.emailVerifiedAt(),
            a.googleSubject(), a.authVersion(), a.createdBy());
  }

  private static Account withAddress(Account a, String address) {
    return new Account(a.id(), a.role(), a.fullName(), a.passwordHash(), a.email(), a.phone(),
            address, a.avatarUrl(), a.status(), a.createdAt(), a.emailVerifiedAt(),
            a.googleSubject(), a.authVersion(), a.createdBy());
  }

  private static Account withAvatar(Account a, String avatar) {
    return new Account(a.id(), a.role(), a.fullName(), a.passwordHash(), a.email(), a.phone(),
            a.address(), avatar, a.status(), a.createdAt(), a.emailVerifiedAt(),
            a.googleSubject(), a.authVersion(), a.createdBy());
  }

  /** Tài khoản đang được thao tác: lock(id) và byId(id) đều trả về nó. */
  private Account stored(Account a) {
    when(users.lock(a.id())).thenReturn(a);
    when(users.byId(a.id())).thenReturn(Optional.of(a));
    return a;
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

  private static AccountRepository.Page page(int count, long total) {
    var items = IntStream.rangeClosed(1, count)
            .mapToObj(i -> account(100 + i, "FAMILY_MEMBER", "ACTIVE", 2)).toList();
    return new AccountRepository.Page(items, total);
  }

  // ------------------------------------------------------------------ profile

  @Nested
  @DisplayName("profile(Account actor)")
  class Profile {
    @Test
    @DisplayName("UTC-ACC-001: FAMILY_MEMBER đủ thông tin, createdBy là Owner đang hoạt động")
    void acc001() {
      var member = new Account(10, "FAMILY_MEMBER", "Le Thi Gia Dinh", HASH, "family@shop.com", "+84912345678",
              "123 Le Loi", null, "ACTIVE", CREATED, CREATED, "google-sub", 0, 2);
      var creator = new Account(2, "OWNER", "Tên Owner", HASH, "owner@shop.com", null, null, null,
              "ACTIVE", CREATED, CREATED, null, 0, 1);
      when(users.byId(10)).thenReturn(Optional.of(member));
      when(users.byId(2)).thenReturn(Optional.of(creator));

      AccountDetail d = service.profile(account(10, "FAMILY_MEMBER", "ACTIVE", 2));

      assertEquals(10, d.id());
      assertEquals("FAMILY_MEMBER", d.role());
      assertTrue(d.googleLinked());
      assertTrue(d.passwordEnabled());
      assertEquals(2, d.createdById());
      assertEquals("Tên Owner", d.createdByName());
    }

    @Test
    @DisplayName("UTC-ACC-002: CUSTOMER tự đăng ký, createdBy = null")
    void acc002() {
      stored(account(20, "CUSTOMER", "ACTIVE", null));

      AccountDetail d = service.profile(account(20, "CUSTOMER", "ACTIVE", null));

      assertEquals(20, d.id());
      assertNull(d.createdById());
      assertNull(d.createdByName());
      verify(users, times(1)).byId(anyInt()); // không tìm người tạo
    }

    @Test
    @DisplayName("UTC-ACC-003: người tạo (id=99) đã bị xóa khỏi DB")
    void acc003() {
      stored(account(11, "FAMILY_MEMBER", "ACTIVE", 99));
      when(users.byId(99)).thenReturn(Optional.empty());

      AccountDetail d = assertDoesNotThrow(() -> service.profile(account(11, "FAMILY_MEMBER", "ACTIVE", 99)));

      assertEquals(11, d.id());
      assertEquals(99, d.createdById());
      assertNull(d.createdByName());
    }

    @Test
    @DisplayName("UTC-ACC-004: tài khoản Google, passwordHash bắt đầu bằng '!'")
    void acc004() {
      var google = new Account(15, "CUSTOMER", "Google User", "!GOOGLE_AUTH", "g@gmail.com", null,
              null, null, "ACTIVE", CREATED, CREATED, "google-sub", 0, null);
      when(users.byId(15)).thenReturn(Optional.of(google));

      AccountDetail d = service.profile(google);

      assertEquals(15, d.id());
      assertFalse(d.passwordEnabled());
      assertTrue(d.googleLinked());
    }

    @Test
    @DisplayName("UTC-ACC-005: actor không còn trong DB")
    void acc005() {
      when(users.byId(9999)).thenReturn(Optional.empty());

      assertThrows(NoSuchElementException.class,
              () -> service.profile(account(9999, "CUSTOMER", "ACTIVE", null)));
    }
  }

  // ------------------------------------------------------------------ updateProfile

  @Nested
  @DisplayName("updateProfile(Account actor, UpdateProfile r)")
  class UpdateProfileTests {
    private final Account me =
            withAddress(withPhone(account(10, "FAMILY_MEMBER", "ACTIVE", 2), "0901112233"), "Địa chỉ cũ");

    @BeforeEach
    void storeMe() {
      stored(me);
    }

    @Test
    @DisplayName("UTC-ACC-006: đổi tên, số điện thoại mới, địa chỉ mới")
    void acc006() {
      var r = new UpdateProfile("Nguyen Van B", "0912345678", "123 Le Loi, Q1, HCMC");

      assertNotNull(service.updateProfile(me, r));

      verify(users).lockIdentityRegistry();
      verify(users).updateProfile(10, "Nguyen Van B", "0912345678", "123 Le Loi, Q1, HCMC");
      verify(users).audit(eq(10), eq("PROFILE_UPDATE"), eq(10), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-007: address rỗng thì xóa địa chỉ, phone null giữ số cũ")
    void acc007() {
      service.updateProfile(me, new UpdateProfile("Nguyen Van B", null, ""));

      verify(users).updateProfile(10, "Nguyen Van B", "0901112233", null);
      verify(users).audit(eq(10), eq("PROFILE_UPDATE"), eq(10), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-008: phone toàn khoảng trắng thì giữ số cũ")
    void acc008() {
      service.updateProfile(me, new UpdateProfile("Nguyen Van B", "   ", null));

      verify(users, never()).lockIdentityRegistry();
      verify(users).updateProfile(10, "Nguyen Van B", "0901112233", "Địa chỉ cũ");
      verify(users).audit(eq(10), eq("PROFILE_UPDATE"), eq(10), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-009: fullName đúng 100 ký tự")
    void acc009() {
      String name = "a".repeat(100);

      service.updateProfile(me, new UpdateProfile(name, null, null));

      verify(users).updateProfile(10, name, "0901112233", "Địa chỉ cũ");
      verify(users).audit(eq(10), eq("PROFILE_UPDATE"), eq(10), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-010: address đúng 255 ký tự")
    void acc010() {
      String address = "x".repeat(255);

      service.updateProfile(me, new UpdateProfile("Tran Van A", null, address));

      verify(users).updateProfile(10, "Tran Van A", "0901112233", address);
      verify(users).audit(eq(10), eq("PROFILE_UPDATE"), eq(10), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-011: fullName chỉ có khoảng trắng")
    void acc011() {
      api(400, "NAME", "Họ tên cần 1–100 ký tự.",
              () -> service.updateProfile(me, new UpdateProfile("   ", null, null)));
      verify(users, never()).updateProfile(anyInt(), any(), any(), any());
      verify(users, never()).audit(any(), anyString(), anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-012: fullName 101 ký tự")
    void acc012() {
      api(400, "NAME", "Họ tên cần 1–100 ký tự.",
              () -> service.updateProfile(me, new UpdateProfile("a".repeat(101), null, null)));
      verify(users, never()).updateProfile(anyInt(), any(), any(), any());
      verify(users, never()).audit(any(), anyString(), anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-013: số điện thoại chứa chữ cái")
    void acc013() {
      api(400, "PHONE", PHONE_MESSAGE,
              () -> service.updateProfile(me, new UpdateProfile("Tran Van A", "0912abc345", null)));
      verify(users, never()).updateProfile(anyInt(), any(), any(), any());
      verify(users, never()).audit(any(), anyString(), anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-014: số điện thoại không bắt đầu bằng 0")
    void acc014() {
      api(400, "PHONE", PHONE_MESSAGE,
              () -> service.updateProfile(me, new UpdateProfile("Tran Van A", "1912345678", null)));
      verify(users, never()).updateProfile(anyInt(), any(), any(), any());
      verify(users, never()).audit(any(), anyString(), anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-015: số điện thoại có 9 chữ số")
    void acc015() {
      api(400, "PHONE", PHONE_MESSAGE,
              () -> service.updateProfile(me, new UpdateProfile("Tran Van A", "091234567", null)));
      verify(users, never()).updateProfile(anyInt(), any(), any(), any());
      verify(users, never()).audit(any(), anyString(), anyInt(), anyString());
    }
  }

  // ------------------------------------------------------------------ setAvatar

  @Nested
  @DisplayName("setAvatar(Account actor, String url)")
  class SetAvatar {
    private final Account me =
            withAvatar(account(10, "FAMILY_MEMBER", "ACTIVE", 2), "https://res.cloudinary.com/old.png");

    @Test
    @DisplayName("UTC-ACC-016: đổi avatar, trả về link ảnh cũ")
    void acc016() {
      stored(me);

      String old = service.setAvatar(me, "https://res.cloudinary.com/new.png");

      assertEquals("https://res.cloudinary.com/old.png", old);
      verify(users).avatar(10, "https://res.cloudinary.com/new.png");
      verify(users).audit(10, "PROFILE_UPDATE", 10, "Avatar updated");
    }

    @Test
    @DisplayName("UTC-ACC-017: xóa avatar (url = null)")
    void acc017() {
      stored(me);

      String old = service.setAvatar(me, null);

      assertEquals("https://res.cloudinary.com/old.png", old);
      verify(users).avatar(10, null);
      verify(users).audit(10, "PROFILE_UPDATE", 10, "Avatar removed");
    }
  }

  // ------------------------------------------------------------------ phone

  @Nested
  @DisplayName("phone(Account actor, String input)")
  class PhoneTests {
    @Test
    @DisplayName("UTC-ACC-018: chưa có số, thêm số hợp lệ")
    void acc018() {
      var me = stored(account(10, "FAMILY_MEMBER", "ACTIVE", 2));

      assertNotNull(service.phone(me, "0988776655"));

      verify(users).lockIdentityRegistry();
      verify(users).addPhone(10, "0988776655");
      verify(users).audit(10, "PHONE_ADDED", 10, "Phone added");
    }

    @Test
    @DisplayName("UTC-ACC-019: đã có số điện thoại")
    void acc019() {
      var me = stored(withPhone(account(10, "FAMILY_MEMBER", "ACTIVE", 2), "0901234567"));

      api(400, "PHONE_EXISTS", "Tài khoản đã có số điện thoại.",
              () -> service.phone(me, "0988776655"));
      verify(users, never()).addPhone(anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-020: input để trống")
    void acc020() {
      var me = stored(account(10, "FAMILY_MEMBER", "ACTIVE", 2));

      api(400, "PHONE", "Nhập số điện thoại.", () -> service.phone(me, "   "));
      verify(users, never()).addPhone(anyInt(), anyString());
    }
  }

  // ------------------------------------------------------------------ list

  @Nested
  @DisplayName("list(Account actor, String q, String role, String status, int page, int size)")
  class ListTests {
    @Test
    @DisplayName("UTC-ACC-021: Admin, 50 tài khoản, trang đầu size 20")
    void acc021() {
      when(users.search(admin, null, null, null, 0, 20)).thenReturn(page(20, 50));

      AccountPage p = service.list(admin, null, null, null, 0, 20);

      assertEquals(20, p.items().size());
      assertEquals(0, p.page());
      assertEquals(20, p.size());
      assertEquals(50, p.total());
      assertEquals(3, p.totalPages());
    }

    @Test
    @DisplayName("UTC-ACC-022: Owner lọc FAMILY_MEMBER đang ACTIVE do mình tạo")
    void acc022() {
      // 3 FAMILY_MEMBER do Owner tạo, chỉ 2 đang ACTIVE khớp bộ lọc
      when(users.search(owner, null, "FAMILY_MEMBER", "ACTIVE", 0, 10)).thenReturn(page(2, 2));

      AccountPage p = service.list(owner, null, "FAMILY_MEMBER", "ACTIVE", 0, 10);

      verify(users).search(owner, null, "FAMILY_MEMBER", "ACTIVE", 0, 10);
      assertEquals(2, p.items().size());
      assertEquals(2, p.total());
      assertTrue(p.items().stream().allMatch(v -> "ACTIVE".equals(v.status())));
      assertTrue(p.items().stream().allMatch(v -> "FAMILY_MEMBER".equals(v.role())));
    }

    @Test
    @DisplayName("UTC-ACC-023: tìm theo từ khóa q = 'nguyen'")
    void acc023() {
      when(users.search(admin, "nguyen", null, null, 0, 10)).thenReturn(page(2, 2));

      AccountPage p = service.list(admin, "nguyen", null, null, 0, 10);

      verify(users).search(admin, "nguyen", null, null, 0, 10);
      assertEquals(2, p.items().size());
      assertEquals(2, p.total());
    }

    @Test
    @DisplayName("UTC-ACC-024: size = 100 (biên trên)")
    void acc024() {
      when(users.search(admin, null, null, null, 0, 100)).thenReturn(page(50, 50));

      AccountPage p = service.list(admin, null, null, null, 0, 100);

      assertEquals(100, p.size());
      assertEquals(50, p.total());
      assertEquals(1, p.totalPages());
    }

    @Test
    @DisplayName("UTC-ACC-025: page = 0, size = 1 (biên dưới)")
    void acc025() {
      when(users.search(admin, null, null, null, 0, 1)).thenReturn(page(1, 50));

      AccountPage p = service.list(admin, null, null, null, 0, 1);

      assertEquals(1, p.items().size());
      assertEquals(1, p.size());
      assertEquals(50, p.total());
      assertEquals(50, p.totalPages());
    }

    @Test
    @DisplayName("UTC-ACC-026: q đúng 100 ký tự")
    void acc026() {
      String q = "a".repeat(100);
      when(users.search(admin, q, null, null, 0, 20)).thenReturn(page(0, 0));

      assertDoesNotThrow(() -> service.list(admin, q, null, null, 0, 20));
      verify(users).search(admin, q, null, null, 0, 20);
    }

    @Test
    @DisplayName("UTC-ACC-027: CUSTOMER không có quyền")
    void acc027() {
      api(403, "ROLE", "Không có quyền quản lý tài khoản.",
              () -> service.list(account(5, "CUSTOMER", "ACTIVE", null), null, null, null, 0, 20));
      verifyNoInteractions(users);
    }

    @Test
    @DisplayName("UTC-ACC-028: page = -1")
    void acc028() {
      api(400, "PAGE", "Trang không hợp lệ.",
              () -> service.list(admin, null, null, null, -1, 20));
      verifyNoInteractions(users);
    }

    @Test
    @DisplayName("UTC-ACC-029: size = 0")
    void acc029() {
      api(400, "PAGE_SIZE", "Kích thước trang phải từ 1 đến 100.",
              () -> service.list(admin, null, null, null, 0, 0));
      verifyNoInteractions(users);
    }

    @Test
    @DisplayName("UTC-ACC-030: size = 101")
    void acc030() {
      api(400, "PAGE_SIZE", "Kích thước trang phải từ 1 đến 100.",
              () -> service.list(admin, null, null, null, 0, 101));
      verifyNoInteractions(users);
    }

    @Test
    @DisplayName("UTC-ACC-031: role lọc không tồn tại ('SUPERUSER')")
    void acc031() {
      api(400, "ROLE_FILTER", "Vai trò lọc không hợp lệ.",
              () -> service.list(admin, null, "SUPERUSER", null, 0, 20));
      verifyNoInteractions(users);
    }

    @Test
    @DisplayName("UTC-ACC-032: status lọc không tồn tại ('BANNED')")
    void acc032() {
      api(400, "STATUS_FILTER", "Trạng thái lọc không hợp lệ.",
              () -> service.list(admin, null, null, "BANNED", 0, 20));
      verifyNoInteractions(users);
    }

    @Test
    @DisplayName("UTC-ACC-033: q 101 ký tự")
    void acc033() {
      api(400, "QUERY", "Từ khóa tìm kiếm quá dài.",
              () -> service.list(admin, "a".repeat(101), null, null, 0, 20));
      verifyNoInteractions(users);
    }
  }

  // ------------------------------------------------------------------ summary

  @Nested
  @DisplayName("summary(Account actor)")
  class SummaryTests {
    @Test
    @DisplayName("UTC-ACC-034: Owner xem thống kê trong phạm vi của mình")
    void acc034() {
      var expected = new AccountSummary(5, Map.of("ACTIVE", 5L), Map.of("FAMILY_MEMBER", 5L));
      when(users.summary(owner)).thenReturn(expected);

      AccountSummary s = service.summary(owner);

      verify(users).summary(owner);
      assertSame(expected, s);
      assertEquals(5, s.total());
      assertEquals(5L, s.byStatus().get("ACTIVE"));
      assertEquals(5L, s.byRole().get("FAMILY_MEMBER"));
    }

    @Test
    @DisplayName("UTC-ACC-035: CUSTOMER không có quyền")
    void acc035() {
      api(403, "ROLE", "Không có quyền quản lý tài khoản.",
              () -> service.summary(account(10, "CUSTOMER", "ACTIVE", null)));
      verifyNoInteractions(users);
    }
  }

  // ------------------------------------------------------------------ detail

  @Nested
  @DisplayName("detail(Account actor, int id)")
  class DetailTests {
    @Test
    @DisplayName("UTC-ACC-036: Admin xem tài khoản bất kỳ")
    void acc036() {
      stored(account(10, "FAMILY_MEMBER", "ACTIVE", 2));
      when(users.byId(2)).thenReturn(Optional.of(owner));

      AccountDetail d = service.detail(admin, 10);

      assertEquals(10, d.id());
      assertEquals(2, d.createdById());
      assertEquals("User 2", d.createdByName());
    }

    @Test
    @DisplayName("UTC-ACC-037: Owner xem FAMILY_MEMBER do mình tạo")
    void acc037() {
      stored(account(10, "FAMILY_MEMBER", "ACTIVE", 2));
      when(users.byId(2)).thenReturn(Optional.of(owner));

      AccountDetail d = service.detail(owner, 10);

      assertEquals(10, d.id());
      assertEquals("FAMILY_MEMBER", d.role());
      assertEquals(2, d.createdById());
    }

    @Test
    @DisplayName("UTC-ACC-038: Owner xem FAMILY_MEMBER do Owner khác tạo")
    void acc038() {
      stored(account(20, "FAMILY_MEMBER", "ACTIVE", 3));

      api(403, "OWNERSHIP", "Không được quản lý tài khoản này.", () -> service.detail(owner, 20));
    }

    @Test
    @DisplayName("UTC-ACC-039: Owner xem tài khoản CUSTOMER")
    void acc039() {
      stored(account(30, "CUSTOMER", "ACTIVE", null));

      api(403, "OWNERSHIP", "Không được quản lý tài khoản này.", () -> service.detail(owner, 30));
    }

    @Test
    @DisplayName("UTC-ACC-040: id không tồn tại")
    void acc040() {
      when(users.byId(99999)).thenReturn(Optional.empty());

      api(404, "ACCOUNT_NOT_FOUND", "Không tìm thấy tài khoản.", () -> service.detail(admin, 99999));
    }

    @Test
    @DisplayName("UTC-ACC-068: Owner xem CUSTOMER có createdBy là chính mình")
    void acc068() {
      stored(account(31, "CUSTOMER", "ACTIVE", 2));

      api(403, "OWNERSHIP", "Không được quản lý tài khoản này.", () -> service.detail(owner, 31));
    }
  }

  // ------------------------------------------------------------------ create

  @Nested
  @DisplayName("create(Account actor, Create r)")
  class CreateTests {
    @BeforeEach
    void repoReturnsCreated() {
      when(users.create(anyString(), anyString(), anyString(), anyString(), any(), anyString(),
              any(), any(), anyBoolean()))
              .thenAnswer(i -> account(50, i.getArgument(0), i.getArgument(5), i.getArgument(6)));
    }

    @Test
    @DisplayName("UTC-ACC-041: Admin tạo OWNER")
    void acc041() {
      var r = new Create("OWNER", "Nguyen Chu Shop", "owner2@shop.com", "0909090909",
              "Password123!", "Password123!");

      Account created = service.create(admin, r);

      assertEquals("OWNER", created.role());
      assertEquals("PENDING_VERIFICATION", created.status());
      verify(users).create("OWNER", "Nguyen Chu Shop", "bcrypt:Password123!", "owner2@shop.com",
              "0909090909", "PENDING_VERIFICATION", 1, null, false);
      verify(passwordChanges).require(50); // bắt đổi mật khẩu ở lần đăng nhập đầu
    }

    @Test
    @DisplayName("UTC-ACC-042: Owner tạo FAMILY_MEMBER không nhập số điện thoại")
    void acc042() {
      var r = new Create("FAMILY_MEMBER", "Le Thi Gia Dinh", "family2@shop.com", null,
              "Password123!", "Password123!");

      Account created = service.create(owner, r);

      assertEquals("FAMILY_MEMBER", created.role());
      assertEquals("PENDING_VERIFICATION", created.status());
      verify(users).create("FAMILY_MEMBER", "Le Thi Gia Dinh", "bcrypt:Password123!", "family2@shop.com",
              null, "PENDING_VERIFICATION", 2, null, false);
    }

    @Test
    @DisplayName("UTC-ACC-043: Owner tạo FAMILY_MEMBER")
    void acc043() {
      var r = new Create("FAMILY_MEMBER", "Nguyen Gia Dinh", "family1@shop.com", "0911223355",
              "Password123!", "Password123!");

      Account created = service.create(owner, r);

      assertEquals("FAMILY_MEMBER", created.role());
      assertEquals("PENDING_VERIFICATION", created.status());
      verify(users).create("FAMILY_MEMBER", "Nguyen Gia Dinh", "bcrypt:Password123!", "family1@shop.com",
              "0911223355", "PENDING_VERIFICATION", 2, null, false);
    }

    @Test
    @DisplayName("UTC-ACC-043b: số điện thoại dạng +84 không còn được chấp nhận")
    void acc043b() {
      var r = new Create("FAMILY_MEMBER", "Nguyen Gia Dinh", "family1@shop.com", "+84911223355",
              "Password123!", "Password123!");

      api(400, "PHONE", PHONE_MESSAGE, () -> service.create(owner, r));
      verify(users, never()).create(any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean());
    }

    @Test
    @DisplayName("UTC-ACC-044: Admin tạo FAMILY_MEMBER (chỉ được tạo OWNER)")
    void acc044() {
      var r = new Create("FAMILY_MEMBER", "Le Thi Gia Dinh", "family@shop.com", "0911223344",
              "Password123!", "Password123!");

      api(403, "ROLE", "Không được tạo vai trò này.", () -> service.create(admin, r));
      verify(users, never()).create(any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean());
    }

    @Test
    @DisplayName("UTC-ACC-045: Owner tạo ADMIN")
    void acc045() {
      var r = new Create("ADMIN", "Hack Admin", "admin2@shop.com", "0911223344",
              "Password123!", "Password123!");

      api(403, "ROLE", "Không được tạo vai trò này.", () -> service.create(owner, r));
      verify(users, never()).create(any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean());
    }

    @Test
    @DisplayName("UTC-ACC-046: mật khẩu xác nhận không khớp")
    void acc046() {
      var r = new Create("FAMILY_MEMBER", "Le Thi Gia Dinh", "family@shop.com", "0911223344",
              "Password123!", "Different123!");

      api(400, "PASSWORD_CONFIRM", "Mật khẩu xác nhận không khớp.", () -> service.create(owner, r));
      verify(users, never()).create(any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean());
    }

    @Test
    @DisplayName("UTC-ACC-047: mật khẩu ngắn hơn 10 ký tự ('Pass1234!')")
    void acc047() {
      var r = new Create("FAMILY_MEMBER", "Le Thi Gia Dinh", "family@shop.com", "0911223344",
              "Pass1234!", "Pass1234!");

      api(400, "PASSWORD", "Mật khẩu cần 10–64 ký tự và tối đa 72 byte.", () -> service.create(owner, r));
      verify(users, never()).create(any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean());
    }

    @Test
    @DisplayName("UTC-ACC-048: mật khẩu đúng 10 ký tự (biên dưới hợp lệ)")
    void acc048() {
      var r = new Create("FAMILY_MEMBER", "Le Thi Gia Dinh", "family@shop.com", "0911223344",
              "1234567890", "1234567890");

      assertNotNull(service.create(owner, r));
      verify(users).create(eq("FAMILY_MEMBER"), anyString(), eq("bcrypt:1234567890"), anyString(), any(),
              eq("PENDING_VERIFICATION"), eq(2), isNull(), eq(false));
    }

    @Test
    @DisplayName("UTC-ACC-069: CUSTOMER tạo tài khoản")
    void acc069() {
      var r = new Create("FAMILY_MEMBER", "Le Thi Gia Dinh", "family@shop.com", "0911223344",
              "Password123!", "Password123!");

      api(403, "ROLE", "Không có quyền quản lý tài khoản.",
              () -> service.create(account(5, "CUSTOMER", "ACTIVE", null), r));
      verify(users, never()).create(any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean());
    }
  }

  // ------------------------------------------------------------------ edit

  @Nested
  @DisplayName("edit(Account actor, int id, Edit r)")
  class EditTests {
    @Test
    @DisplayName("UTC-ACC-049: Owner sửa tên FAMILY_MEMBER, status = null")
    void acc049() {
      stored(account(10, "FAMILY_MEMBER", "ACTIVE", 2));

      assertNotNull(service.edit(owner, 10, new Edit("Le Van C", null)));

      verify(users).name(10, "Le Van C");
      verify(users, never()).status(anyInt(), anyString());
      verify(users).audit(eq(2), eq("ACCOUNT_EDIT"), eq(10), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-050: Owner sửa tên và đổi FAMILY_MEMBER từ ACTIVE sang DISABLED")
    void acc050() {
      stored(account(10, "FAMILY_MEMBER", "ACTIVE", 2));

      service.edit(owner, 10, new Edit("Le Van C", "DISABLED"));

      verify(users).name(10, "Le Van C");
      verify(users).status(10, "DISABLED");
      verify(codes).invalidateAll(10);
      verify(users).audit(2, "ACCOUNT_DEACTIVATE", 10, "ACTIVE -> DISABLED");
      verify(users).audit(eq(2), eq("ACCOUNT_EDIT"), eq(10), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-070: status gửi lên trùng trạng thái hiện tại")
    void acc070() {
      stored(account(10, "FAMILY_MEMBER", "ACTIVE", 2));

      service.edit(owner, 10, new Edit("Le Van C", "ACTIVE"));

      verify(users).name(10, "Le Van C");
      verify(users, never()).status(anyInt(), anyString());
      verifyNoInteractions(codes);
      verify(users).audit(eq(2), eq("ACCOUNT_EDIT"), eq(10), anyString());
      verify(users, times(1)).audit(any(), anyString(), anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-071: status không hợp lệ thì không sửa tên")
    void acc071() {
      stored(account(10, "FAMILY_MEMBER", "ACTIVE", 2));

      api(400, "STATUS", "Trạng thái không hợp lệ.",
              () -> service.edit(owner, 10, new Edit("Le Van C", "SUSPENDED")));
      verify(users, never()).name(anyInt(), anyString());
      verify(users, never()).status(anyInt(), anyString());
    }
  }

  // ------------------------------------------------------------------ lock / unlock

  @Nested
  @DisplayName("lock / unlock")
  class LockTests {
    @Test
    @DisplayName("UTC-ACC-051: Admin khóa tài khoản đang ACTIVE")
    void acc051() {
      stored(account(10, "FAMILY_MEMBER", "ACTIVE", 2));

      service.lock(admin, 10);

      verify(users).status(10, "LOCKED");
      verify(codes).invalidateAll(10);
      verify(users).audit(1, "ACCOUNT_LOCK", 10, "ACTIVE -> LOCKED");
    }

    @Test
    @DisplayName("UTC-ACC-052: Admin mở khóa tài khoản đang LOCKED")
    void acc052() {
      stored(account(10, "FAMILY_MEMBER", "LOCKED", 2));

      service.unlock(admin, 10);

      verify(users).status(10, "ACTIVE");
      verify(codes).invalidateAll(10);
      verify(users).audit(1, "ACCOUNT_UNLOCK", 10, "LOCKED -> ACTIVE");
    }

    @Test
    @DisplayName("UTC-ACC-053: mở khóa tài khoản không bị khóa")
    void acc053() {
      stored(account(10, "FAMILY_MEMBER", "ACTIVE", 2));

      api(400, "NOT_LOCKED", "Tài khoản không ở trạng thái khóa.", () -> service.unlock(admin, 10));
      verify(users, never()).status(anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-072: Owner khóa tài khoản")
    void acc072() {
      stored(account(10, "FAMILY_MEMBER", "ACTIVE", 2));

      api(403, "ROLE", "Chỉ quản trị viên được thực hiện thao tác này.", () -> service.lock(owner, 10));
      verify(users, never()).status(anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-073: Owner mở khóa tài khoản")
    void acc073() {
      stored(account(10, "FAMILY_MEMBER", "LOCKED", 2));

      api(403, "ROLE", "Chỉ quản trị viên được thực hiện thao tác này.", () -> service.unlock(owner, 10));
      verify(users, never()).status(anyInt(), anyString());
    }
  }

  // ------------------------------------------------------------------ changeStatus

  @Nested
  @DisplayName("changeStatus(Account actor, int id, String status)")
  class ChangeStatusTests {
    @Test
    @DisplayName("UTC-ACC-054: tự đổi trạng thái của chính mình")
    void acc054() {
      stored(admin);

      api(400, "SELF_LOCK", "Không thể thay trạng thái tài khoản của chính mình.",
              () -> service.changeStatus(admin, 1, "DISABLED"));
      verify(users, never()).status(anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-055: kích hoạt tài khoản chưa xác minh")
    void acc055() {
      stored(account(10, "FAMILY_MEMBER", "PENDING_VERIFICATION", 2));

      api(400, "ACCOUNT_UNVERIFIED", "Tài khoản chưa xác minh, không thể kích hoạt thủ công.",
              () -> service.changeStatus(admin, 10, "ACTIVE"));
      verify(users, never()).status(anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-056: Owner khóa tài khoản (chỉ Admin được khóa)")
    void acc056() {
      stored(account(10, "FAMILY_MEMBER", "ACTIVE", 2));

      api(403, "LOCK_ADMIN_ONLY", "Chỉ quản trị viên được khóa tài khoản.",
              () -> service.changeStatus(owner, 10, "LOCKED"));
      verify(users, never()).status(anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-057: Owner mở tài khoản đang bị Admin khóa")
    void acc057() {
      stored(account(10, "FAMILY_MEMBER", "LOCKED", 2));

      api(403, "LOCKED_BY_ADMIN", "Tài khoản đang bị quản trị viên khóa, chỉ Admin mở khóa được.",
              () -> service.changeStatus(owner, 10, "ACTIVE"));
      verify(users, never()).status(anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-058: trạng thái không hợp lệ ('SUSPENDED')")
    void acc058() {
      stored(account(10, "FAMILY_MEMBER", "ACTIVE", 2));

      api(400, "STATUS", "Trạng thái không hợp lệ.",
              () -> service.changeStatus(admin, 10, "SUSPENDED"));
      verify(users, never()).status(anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-059: đổi sang đúng trạng thái hiện tại")
    void acc059() {
      var target = stored(account(10, "FAMILY_MEMBER", "ACTIVE", 2));

      assertSame(target, service.changeStatus(admin, 10, "ACTIVE"));

      verify(users, never()).status(anyInt(), anyString());
      verify(users, never()).audit(any(), anyString(), anyInt(), anyString());
      verifyNoInteractions(codes);
    }

    @Test
    @DisplayName("UTC-ACC-074: Owner kích hoạt lại FAMILY_MEMBER đang DISABLED")
    void acc074() {
      stored(account(10, "FAMILY_MEMBER", "DISABLED", 2));

      service.changeStatus(owner, 10, "ACTIVE");

      verify(users).status(10, "ACTIVE");
      verify(codes).invalidateAll(10);
      verify(users).audit(2, "ACCOUNT_ACTIVATE", 10, "DISABLED -> ACTIVE");
    }

    @Test
    @DisplayName("UTC-ACC-075: Admin đổi tài khoản đang LOCKED sang DISABLED")
    void acc075() {
      stored(account(10, "FAMILY_MEMBER", "LOCKED", 2));

      service.changeStatus(admin, 10, "DISABLED");

      verify(users).status(10, "DISABLED");
      verify(codes).invalidateAll(10);
      verify(users).audit(1, "ACCOUNT_DEACTIVATE", 10, "LOCKED -> DISABLED");
    }
  }

  // ------------------------------------------------------------------ resetByManager

  @Nested
  @DisplayName("resetByManager(Account actor, int id, Password r)")
  class ResetByManagerTests {
    @Test
    @DisplayName("UTC-ACC-060: Owner đặt lại mật khẩu cho FAMILY_MEMBER đang ACTIVE")
    void acc060() {
      stored(account(10, "FAMILY_MEMBER", "ACTIVE", 2));

      service.resetByManager(owner, 10, new Password("NewPassword123!", "NewPassword123!"));

      verify(users).password(10, "bcrypt:NewPassword123!", false);
      verify(users).status(10, "PENDING_VERIFICATION");
      verify(codes).invalidateAll(10);
      verify(users).audit(eq(2), eq("PASSWORD_RESET_ADMIN"), eq(10), anyString());
      verify(notices).toUser(eq(10), eq(NotificationTypes.ACCOUNT_SECURITY),
              eq("Mật khẩu đã được đặt lại"), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-061: Admin đặt lại mật khẩu cho OWNER đã gửi yêu cầu")
    void acc061() {
      stored(owner);
      when(users.hasOpenResetRequest(2)).thenReturn(true);

      service.resetByManager(admin, 2, new Password("OwnerNewPass123!", "OwnerNewPass123!"));

      verify(users).password(2, "bcrypt:OwnerNewPass123!", false);
      verify(users).status(2, "PENDING_VERIFICATION");
      verify(codes).invalidateAll(2);
      verify(users).audit(eq(1), eq("PASSWORD_RESET_ADMIN"), eq(2), anyString());
      verify(notices).toUser(eq(2), eq(NotificationTypes.ACCOUNT_SECURITY),
              eq("Mật khẩu đã được đặt lại"), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-062: Admin đặt lại mật khẩu khi OWNER chưa gửi yêu cầu")
    void acc062() {
      stored(owner);
      when(users.hasOpenResetRequest(2)).thenReturn(false);

      api(400, "NO_RESET_REQUEST", "Chủ cửa hàng chưa gửi yêu cầu đặt lại mật khẩu.",
              () -> service.resetByManager(admin, 2, new Password("OwnerNewPass123!", "OwnerNewPass123!")));
      verify(users, never()).password(anyInt(), anyString(), anyBoolean());
      verifyNoInteractions(notices);
    }

    @Test
    @DisplayName("UTC-ACC-063: Owner đặt lại mật khẩu cho CUSTOMER (không do Owner tạo nên bị chặn từ bước kiểm tra quyền sở hữu)")
    void acc063() {
      stored(account(30, "CUSTOMER", "ACTIVE", null));

      api(403, "OWNERSHIP", "Không được quản lý tài khoản này.",
              () -> service.resetByManager(owner, 30, new Password("NewPass123!", "NewPass123!")));
      verify(users, never()).password(anyInt(), anyString(), anyBoolean());
      verifyNoInteractions(notices);
    }

    @Test
    @DisplayName("UTC-ACC-076: Admin đặt lại mật khẩu cho FAMILY_MEMBER")
    void acc076() {
      stored(account(10, "FAMILY_MEMBER", "ACTIVE", 2));

      api(403, "RESET_ROLE", "Vai trò này cần khôi phục mật khẩu theo luồng riêng.",
              () -> service.resetByManager(admin, 10, new Password("NewPass123!", "NewPass123!")));
      verify(users, never()).password(anyInt(), anyString(), anyBoolean());
      verifyNoInteractions(notices);
    }

    @Test
    @DisplayName("UTC-ACC-077: Owner đặt lại mật khẩu cho FAMILY_MEMBER đang PENDING_VERIFICATION")
    void acc077() {
      stored(account(10, "FAMILY_MEMBER", "PENDING_VERIFICATION", 2));

      service.resetByManager(owner, 10, new Password("NewPassword123!", "NewPassword123!"));

      verify(users).password(10, "bcrypt:NewPassword123!", false);
      verify(users, never()).status(anyInt(), anyString());
      verify(codes).invalidateAll(10);
      verify(notices).toUser(eq(10), eq(NotificationTypes.ACCOUNT_SECURITY),
              eq("Mật khẩu đã được đặt lại"), anyString());
    }
  }

  // ------------------------------------------------------------------ requestOwnerReset

  @Nested
  @DisplayName("requestOwnerReset(String identifier)")
  class RequestOwnerResetTests {
    @Test
    @DisplayName("UTC-ACC-064: email của OWNER đang ACTIVE")
    void acc064() {
      when(users.byIdentifier("owner@shop.com")).thenReturn(Optional.of(owner));
      when(users.hasOpenResetRequest(2)).thenReturn(false);

      service.requestOwnerReset("owner@shop.com");

      verify(users).audit(isNull(), eq("PASSWORD_RESET_REQUEST"), eq(2), anyString());
      verify(notices).toRole(eq("ADMIN"), eq(NotificationTypes.PASSWORD_RESET_REQUEST), anyString(),
              anyString(), eq(NotificationTypes.ENTITY_USER), eq(2));
    }

    @Test
    @DisplayName("UTC-ACC-065: identifier là CUSTOMER hoặc email không tồn tại")
    void acc065() {
      when(users.byIdentifier("customer@gmail.com"))
              .thenReturn(Optional.of(account(7, "CUSTOMER", "ACTIVE", null)));
      when(users.byIdentifier("unknown@shop.com")).thenReturn(Optional.empty());

      assertDoesNotThrow(() -> service.requestOwnerReset("customer@gmail.com"));
      assertDoesNotThrow(() -> service.requestOwnerReset("unknown@shop.com"));

      verify(users, never()).audit(any(), anyString(), anyInt(), anyString());
      verifyNoInteractions(notices);
    }

    @Test
    @DisplayName("UTC-ACC-078: identifier để trống")
    void acc078() {
      assertDoesNotThrow(() -> service.requestOwnerReset("   "));

      verify(users, never()).byIdentifier(anyString());
      verify(users, never()).audit(any(), anyString(), anyInt(), anyString());
      verifyNoInteractions(notices);
    }

    @Test
    @DisplayName("UTC-ACC-079: OWNER đang bị khóa gửi yêu cầu")
    void acc079() {
      when(users.byIdentifier("owner@shop.com")).thenReturn(Optional.of(account(2, "OWNER", "LOCKED", 1)));

      assertDoesNotThrow(() -> service.requestOwnerReset("owner@shop.com"));

      verify(users, never()).audit(any(), anyString(), anyInt(), anyString());
      verifyNoInteractions(notices);
    }

    @Test
    @DisplayName("UTC-ACC-080: OWNER đã có yêu cầu chưa xử lý")
    void acc080() {
      when(users.byIdentifier("owner@shop.com")).thenReturn(Optional.of(owner));
      when(users.hasOpenResetRequest(2)).thenReturn(true);

      assertDoesNotThrow(() -> service.requestOwnerReset("owner@shop.com"));

      verify(users, never()).audit(any(), anyString(), anyInt(), anyString());
      verifyNoInteractions(notices);
    }
  }

  // ------------------------------------------------------------------ resetRequests

  @Nested
  @DisplayName("resetRequests(Account actor)")
  class ResetRequestsTests {
    @Test
    @DisplayName("UTC-ACC-066: Admin lấy danh sách yêu cầu chưa xử lý")
    void acc066() {
      var open = List.of(new OpenResetRequest(2, "Owner", "owner@shop.com", CREATED));
      when(users.openResetRequests()).thenReturn(open);

      assertEquals(open, service.resetRequests(admin));
    }

    @Test
    @DisplayName("UTC-ACC-067: Owner gọi API danh sách yêu cầu")
    void acc067() {
      api(403, "ROLE", "Chỉ quản trị viên được thực hiện thao tác này.",
              () -> service.resetRequests(owner));
      verify(users, never()).openResetRequests();
    }
  }
}
