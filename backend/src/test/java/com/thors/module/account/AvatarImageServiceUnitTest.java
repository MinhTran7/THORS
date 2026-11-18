package com.thors.module.account;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.cloudinary.Cloudinary;
import com.cloudinary.Uploader;
import com.thors.common.ApiException;
import com.thors.module.account.dto.AccountDetail;
import com.thors.module.account.entity.Account;
import com.thors.module.account.service.AccountService;
import com.thors.module.account.service.AvatarImageService;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Map;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.mock.web.MockMultipartFile;

/** Unit test cho AvatarImageService theo sheet "Account" (UTC-ACC-105..119). */
@DisplayName("AvatarImageService")
class AvatarImageServiceUnitTest {
  private static final String BASE = "https://res.cloudinary.com/testcloud/image/upload/v1730812345/";
  private static final String NEW_URL = BASE + "thors/avatars/u5_new.png";
  private static final String OLD_URL = BASE + "thors/avatars/u5_old.jpg";
  private static final LocalDateTime T = LocalDateTime.of(2026, 11, 1, 9, 0);

  private Uploader uploader;
  private AccountService accounts;
  private AvatarImageService service;

  private final Account me = new Account(5, "OWNER", "Me", "$2a$10$hash", "me@shop.com", null, null,
          null, "ACTIVE", T, T, null, 0, null);
  private final AccountDetail detail = new AccountDetail(5, "OWNER", "Me", "me@shop.com", null, null,
          NEW_URL, "ACTIVE", false, true, T, null, null);

  @BeforeEach
  void setUp() throws Exception {
    Cloudinary cloudinary =
            spy(new Cloudinary(Map.of("cloud_name", "testcloud", "api_key", "k", "api_secret", "s")));
    uploader = mock(Uploader.class);
    doReturn(uploader).when(cloudinary).uploader();
    when(uploader.upload(any(byte[].class), anyMap())).thenReturn(Map.of("secure_url", NEW_URL));
    accounts = mock(AccountService.class);
    when(accounts.profile(me)).thenReturn(detail);
    service = new AvatarImageService(cloudinary, accounts);
  }

