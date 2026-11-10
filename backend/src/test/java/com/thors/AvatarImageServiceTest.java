package com.thors;

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
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class AvatarImageServiceTest {
    private static final String BASE = "https://res.cloudinary.com/testcloud/image/upload/v1730812345/";
    private static final String NEW_URL = BASE + "thors/avatars/u5_new.png";
    private static final LocalDateTime T = LocalDateTime.of(2026, 1, 1, 8, 0);

    Uploader uploader;
    AccountService accounts;
    AvatarImageService service;
    final Account me = new Account(5, "OWNER", "Me", "hash", "me@mail.com", null, null, null,
            "ACTIVE", T, T, null, 0L, null);
    final AccountDetail detail = new AccountDetail(5, "OWNER", "Me", "me@mail.com", null, null, NEW_URL,
            "ACTIVE", false, true, T, null, null);

    @BeforeEach
    void setUp() throws Exception {
        Cloudinary cloudinary = spy(new Cloudinary(Map.of("cloud_name", "testcloud", "api_key", "k", "api_secret", "s")));
        uploader = mock(Uploader.class);
        doReturn(uploader).when(cloudinary).uploader();
        when(uploader.upload(any(byte[].class), anyMap())).thenReturn(Map.of("secure_url", NEW_URL));
        accounts = mock(AccountService.class);
        when(accounts.profile(me)).thenReturn(detail);
        service = new AvatarImageService(cloudinary, accounts);
    }

    private static MockMultipartFile png() throws IOException {
        var out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB), "png", out);
        return new MockMultipartFile("file", "a.png", "image/png", out.toByteArray());
    }

    private static void fail(int status, String code, org.junit.jupiter.api.function.Executable call) {
        ApiException ex = assertThrows(ApiException.class, call);
        assertEquals(status, ex.status);
        assertEquals(code, ex.code);
    }

    @Test
    @DisplayName("Saving a new avatar uploads it under the user's id, stores it and deletes the old one")
    void replaceUploadsSavesAndDeletesOld() throws Exception {
        when(accounts.setAvatar(me, NEW_URL)).thenReturn(BASE + "thors/avatars/u5_old.jpg");
        assertSame(detail, service.replace(me, png()));
        verify(uploader).upload(any(byte[].class), argThat(m ->
                "thors/avatars".equals(m.get("folder")) && m.get("public_id").toString().startsWith("u5_")));
        verify(accounts).setAvatar(me, NEW_URL);
        verify(uploader).destroy(eq("thors/avatars/u5_old"), anyMap());
    }

    @Test
    @DisplayName("First avatar (no old one): nothing is deleted")
    void replaceWithoutOldAvatar() throws Exception {
        when(accounts.setAvatar(me, NEW_URL)).thenReturn(null);
        service.replace(me, png());
        verify(uploader, never()).destroy(any(), anyMap());
    }

    @Test
    @DisplayName("Removing the avatar clears it and deletes the image on Cloudinary")
    void removeDeletesImage() throws Exception {
        when(accounts.setAvatar(me, null)).thenReturn(BASE + "thors/avatars/u5_old.jpg");
        assertSame(detail, service.remove(me));
        verify(uploader).destroy(eq("thors/avatars/u5_old"), anyMap());
    }

    @Test
    @DisplayName("Never deletes images that are not this user's avatar on this cloud")
    void neverDeletesForeignImages() throws Exception {
        for (String old : new String[] {
                BASE + "thors/products/abc.jpg",                                             // ảnh sản phẩm
                BASE + "thors/avatars/u55_x.jpg",                                            // avatar người khác
                BASE + "thors/avatars/u6_x.jpg",
                "https://res.cloudinary.com/othercloud/image/upload/v1/thors/avatars/u5_x.jpg", // cloud khác
                "https://lh3.googleusercontent.com/a/photo.jpg"}) {                          // ảnh Google
            when(accounts.setAvatar(me, null)).thenReturn(old);
            service.remove(me);
        }
        verify(uploader, never()).destroy(any(), anyMap());
    }

    @Test
    @DisplayName("If saving to the profile fails, the just-uploaded image is deleted and the error is rethrown")
    void saveFailureCleansUpNewUpload() throws Exception {
        when(accounts.setAvatar(me, NEW_URL)).thenThrow(new ApiException(409, "X", "x"));
        fail(409, "X", () -> service.replace(me, png()));
        verify(uploader).destroy(eq("thors/avatars/u5_new"), anyMap());
    }

    @Test
    @DisplayName("Failing to delete the old image does not fail the save")
    void deleteFailureIsIgnored() throws Exception {
        when(accounts.setAvatar(me, NEW_URL)).thenReturn(BASE + "thors/avatars/u5_old.jpg");
        when(uploader.destroy(any(), anyMap())).thenThrow(new IOException("network"));
        assertSame(detail, service.replace(me, png()));
    }

    @Test
    @DisplayName("Rejects empty files, files over 5 MB and non-images without uploading or saving")
    void rejectsInvalidFiles() throws Exception {
        fail(400, "AVATAR_EMPTY", () -> service.replace(me, new MockMultipartFile("file", new byte[0])));
        fail(400, "AVATAR_SIZE", () -> service.replace(me, new MockMultipartFile("file", "a.png", "image/png", new byte[5 * 1024 * 1024 + 1])));
        fail(400, "AVATAR_INVALID", () -> service.replace(me, new MockMultipartFile("file", "a.png", "image/png", "hello".getBytes())));
        var gif = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB), "gif", gif);
        fail(400, "AVATAR_INVALID", () -> service.replace(me, new MockMultipartFile("file", "a.gif", "image/gif", gif.toByteArray())));
        verify(uploader, never()).upload(any(), anyMap());
        verify(accounts, never()).setAvatar(any(), any());
    }

    @Test
    @DisplayName("A Cloudinary upload failure becomes 502 AVATAR_UPLOAD and the profile is not changed")
    void uploadFailure() throws Exception {
        when(uploader.upload(any(byte[].class), anyMap())).thenThrow(new IOException("network"));
        fail(502, "AVATAR_UPLOAD", () -> service.replace(me, png()));
        verify(accounts, never()).setAvatar(any(), any());
    }
}
