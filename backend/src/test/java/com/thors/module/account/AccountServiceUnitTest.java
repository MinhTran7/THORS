package com.thors.module.account;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.cloudinary.Cloudinary;
import com.cloudinary.Uploader;
import com.thors.common.ApiException;
import com.thors.module.account.dto.AccountDetail;
import com.thors.module.account.dto.AccountRequests.Create;
import com.thors.module.account.dto.AccountRequests.Edit;
import com.thors.module.account.dto.AccountRequests.Password;
import com.thors.module.account.dto.AccountRequests.UpdateProfile;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AccountRepository;
import com.thors.module.account.repository.AccountRepository.OpenResetRequest;
import com.thors.module.account.repository.PasswordChangeRequirementRepository;
import com.thors.module.account.service.AccountService;
import com.thors.module.account.service.AvatarImageService;
import com.thors.module.auth.repository.OtpRepository;
import com.thors.module.notification.service.NotificationPublisher;
import com.thors.module.notification.service.NotificationTypes;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Unit test cho các chức năng tài khoản, viết theo sheet "Account" của Report-5.1_Unit Test
 * (UTC-ACC-001..084). Bộ test case trong sheet được lập từ 11 sequence diagram của Account (hồ sơ cá nhân,
 * ảnh đại diện, tạo / sửa / đổi trạng thái / khóa / mở khóa tài khoản, đặt lại mật khẩu); mỗi test mang
 * đúng mã Test Case ID trong sheet.
 */
@DisplayName("Account Unit Test")
class AccountServiceUnitTest {
  private static final LocalDateTime CREATED = LocalDateTime.of(2026, 11, 1, 9, 0);
  private static final String HASH = "$2a$10$hash";
  private static final String GOOD = "Password@123";
  private static final String NEW_PASS = "NewPass@2026";
  private static final String AVATARS = "https://res.cloudinary.com/testcloud/image/upload/v1/thors/avatars/";
  private static final String OLD_URL = AVATARS + "u10_old.png";
  private static final String NEW_URL = AVATARS + "u10_new.png";
  private static final String ROLE_ADMIN_ONLY = "Chỉ quản trị viên được thực hiện thao tác này.";
  private static final String NAME_RULE = "Họ tên cần 1–100 ký tự.";
  private static final String NOT_FOUND = "Không tìm thấy tài khoản.";

  private AccountRepository users;
  private OtpRepository codes;
  private NotificationPublisher notices;
  private PasswordChangeRequirementRepository passwordChanges;
  private AccountService service;

  private final Account admin = account(1, "ADMIN", "ACTIVE", null);
  private final Account owner = account(2, "OWNER", "ACTIVE", 1);
  private final Account me = new Account(10, "FAMILY_MEMBER", "User 10", HASH, "user10@shop.com", "0912345678",
          "12 Trần Hưng Đạo", null, "ACTIVE", CREATED, CREATED, null, 0, 2);
  private final Account staff = account(20, "STAFF", "ACTIVE", 2);

  @BeforeEach
  void setUp() {
    users = mock(AccountRepository.class);
    codes = mock(OtpRepository.class);
    notices = mock(NotificationPublisher.class);
    passwordChanges = mock(PasswordChangeRequirementRepository.class);
    PasswordEncoder passwords = mock(PasswordEncoder.class);
    when(passwords.encode(anyString())).thenAnswer(i -> "bcrypt:" + i.getArgument(0));
    service = new AccountService(users, codes, passwords, notices, passwordChanges);
  }

  // ------------------------------------------------------------------ helpers

  private static Account account(int id, String role, String status, Integer createdBy) {
    return new Account(id, role, "User " + id, HASH, "user" + id + "@shop.com", null, null, null,
            status, CREATED, CREATED, null, 0, createdBy);
  }

  /** Tài khoản trong DB: users.lock và users.byId đều trả về a. */
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

  private void verifyNoStatusChange() {
    verify(users, never()).status(anyInt(), anyString());
    verify(codes, never()).invalidateAll(anyInt());
  }

  // ================================================================== profile

  @Nested
  @DisplayName("AccountService.profile(Account actor)")
  class ProfileTests {
    @Test
    @DisplayName("UTC-ACC-001: Xem hồ sơ có người tạo và liên kết Google")
    void acc001() {
      var a = new Account(10, "FAMILY_MEMBER", "User 10", HASH, "family@shop.com", null, null, null, "ACTIVE",
              CREATED, CREATED, "google-sub", 0, 2);
      when(users.byId(10)).thenReturn(Optional.of(a));
      when(users.byId(2)).thenReturn(Optional.of(new Account(2, "OWNER", "Tên Owner", HASH, "o@shop.com", null,
              null, null, "ACTIVE", CREATED, CREATED, null, 0, 1)));

      AccountDetail d = service.profile(a);
      assertEquals(10, d.id());
      assertEquals("FAMILY_MEMBER", d.role());
      assertTrue(d.googleLinked());
      assertTrue(d.passwordEnabled());
      assertEquals(2, d.createdById());
      assertEquals("Tên Owner", d.createdByName());
    }