  private static MockMultipartFile image(String format, String name, String type) throws IOException {
    var out = new ByteArrayOutputStream();
    ImageIO.write(new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB), format, out);
    return new MockMultipartFile("file", name, type, out.toByteArray());
  }

  private static MockMultipartFile png() throws IOException {
    return image("png", "a.png", "image/png");
  }

  private static void api(int status, String code, Executable call) {
    ApiException e = assertThrows(ApiException.class, call);
    assertEquals(status, e.status);
    assertEquals(code, e.code);
  }

  private static void api(int status, String code, String message, Executable call) {
    ApiException e = assertThrows(ApiException.class, call);
    assertEquals(status, e.status);
    assertEquals(code, e.code);
    assertEquals(message, e.getMessage());
  }

  private void nothingUploadedOrSaved() throws Exception {
    verify(uploader, never()).upload(any(), anyMap());
    verify(accounts, never()).setAvatar(any(), any());
  }

  @Nested
  @DisplayName("replace(Account actor, MultipartFile file)")
  class ReplaceTests {
    @Test
    @DisplayName("UTC-ACC-105: ảnh PNG hợp lệ, có avatar cũ của chính mình")
    void acc105() throws Exception {
      when(accounts.setAvatar(me, NEW_URL)).thenReturn(OLD_URL);

      assertSame(detail, service.replace(me, png()));

      verify(uploader).upload(any(byte[].class), argThat(m -> "thors/avatars".equals(m.get("folder"))
              && m.get("public_id").toString().startsWith("u5_")));
      verify(accounts).setAvatar(me, NEW_URL);
      verify(uploader).destroy(eq("thors/avatars/u5_old"), anyMap());
    }

    @Test
    @DisplayName("UTC-ACC-106: ảnh JPG hợp lệ, chưa có avatar")
    void acc106() throws Exception {
      when(accounts.setAvatar(me, NEW_URL)).thenReturn(null);

      assertSame(detail, service.replace(me, image("jpg", "a.jpg", "image/jpeg")));

      verify(accounts).setAvatar(me, NEW_URL);
      verify(uploader, never()).destroy(any(), anyMap());
    }

    @Test
    @DisplayName("UTC-ACC-107: tệp rỗng")
    void acc107() throws Exception {
      api(400, "AVATAR_EMPTY", "Vui lòng chọn ảnh.",
              () -> service.replace(me, new MockMultipartFile("file", new byte[0])));
      nothingUploadedOrSaved();
    }

    @Test
    @DisplayName("UTC-ACC-108: không có tệp (null)")
    void acc108() throws Exception {
      api(400, "AVATAR_EMPTY", "Vui lòng chọn ảnh.", () -> service.replace(me, null));
      nothingUploadedOrSaved();
    }

    @Test
    @DisplayName("UTC-ACC-109: tệp 5 MB + 1 byte")
    void acc109() throws Exception {
      var big = new MockMultipartFile("file", "a.png", "image/png", new byte[5 * 1024 * 1024 + 1]);

      api(400, "AVATAR_SIZE", "Ảnh đại diện tối đa 5 MB.", () -> service.replace(me, big));
      nothingUploadedOrSaved();
    }

    @Test
    @DisplayName("UTC-ACC-110: tệp .png nhưng nội dung là văn bản")
    void acc110() throws Exception {
      var text = new MockMultipartFile("file", "a.png", "image/png", "hello".getBytes());

      api(400, "AVATAR_INVALID", "Chỉ nhận ảnh JPG hoặc PNG hợp lệ.", () -> service.replace(me, text));
      nothingUploadedOrSaved();
    }

    @Test
    @DisplayName("UTC-ACC-111: ảnh GIF")
    void acc111() throws Exception {
      var gif = image("gif", "a.gif", "image/gif");

      api(400, "AVATAR_INVALID", "Chỉ nhận ảnh JPG hoặc PNG hợp lệ.", () -> service.replace(me, gif));
      nothingUploadedOrSaved();
    }

    @Test
    @DisplayName("UTC-ACC-112: Cloudinary lỗi mạng khi tải lên")
    void acc112() throws Exception {
      when(uploader.upload(any(byte[].class), anyMap())).thenThrow(new IOException("network"));

      api(502, "AVATAR_UPLOAD", "Không tải được ảnh lên. Vui lòng thử lại.",
              () -> service.replace(me, png()));
      verify(accounts, never()).setAvatar(any(), any());
    }

    @Test
    @DisplayName("UTC-ACC-113: kết quả tải lên không có secure_url")
    void acc113() throws Exception {
      when(uploader.upload(any(byte[].class), anyMap())).thenReturn(Map.of());

      api(502, "AVATAR_UPLOAD", "Không tải được ảnh lên. Vui lòng thử lại.",
              () -> service.replace(me, png()));
      verify(accounts, never()).setAvatar(any(), any());
    }

    @Test
    @DisplayName("UTC-ACC-114: lưu vào hồ sơ thất bại thì xóa ảnh vừa tải lên")
    void acc114() throws Exception {
      when(accounts.setAvatar(me, NEW_URL)).thenThrow(new ApiException(409, "X", "x"));

      api(409, "X", () -> service.replace(me, png()));
      verify(uploader).destroy(eq("thors/avatars/u5_new"), anyMap());
    }

    @Test
    @DisplayName("UTC-ACC-115: xóa ảnh cũ bị lỗi mạng vẫn lưu thành công")
    void acc115() throws Exception {
      when(accounts.setAvatar(me, NEW_URL)).thenReturn(OLD_URL);
      when(uploader.destroy(any(), anyMap())).thenThrow(new IOException("network"));

      assertSame(detail, service.replace(me, png()));
      verify(accounts).setAvatar(me, NEW_URL);
    }

    @Test
    @DisplayName("UTC-ACC-116: link cũ trùng link mới")
    void acc116() throws Exception {
      when(accounts.setAvatar(me, NEW_URL)).thenReturn(NEW_URL);

      assertSame(detail, service.replace(me, png()));
      verify(accounts).setAvatar(me, NEW_URL);
      verify(uploader, never()).destroy(any(), anyMap());
    }
  }

  @Nested
  @DisplayName("remove(Account actor)")
  class RemoveTests {
    @Test
    @DisplayName("UTC-ACC-117: gỡ avatar của chính mình")
    void acc117() throws Exception {
      when(accounts.setAvatar(me, null)).thenReturn(OLD_URL);

      assertSame(detail, service.remove(me));

      verify(accounts).setAvatar(me, null);
      verify(uploader).destroy(eq("thors/avatars/u5_old"), anyMap());
    }

    @Test
    @DisplayName("UTC-ACC-118: chưa có avatar")
    void acc118() throws Exception {
      when(accounts.setAvatar(me, null)).thenReturn(null);

      assertSame(detail, service.remove(me));
      verify(accounts).setAvatar(me, null);
      verify(uploader, never()).destroy(any(), anyMap());
    }

    @Test
    @DisplayName("UTC-ACC-119: avatar cũ không phải ảnh của chính tài khoản")
    void acc119() throws Exception {
      String[] foreign = {
        BASE + "thors/avatars/u55_x.jpg", // avatar người khác
        BASE + "thors/avatars/u6_x.jpg", // avatar người khác
        BASE + "thors/products/abc.jpg", // ảnh sản phẩm
        "https://res.cloudinary.com/othercloud/image/upload/v1/thors/avatars/u5_x.jpg", // cloud khác
        "https://lh3.googleusercontent.com/a/photo.jpg", // ảnh Google
        BASE + "thors/avatars/u5_../products/abc.jpg" // đường dẫn có '..'
      };
      for (String old : foreign) {
        when(accounts.setAvatar(me, null)).thenReturn(old);
        service.remove(me);
      }

      verify(accounts, times(foreign.length)).setAvatar(me, null);
      verify(uploader, never()).destroy(any(), anyMap());
    }
  }
}