    @Test
    @DisplayName("UTC-ACC-002: Tài khoản tự đăng ký (không có người tạo)")
    void acc002() {
      var a = stored(account(20, "CUSTOMER", "ACTIVE", null));
      AccountDetail d = service.profile(a);
      assertNull(d.createdById());
      assertNull(d.createdByName());
      verify(users, times(1)).byId(anyInt());
    }

    @Test
    @DisplayName("UTC-ACC-003: Tài khoản chỉ đăng nhập Google thì không có mật khẩu")
    void acc003() {
      var a = new Account(20, "CUSTOMER", "User 20", "!google-only", "c@shop.com", null, null, null, "ACTIVE",
              CREATED, CREATED, "sub", 0, null);
      when(users.byId(20)).thenReturn(Optional.of(a));
      assertFalse(service.profile(a).passwordEnabled());
    }

    @Test
    @DisplayName("UTC-ACC-004: Tài khoản không còn trong DB")
    void acc004() {
      when(users.byId(99)).thenReturn(Optional.empty());
      assertThrows(NoSuchElementException.class, () -> service.profile(account(99, "CUSTOMER", "ACTIVE", null)));
    }
  }

  // ================================================================== updateProfile

  @Nested
  @DisplayName("AccountService.updateProfile(Account actor, UpdateProfile r)")
  class UpdateProfileTests {
    @BeforeEach
    void setUp() {
      stored(me);
    }

    @Test
    @DisplayName("UTC-ACC-005: Cập nhật họ tên, số điện thoại và địa chỉ")
    void acc005() {
      AccountDetail d = service.updateProfile(me, new UpdateProfile(" Nguyễn Văn B ", "0987 654 321", "45 Lê Lợi"));

      verify(users).lockIdentityRegistry();
      verify(users).updateProfile(10, "Nguyễn Văn B", "0987654321", "45 Lê Lợi");
      verify(users).audit(10, "PROFILE_UPDATE", 10, "Profile information updated");
      assertEquals(10, d.id());
    }

    @Test
    @DisplayName("UTC-ACC-006: Không nhập số điện thoại thì giữ số cũ")
    void acc006() {
      service.updateProfile(me, new UpdateProfile("User 10", null, "45 Lê Lợi"));
      verify(users, never()).lockIdentityRegistry();
      verify(users).updateProfile(10, "User 10", "0912345678", "45 Lê Lợi");
    }

    @Test
    @DisplayName("UTC-ACC-007: Số điện thoại chỉ có khoảng trắng, địa chỉ null")
    void acc007() {
      service.updateProfile(me, new UpdateProfile("User 10", "   ", null));
      verify(users, never()).lockIdentityRegistry();
      verify(users).updateProfile(10, "User 10", "0912345678", "12 Trần Hưng Đạo");
    }

    @Test
    @DisplayName("UTC-ACC-008: Địa chỉ rỗng thì xóa địa chỉ")
    void acc008() {
      service.updateProfile(me, new UpdateProfile("User 10", null, "   "));
      verify(users).updateProfile(10, "User 10", "0912345678", null);
    }

    @Test
    @DisplayName("UTC-ACC-009: Họ tên rỗng")
    void acc009() {
      api(400, "NAME", "Họ tên cần 1–100 ký tự.",
              () -> service.updateProfile(me, new UpdateProfile("   ", null, null)));
      verify(users, never()).updateProfile(anyInt(), any(), any(), any());
    }

    @Test
    @DisplayName("UTC-ACC-010: Họ tên 101 ký tự")
    void acc010() {
      api(400, "NAME", NAME_RULE, () -> service.updateProfile(me, new UpdateProfile("a".repeat(101), null, null)));
    }

    @Test
    @DisplayName("UTC-ACC-011: Họ tên đúng 100 ký tự")
    void acc011() {
      service.updateProfile(me, new UpdateProfile("a".repeat(100), null, null));
      verify(users).updateProfile(eq(10), eq("a".repeat(100)), any(), any());
    }

    @Test
    @DisplayName("UTC-ACC-012: Số điện thoại dạng +84")
    void acc012() {
      api(400, "PHONE", "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.",
              () -> service.updateProfile(me, new UpdateProfile("User 10", "+84987654321", null)));
    }

    @Test
    @DisplayName("UTC-ACC-013: Số điện thoại 9 chữ số")
    void acc013() {
      api(400, "PHONE", "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.",
              () -> service.updateProfile(me, new UpdateProfile("User 10", "098765432", null)));
    }

    @Test
    @DisplayName("UTC-ACC-014: Số điện thoại đã thuộc tài khoản khác")
    void acc014() {
      doThrow(new ApiException(409, "PHONE_IN_USE", "Số điện thoại đã được sử dụng."))
              .when(users).updateProfile(10, "User 10", "0987654321", "12 Trần Hưng Đạo");
      api(409, "PHONE_IN_USE", "Số điện thoại đã được sử dụng.",
              () -> service.updateProfile(me, new UpdateProfile("User 10", "0987654321", null)));
      verify(users, never()).audit(any(), anyString(), anyInt(), anyString());
    }
  }

  // ================================================================== AvatarImageService

  abstract class AvatarBase {
    Uploader uploader;
    AccountService accounts;
    AvatarImageService avatars;
    final AccountDetail profile = new AccountDetail(10, "FAMILY_MEMBER", "User 10", "user10@shop.com", null, null,
            NEW_URL, "ACTIVE", false, true, CREATED, 2, "User 2");

    @BeforeEach
    void setUp() throws Exception {
      Cloudinary cloudinary =
              spy(new Cloudinary(Map.of("cloud_name", "testcloud", "api_key", "k", "api_secret", "s")));
      uploader = mock(Uploader.class);
      doReturn(uploader).when(cloudinary).uploader();
      when(uploader.upload(any(byte[].class), anyMap())).thenReturn(Map.of("secure_url", NEW_URL));
      accounts = mock(AccountService.class);
      when(accounts.profile(me)).thenReturn(profile);
      avatars = new AvatarImageService(cloudinary, accounts);
    }

    MockMultipartFile image(String format) throws IOException {
      var out = new ByteArrayOutputStream();
      ImageIO.write(new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB), format, out);
      return new MockMultipartFile("file", "a." + format, "image/" + format, out.toByteArray());
    }
  }

  @Nested
  @DisplayName("AvatarImageService.replace(Account actor, MultipartFile file)")
  class ReplaceAvatarTests extends AvatarBase {
    @Test
    @DisplayName("UTC-ACC-015: Đổi ảnh đại diện, xóa ảnh cũ của chính tài khoản")
    void acc015() throws Exception {
      when(accounts.setAvatar(me, NEW_URL)).thenReturn(OLD_URL);
      assertSame(profile, avatars.replace(me, image("png")));

      verify(uploader, times(1)).upload(any(byte[].class), argThat(m -> "thors/avatars".equals(m.get("folder"))));
      verify(accounts).setAvatar(me, NEW_URL);
      verify(uploader).destroy(eq("thors/avatars/u10_old"), anyMap());
    }

    @Test
    @DisplayName("UTC-ACC-016: Chưa có ảnh cũ")
    void acc016() throws Exception {
      when(accounts.setAvatar(me, NEW_URL)).thenReturn(null);
      assertSame(profile, avatars.replace(me, image("jpg")));
      verify(uploader, never()).destroy(anyString(), anyMap());
    }

    @Test
    @DisplayName("UTC-ACC-017: Ảnh cũ là ảnh Google thì không xóa")
    void acc017() throws Exception {
      when(accounts.setAvatar(me, NEW_URL)).thenReturn("https://lh3.googleusercontent.com/a/abc");
      avatars.replace(me, image("png"));
      verify(uploader, never()).destroy(anyString(), anyMap());
    }

    @Test
    @DisplayName("UTC-ACC-018: Không chọn ảnh")
    void acc018() {
      api(400, "AVATAR_EMPTY", "Vui lòng chọn ảnh.", () -> avatars.replace(me, null));
    }

    @Test
    @DisplayName("UTC-ACC-019: Ảnh lớn hơn 5 MB một byte")
    void acc019() {
      var big = new MockMultipartFile("file", "a.png", "image/png", new byte[5 * 1024 * 1024 + 1]);
      api(400, "AVATAR_SIZE", "Ảnh đại diện tối đa 5 MB.", () -> avatars.replace(me, big));
    }

    @Test
    @DisplayName("UTC-ACC-020: File .png nhưng nội dung không phải ảnh")
    void acc020() throws Exception {
      var fake = new MockMultipartFile("file", "a.png", "image/png", "khong phai anh".getBytes());
      api(400, "AVATAR_INVALID", "Chỉ nhận ảnh JPG hoặc PNG hợp lệ.", () -> avatars.replace(me, fake));
      verify(uploader, never()).upload(any(), anyMap());
    }

    @Test
    @DisplayName("UTC-ACC-021: Ảnh GIF")
    void acc021() throws Exception {
      var gif = image("gif");
      api(400, "AVATAR_INVALID", "Chỉ nhận ảnh JPG hoặc PNG hợp lệ.", () -> avatars.replace(me, gif));
    }

    @Test
    @DisplayName("UTC-ACC-022: Cloudinary lỗi khi tải ảnh lên")
    void acc022() throws Exception {
      when(uploader.upload(any(byte[].class), anyMap())).thenThrow(new IOException("network"));
      var png = image("png");
      api(502, "AVATAR_UPLOAD", "Không tải được ảnh lên. Vui lòng thử lại.", () -> avatars.replace(me, png));
      verify(accounts, never()).setAvatar(any(), any());
    }

    @Test
    @DisplayName("UTC-ACC-023: Lưu hồ sơ lỗi thì xóa ảnh vừa tải lên")
    void acc023() throws Exception {
      when(accounts.setAvatar(me, NEW_URL))
              .thenThrow(new ApiException(404, "ACCOUNT_NOT_FOUND", "Không tìm thấy tài khoản."));
      var png = image("png");
      api(404, "ACCOUNT_NOT_FOUND", NOT_FOUND, () -> avatars.replace(me, png));
      verify(uploader).destroy(eq("thors/avatars/u10_new"), anyMap());
    }
  }

  @Nested
  @DisplayName("AccountService.setAvatar(Account actor, String url)")
  class SetAvatarTests {
    @BeforeEach
    void setUp() {
      stored(new Account(10, "FAMILY_MEMBER", "User 10", HASH, "user10@shop.com", null, null, OLD_URL, "ACTIVE",
              CREATED, CREATED, null, 0, 2));
    }

    @Test
    @DisplayName("UTC-ACC-024: Đặt ảnh đại diện mới")
    void acc024() {
      assertEquals(OLD_URL, service.setAvatar(me, NEW_URL));
      verify(users).lock(10);
      verify(users).avatar(10, NEW_URL);
      verify(users).audit(10, "PROFILE_UPDATE", 10, "Avatar updated");
    }

    @Test
    @DisplayName("UTC-ACC-025: Gỡ ảnh đại diện")
    void acc025() {
      assertEquals(OLD_URL, service.setAvatar(me, null));
      verify(users).avatar(10, null);
      verify(users).audit(10, "PROFILE_UPDATE", 10, "Avatar removed");
    }
  }

  @Nested
  @DisplayName("AvatarImageService.remove(Account actor)")
  class RemoveAvatarTests extends AvatarBase {
    @Test
    @DisplayName("UTC-ACC-026: Gỡ ảnh và xóa ảnh trên Cloudinary")
    void acc026() throws Exception {
      when(accounts.setAvatar(me, null)).thenReturn(OLD_URL);
      assertSame(profile, avatars.remove(me));
      verify(accounts).setAvatar(me, null);
      verify(uploader).destroy(eq("thors/avatars/u10_old"), anyMap());
    }

    @Test
    @DisplayName("UTC-ACC-027: Chưa có ảnh đại diện")
    void acc027() throws Exception {
      when(accounts.setAvatar(me, null)).thenReturn(null);
      assertSame(profile, avatars.remove(me));
      verify(uploader, never()).destroy(anyString(), anyMap());
    }

    @Test
    @DisplayName("UTC-ACC-028: Xóa ảnh trên Cloudinary lỗi vẫn trả hồ sơ")
    void acc028() throws Exception {
      when(accounts.setAvatar(me, null)).thenReturn(OLD_URL);
      when(uploader.destroy(anyString(), anyMap())).thenThrow(new IOException("network"));
      assertSame(profile, avatars.remove(me));
    }
  }

  // ================================================================== create

  @Nested
  @DisplayName("AccountService.create(Account actor, Create r)")
  class CreateTests {
    @BeforeEach
    void setUp() {
      when(users.create(anyString(), anyString(), anyString(), anyString(), any(), anyString(), anyInt(), any(),
              anyBoolean())).thenAnswer(i -> account(30, i.getArgument(0), "PENDING_VERIFICATION", i.getArgument(6)));
    }

    private Create create(String role, String password, String confirm) {
      return new Create(role, "Trần Văn C", "staff@shop.com", "0911222333", password, confirm);
    }

    @Test
    @DisplayName("UTC-ACC-029: Owner tạo tài khoản STAFF")
    void acc029() {
      Account created = service.create(owner,
              new Create("STAFF", " Trần Văn C ", "Staff@Shop.com", "0911 222 333", GOOD, GOOD));

      verify(users).create("STAFF", "Trần Văn C", "bcrypt:" + GOOD, "staff@shop.com", "0911222333",
              "PENDING_VERIFICATION", 2, null, false);
      verify(passwordChanges).require(30);
      assertEquals(30, created.id());
    }

    @Test
    @DisplayName("UTC-ACC-030: Owner tạo tài khoản FAMILY_MEMBER")
    void acc030() {
      when(users.create(eq("FAMILY_MEMBER"), anyString(), anyString(), anyString(), any(), anyString(), anyInt(),
              any(), anyBoolean())).thenReturn(account(31, "FAMILY_MEMBER", "PENDING_VERIFICATION", 2));
      service.create(owner, create("FAMILY_MEMBER", GOOD, GOOD));
      verify(users).create(eq("FAMILY_MEMBER"), anyString(), anyString(), anyString(), any(), anyString(), eq(2),
              any(), anyBoolean());
      verify(passwordChanges).require(31);
    }

    @Test
    @DisplayName("UTC-ACC-031: Admin tạo tài khoản OWNER")
    void acc031() {
      service.create(admin, create("OWNER", GOOD, GOOD));
      verify(users).create(eq("OWNER"), anyString(), anyString(), anyString(), any(), anyString(), eq(1), any(),
              anyBoolean());
    }

    @Test
    @DisplayName("UTC-ACC-032: Admin không tạo được STAFF")
    void acc032() {
      api(403, "ROLE", "Không được tạo vai trò này.", () -> service.create(admin, create("STAFF", GOOD, GOOD)));
    }

    @Test
    @DisplayName("UTC-ACC-033: Owner không tạo được OWNER")
    void acc033() {
      api(403, "ROLE", "Không được tạo vai trò này.", () -> service.create(owner, create("OWNER", GOOD, GOOD)));
    }

    @Test
    @DisplayName("UTC-ACC-034: STAFF không có quyền tạo tài khoản")
    void acc034() {
      api(403, "ROLE", "Không có quyền quản lý tài khoản.", () -> service.create(staff, create("STAFF", GOOD, GOOD)));
    }

    @Test
    @DisplayName("UTC-ACC-035: Mật khẩu xác nhận không khớp")
    void acc035() {
      api(400, "PASSWORD_CONFIRM", "Mật khẩu xác nhận không khớp.",
              () -> service.create(owner, create("STAFF", GOOD, "Password@124")));
      verify(users, never()).create(any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean());
    }

    @Test
    @DisplayName("UTC-ACC-036: Mật khẩu 9 ký tự")
    void acc036() {
      api(400, "PASSWORD", "Mật khẩu cần 10–64 ký tự và tối đa 72 byte.",
              () -> service.create(owner, create("STAFF", "Pass@1234", "Pass@1234")));
    }

    @Test
    @DisplayName("UTC-ACC-037: Mật khẩu đúng 10 ký tự")
    void acc037() {
      assertDoesNotThrow(() -> service.create(owner, create("STAFF", "Pass@12345", "Pass@12345")));
    }

    @Test
    @DisplayName("UTC-ACC-038: Mật khẩu đúng 64 ký tự")
    void acc038() {
      String p = "Aa1@" + "a".repeat(60);
      assertDoesNotThrow(() -> service.create(owner, create("STAFF", p, p)));
    }

    @Test
    @DisplayName("UTC-ACC-039: Mật khẩu 65 ký tự")
    void acc039() {
      String p = "Aa1@" + "a".repeat(61);
      api(400, "PASSWORD", "Mật khẩu cần 10–64 ký tự và tối đa 72 byte.",
              () -> service.create(owner, create("STAFF", p, p)));
    }

    @Test
    @DisplayName("UTC-ACC-040: Email sai định dạng")
    void acc040() {
      api(400, "EMAIL", "Email không hợp lệ.", () -> service.create(owner,
              new Create("STAFF", "Trần Văn C", "staff-at-shop", "0911222333", GOOD, GOOD)));
    }

    @Test
    @DisplayName("UTC-ACC-041: Không nhập số điện thoại")
    void acc041() {
      service.create(owner, new Create("STAFF", "Trần Văn C", "staff@shop.com", null, GOOD, GOOD));
      verify(users).create(eq("STAFF"), anyString(), anyString(), anyString(), isNull(), anyString(), eq(2), any(),
              anyBoolean());
    }

    @Test
    @DisplayName("UTC-ACC-042: Email đã được dùng")
    void acc042() {
      when(users.create(anyString(), anyString(), anyString(), anyString(), any(), anyString(), anyInt(), any(),
              anyBoolean())).thenThrow(new ApiException(409, "EMAIL_IN_USE", "Email đã được sử dụng."));
      api(409, "EMAIL_IN_USE", "Email đã được sử dụng.", () -> service.create(owner, create("STAFF", GOOD, GOOD)));
      verify(passwordChanges, never()).require(anyInt());
    }
  }

  // ================================================================== edit

  @Nested
  @DisplayName("AccountService.edit(Account actor, int id, Edit r)")
  class EditTests {
    @BeforeEach
    void setUp() {
      stored(staff);
    }

    @Test
    @DisplayName("UTC-ACC-043: Owner sửa họ tên nhân viên")
    void acc043() {
      Account result = service.edit(owner, 20, new Edit("Tên mới", null));
      verify(users).name(20, "Tên mới");
      verifyNoStatusChange();
      verify(users).audit(2, "ACCOUNT_EDIT", 20, "Account details/status updated");
      assertEquals(20, result.id());
    }

    @Test
    @DisplayName("UTC-ACC-044: Owner sửa họ tên và vô hiệu hóa nhân viên")
    void acc044() {
      service.edit(owner, 20, new Edit("Tên mới", "DISABLED"));
      verify(users).name(20, "Tên mới");
      verify(users).status(20, "DISABLED");
      verify(codes).invalidateAll(20);
      verify(users).audit(2, "ACCOUNT_DEACTIVATE", 20, "ACTIVE -> DISABLED");
      verify(users).audit(2, "ACCOUNT_EDIT", 20, "Account details/status updated");
    }

    @Test
    @DisplayName("UTC-ACC-045: Trạng thái giữ nguyên thì chỉ đổi tên")
    void acc045() {
      service.edit(owner, 20, new Edit("Tên mới", "ACTIVE"));
      verify(users).name(20, "Tên mới");
      verifyNoStatusChange();
    }

    @Test
    @DisplayName("UTC-ACC-046: Owner sửa nhân viên của Owner khác")
    void acc046() {
      stored(account(21, "STAFF", "ACTIVE", 5));
      api(403, "OWNERSHIP", "Không được quản lý tài khoản này.",
              () -> service.edit(owner, 21, new Edit("Tên mới", null)));
    }

    @Test
    @DisplayName("UTC-ACC-047: Owner khóa nhân viên qua màn sửa")
    void acc047() {
      api(403, "LOCK_ADMIN_ONLY", "Chỉ quản trị viên được khóa tài khoản.",
              () -> service.edit(owner, 20, new Edit("Tên mới", "LOCKED")));
      verify(users, never()).name(anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-048: Họ tên rỗng")
    void acc048() {
      api(400, "NAME", NAME_RULE, () -> service.edit(owner, 20, new Edit("  ", null)));
    }

    @Test
    @DisplayName("UTC-ACC-049: Tài khoản không tồn tại")
    void acc049() {
      when(users.lock(99)).thenThrow(new ApiException(404, "ACCOUNT_NOT_FOUND", "Không tìm thấy tài khoản."));
      api(404, "ACCOUNT_NOT_FOUND", NOT_FOUND, () -> service.edit(owner, 99, new Edit("Tên mới", null)));
    }
  }

  // ================================================================== changeStatus

  @Nested
  @DisplayName("AccountService.changeStatus(Account actor, int id, String status)")
  class ChangeStatusTests {
    @Test
    @DisplayName("UTC-ACC-050: Owner vô hiệu hóa nhân viên")
    void acc050() {
      stored(staff);
      Account result = service.changeStatus(owner, 20, "DISABLED");
      verify(users).status(20, "DISABLED");
      verify(codes).invalidateAll(20);
      verify(users).audit(2, "ACCOUNT_DEACTIVATE", 20, "ACTIVE -> DISABLED");
      assertEquals(20, result.id());
    }

    @Test
    @DisplayName("UTC-ACC-051: Owner kích hoạt lại nhân viên")
    void acc051() {
      stored(account(20, "STAFF", "DISABLED", 2));
      service.changeStatus(owner, 20, "ACTIVE");
      verify(users).status(20, "ACTIVE");
      verify(users).audit(2, "ACCOUNT_ACTIVATE", 20, "DISABLED -> ACTIVE");
    }

    @Test
    @DisplayName("UTC-ACC-052: Trạng thái mới giống trạng thái hiện tại")
    void acc052() {
      stored(staff);
      assertEquals(20, service.changeStatus(owner, 20, "ACTIVE").id());
      verifyNoStatusChange();
      verify(users, never()).audit(any(), anyString(), anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-053: Trạng thái không hợp lệ")
    void acc053() {
      stored(staff);
      api(400, "STATUS", "Trạng thái không hợp lệ.", () -> service.changeStatus(owner, 20, "DELETED"));
    }

    @Test
    @DisplayName("UTC-ACC-054: Kích hoạt tài khoản chưa xác minh")
    void acc054() {
      stored(account(20, "STAFF", "PENDING_VERIFICATION", 2));
      api(400, "ACCOUNT_UNVERIFIED", "Tài khoản chưa xác minh, không thể kích hoạt thủ công.",
              () -> service.changeStatus(owner, 20, "ACTIVE"));
    }

    @Test
    @DisplayName("UTC-ACC-055: Owner mở tài khoản đang bị Admin khóa")
    void acc055() {
      stored(account(20, "STAFF", "LOCKED", 2));
      api(403, "LOCKED_BY_ADMIN", "Tài khoản đang bị quản trị viên khóa, chỉ Admin mở khóa được.",
              () -> service.changeStatus(owner, 20, "ACTIVE"));
    }

    @Test
    @DisplayName("UTC-ACC-056: Admin đổi trạng thái của chính mình")
    void acc056() {
      stored(admin);
      api(400, "SELF_LOCK", "Không thể thay trạng thái tài khoản của chính mình.",
              () -> service.changeStatus(admin, 1, "DISABLED"));
    }

    @Test
    @DisplayName("UTC-ACC-057: Family Member không có quyền quản lý tài khoản")
    void acc057() {
      stored(staff);
      api(403, "ROLE", "Không có quyền quản lý tài khoản.", () -> service.changeStatus(me, 20, "DISABLED"));
    }
  }

  // ================================================================== lock / unlock

  @Nested
  @DisplayName("AccountService.lock(Account actor, int id)")
  class LockTests {
    @Test
    @DisplayName("UTC-ACC-058: Admin khóa tài khoản Owner")
    void acc058() {
      stored(owner);
      assertEquals(2, service.lock(admin, 2).id());
      verify(users).status(2, "LOCKED");
      verify(codes).invalidateAll(2);
      verify(users).audit(1, "ACCOUNT_LOCK", 2, "ACTIVE -> LOCKED");
    }

    @Test
    @DisplayName("UTC-ACC-059: Owner không khóa được tài khoản")
    void acc059() {
      stored(staff);
      api(403, "ROLE", ROLE_ADMIN_ONLY, () -> service.lock(owner, 20));
    }

    @Test
    @DisplayName("UTC-ACC-060: Tài khoản đã bị khóa sẵn")
    void acc060() {
      stored(account(2, "OWNER", "LOCKED", 1));
      service.lock(admin, 2);
      verifyNoStatusChange();
      verify(users, never()).audit(any(), anyString(), anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-061: Admin tự khóa chính mình")
    void acc061() {
      stored(admin);
      api(400, "SELF_LOCK", "Không thể thay trạng thái tài khoản của chính mình.", () -> service.lock(admin, 1));
    }
  }

  @Nested
  @DisplayName("AccountService.unlock(Account actor, int id)")
  class UnlockTests {
    @Test
    @DisplayName("UTC-ACC-062: Admin mở khóa tài khoản Owner")
    void acc062() {
      stored(account(2, "OWNER", "LOCKED", 1));
      service.unlock(admin, 2);
      verify(users).status(2, "ACTIVE");
      verify(codes).invalidateAll(2);
      verify(users).audit(1, "ACCOUNT_UNLOCK", 2, "LOCKED -> ACTIVE");
    }

    @Test
    @DisplayName("UTC-ACC-063: Tài khoản không ở trạng thái khóa")
    void acc063() {
      stored(owner);
      api(400, "NOT_LOCKED", "Tài khoản không ở trạng thái khóa.", () -> service.unlock(admin, 2));
    }

    @Test
    @DisplayName("UTC-ACC-064: Owner không mở khóa được")
    void acc064() {
      stored(account(20, "STAFF", "LOCKED", 2));
      api(403, "ROLE", ROLE_ADMIN_ONLY, () -> service.unlock(owner, 20));
    }

    @Test
    @DisplayName("UTC-ACC-065: Tài khoản không tồn tại")
    void acc065() {
      when(users.lock(99)).thenThrow(new ApiException(404, "ACCOUNT_NOT_FOUND", "Không tìm thấy tài khoản."));
      api(404, "ACCOUNT_NOT_FOUND", NOT_FOUND, () -> service.unlock(admin, 99));
    }
  }

  // ================================================================== requestOwnerReset

  @Nested
  @DisplayName("AccountService.requestOwnerReset(String identifier)")
  class RequestOwnerResetTests {
    private void verifyNothingSent() {
      verify(users, never()).audit(any(), anyString(), anyInt(), anyString());
      verifyNoInteractions(notices);
    }

    @Test
    @DisplayName("UTC-ACC-066: Owner gửi yêu cầu bằng email")
    void acc066() {
      when(users.byIdentifier("owner@shop.com")).thenReturn(Optional.of(owner));
      service.requestOwnerReset("owner@shop.com");

      verify(users).audit(null, "PASSWORD_RESET_REQUEST", 2, "Shop Owner submitted a password reset request");
      verify(notices).toRole(eq("ADMIN"), eq(NotificationTypes.PASSWORD_RESET_REQUEST),
              eq("Yêu cầu đặt lại mật khẩu"), anyString(), eq(NotificationTypes.ENTITY_USER), eq(2));
    }

    @Test
    @DisplayName("UTC-ACC-067: Owner gửi yêu cầu bằng số điện thoại")
    void acc067() {
      when(users.byIdentifier("+84912345678")).thenReturn(Optional.of(owner));
      service.requestOwnerReset("0912345678");
      verify(users).byIdentifier("+84912345678");
      verify(users).audit(null, "PASSWORD_RESET_REQUEST", 2, "Shop Owner submitted a password reset request");
      verify(notices).toRole(eq("ADMIN"), anyString(), anyString(), anyString(), anyString(), eq(2));
    }

    @Test
    @DisplayName("UTC-ACC-068: Email không tồn tại")
    void acc068() {
      when(users.byIdentifier("ghost@shop.com")).thenReturn(Optional.empty());
      assertDoesNotThrow(() -> service.requestOwnerReset("ghost@shop.com"));
      verifyNothingSent();
    }

    @Test
    @DisplayName("UTC-ACC-069: Tài khoản không phải Owner")
    void acc069() {
      when(users.byIdentifier("staff@shop.com")).thenReturn(Optional.of(staff));
      service.requestOwnerReset("staff@shop.com");
      verifyNothingSent();
    }

    @Test
    @DisplayName("UTC-ACC-070: Owner đang bị khóa")
    void acc070() {
      when(users.byIdentifier("owner@shop.com")).thenReturn(Optional.of(account(2, "OWNER", "LOCKED", 1)));
      service.requestOwnerReset("owner@shop.com");
      verifyNothingSent();
    }

    @Test
    @DisplayName("UTC-ACC-071: Đã có yêu cầu đang mở")
    void acc071() {
      when(users.byIdentifier("owner@shop.com")).thenReturn(Optional.of(owner));
      when(users.hasOpenResetRequest(2)).thenReturn(true);
      service.requestOwnerReset("owner@shop.com");
      verifyNothingSent();
    }

    @Test
    @DisplayName("UTC-ACC-072: Chuỗi nhận diện rỗng")
    void acc072() {
      assertDoesNotThrow(() -> service.requestOwnerReset("   "));
      verify(users, never()).byIdentifier(anyString());
    }

    @Test
    @DisplayName("UTC-ACC-073: Email sai định dạng")
    void acc073() {
      assertDoesNotThrow(() -> service.requestOwnerReset("abc@"));
      verify(users, never()).byIdentifier(anyString());
    }
  }

  // ================================================================== resetRequests

  @Nested
  @DisplayName("AccountService.resetRequests(Account actor)")
  class ResetRequestsTests {
    @Test
    @DisplayName("UTC-ACC-074: Admin xem danh sách yêu cầu")
    void acc074() {
      when(users.openResetRequests()).thenReturn(List.of(
              new OpenResetRequest(2, "User 2", "user2@shop.com", CREATED),
              new OpenResetRequest(3, "User 3", "user3@shop.com", CREATED)));
      assertEquals(2, service.resetRequests(admin).size());
    }

    @Test
    @DisplayName("UTC-ACC-075: Owner không xem được")
    void acc075() {
      api(403, "ROLE", ROLE_ADMIN_ONLY, () -> service.resetRequests(owner));
    }

    @Test
    @DisplayName("UTC-ACC-076: Không có yêu cầu nào")
    void acc076() {
      when(users.openResetRequests()).thenReturn(List.of());
      assertTrue(service.resetRequests(admin).isEmpty());
    }
  }

  // ================================================================== resetByManager

  @Nested
  @DisplayName("AccountService.resetByManager(Account actor, int id, Password r)")
  class ResetByManagerTests {
    private final Password good = new Password(NEW_PASS, NEW_PASS);

    @Test
    @DisplayName("UTC-ACC-077: Admin đặt lại mật khẩu cho Owner đã gửi yêu cầu")
    void acc077() {
      stored(owner);
      when(users.hasOpenResetRequest(2)).thenReturn(true);
      service.resetByManager(admin, 2, good);

      verify(users).password(2, "bcrypt:" + NEW_PASS, false);
      verify(users).status(2, "PENDING_VERIFICATION");
      verify(codes).invalidateAll(2);
      verify(users).audit(1, "PASSWORD_RESET_ADMIN", 2,
              "Password replaced by ADMIN; activation required; sessions revoked");
      verify(notices).toUser(eq(2), eq(NotificationTypes.ACCOUNT_SECURITY), eq("Mật khẩu đã được đặt lại"),
              contains("quản trị viên"));
    }

    @Test
    @DisplayName("UTC-ACC-078: Owner chưa gửi yêu cầu")
    void acc078() {
      stored(owner);
      api(400, "NO_RESET_REQUEST", "Chủ cửa hàng chưa gửi yêu cầu đặt lại mật khẩu.",
              () -> service.resetByManager(admin, 2, good));
      verify(users, never()).password(anyInt(), anyString(), anyBoolean());
    }

    @Test
    @DisplayName("UTC-ACC-079: Admin đặt lại mật khẩu cho STAFF")
    void acc079() {
      stored(staff);
      api(403, "RESET_ROLE", "Vai trò này cần khôi phục mật khẩu theo luồng riêng.",
              () -> service.resetByManager(admin, 20, good));
    }

    @Test
    @DisplayName("UTC-ACC-080: Owner đặt lại mật khẩu cho nhân viên của mình")
    void acc080() {
      stored(staff);
      service.resetByManager(owner, 20, good);
      verify(users, never()).hasOpenResetRequest(anyInt());
      verify(users).password(20, "bcrypt:" + NEW_PASS, false);
      verify(notices).toUser(eq(20), eq(NotificationTypes.ACCOUNT_SECURITY), anyString(), contains("chủ cửa hàng"));
    }

    @Test
    @DisplayName("UTC-ACC-081: Tài khoản đang DISABLED thì không chuyển về PENDING_VERIFICATION")
    void acc081() {
      stored(account(20, "STAFF", "DISABLED", 2));
      service.resetByManager(owner, 20, good);
      verify(users).password(20, "bcrypt:" + NEW_PASS, false);
      verify(users, never()).status(anyInt(), anyString());
    }

    @Test
    @DisplayName("UTC-ACC-082: Mật khẩu xác nhận không khớp")
    void acc082() {
      stored(staff);
      api(400, "PASSWORD_CONFIRM", "Mật khẩu xác nhận không khớp.",
              () -> service.resetByManager(owner, 20, new Password(NEW_PASS, "NewPass@2027")));
    }

    @Test
    @DisplayName("UTC-ACC-083: Mật khẩu 9 ký tự")
    void acc083() {
      stored(staff);
      api(400, "PASSWORD", "Mật khẩu cần 10–64 ký tự và tối đa 72 byte.",
              () -> service.resetByManager(owner, 20, new Password("Pass@1234", "Pass@1234")));
    }

    @Test
    @DisplayName("UTC-ACC-084: Owner đặt lại mật khẩu cho nhân viên của Owner khác")
    void acc084() {
      stored(account(21, "STAFF", "ACTIVE", 5));
      api(403, "OWNERSHIP", "Không được quản lý tài khoản này.", () -> service.resetByManager(owner, 21, good));
    }
  }
}
