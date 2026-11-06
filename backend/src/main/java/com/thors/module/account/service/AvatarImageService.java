package com.thors.module.account.service;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import com.thors.common.ApiException;
import com.thors.module.account.dto.AccountDetail;
import com.thors.module.account.entity.Account;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * Ảnh đại diện trên Cloudinary, dùng chung cấu hình của backend (CloudinaryConfig).
 *
 * <p>Ảnh chỉ được đẩy lên khi người dùng bấm Lưu. Mỗi ảnh có public_id {@code thors/avatars/u<id>_<random>}
 * nên khi đổi/gỡ ảnh chỉ xóa được ảnh mang đúng id của chủ tài khoản, không bao giờ xóa nhầm ảnh sản
 * phẩm hay avatar của người khác dù cột avatar_url chứa đường dẫn gì.
 */
@Service
public class AvatarImageService {
    static final long MAX_BYTES = 5 * 1024 * 1024;
    static final String FOLDER = "thors/avatars";
    private static final long MAX_PIXELS = 20_000_000;
    private static final Logger log = LoggerFactory.getLogger(AvatarImageService.class);
    // .../image/upload/[v123/]thors/avatars/u5_abc.jpg
    private static final Pattern DELIVERY =
            Pattern.compile("^https://res\\.cloudinary\\.com/([^/]+)/image/upload/(?:v\\d+/)?(.+?)(?:\\.[a-zA-Z0-9]+)?$");

    private final Cloudinary cloudinary;
    private final AccountService accounts;

    public AvatarImageService(Cloudinary cloudinary, AccountService accounts) {
        this.cloudinary = cloudinary;
        this.accounts = accounts;
    }

    /** Lưu ảnh mới làm avatar: kiểm tra → đẩy lên Cloudinary → ghi vào hồ sơ → xóa ảnh cũ. */
    public AccountDetail replace(Account actor, MultipartFile file) {
        byte[] bytes = read(file);
        checkImage(bytes);
        String url = upload(actor.id(), bytes);
        String old;
        try {
            old = accounts.setAvatar(actor, url);
        } catch (RuntimeException e) {
            // Không lưu được vào hồ sơ thì ảnh vừa đẩy lên là rác: xóa đi rồi báo lỗi như cũ.
            destroyOwned(actor.id(), url);
            throw e;
        }
        if (!url.equals(old)) destroyOwned(actor.id(), old);
        return accounts.profile(actor);
    }

    /** Gỡ avatar khỏi hồ sơ rồi xóa ảnh trên Cloudinary. */
    public AccountDetail remove(Account actor) {
        destroyOwned(actor.id(), accounts.setAvatar(actor, null));
        return accounts.profile(actor);
    }

    /**
     * public_id của ảnh nếu đường dẫn là avatar của đúng tài khoản này trên đúng cloud của backend; null
     * nếu là ảnh khác (ảnh Google, ảnh sản phẩm, avatar người khác, cloud khác…) và không được xóa.
     */
    String ownedPublicId(int userId, String url) {
        if (url == null) return null;
        var m = DELIVERY.matcher(url);
        if (!m.matches() || !m.group(1).equals(cloudinary.config.cloudName)) return null;
        String publicId = m.group(2);
        return publicId.startsWith(FOLDER + "/u" + userId + "_") && !publicId.contains("..") ? publicId : null;
    }

    /** Xóa ảnh cũ; lỗi chỉ ghi log vì hồ sơ đã lưu xong, không làm hỏng thao tác của người dùng. */
    private void destroyOwned(int userId, String url) {
        String publicId = ownedPublicId(userId, url);
        if (publicId == null) return;
        try {
            cloudinary.uploader().destroy(publicId, ObjectUtils.asMap("resource_type", "image", "invalidate", true));
        } catch (Exception e) {
            log.warn("Could not delete old avatar {} of user {}: {}", publicId, userId, e.toString());
        }
    }

    private String upload(int userId, byte[] bytes) {
        Map<?, ?> result;
        try {
            result = cloudinary.uploader().upload(bytes, ObjectUtils.asMap(
                    "folder", FOLDER,
                    "public_id", "u" + userId + "_" + UUID.randomUUID().toString().replace("-", ""),
                    "overwrite", false,
                    "resource_type", "image"));
        } catch (Exception e) {
            throw new ApiException(502, "AVATAR_UPLOAD", "Không tải được ảnh lên. Vui lòng thử lại.");
        }
        Object url = result == null ? null : result.get("secure_url");
        if (url == null || !url.toString().startsWith("https://"))
            throw new ApiException(502, "AVATAR_UPLOAD", "Không tải được ảnh lên. Vui lòng thử lại.");
        return url.toString();
    }

    private static byte[] read(MultipartFile file) {
        if (file == null || file.isEmpty())
            throw new ApiException(400, "AVATAR_EMPTY", "Vui lòng chọn ảnh.");
        if (file.getSize() > MAX_BYTES)
            throw new ApiException(400, "AVATAR_SIZE", "Ảnh đại diện tối đa 5 MB.");
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw new ApiException(400, "AVATAR_INVALID", "Không đọc được ảnh. Vui lòng chọn ảnh JPG hoặc PNG.");
        }
    }

    /** Kiểm tra nội dung thật là JPG/PNG giải mã được, không tin Content-Type do client gửi. */
    private static void checkImage(byte[] bytes) {
        try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw new IOException("not an image");
            var reader = readers.next();
            try {
                reader.setInput(input);
                String format = reader.getFormatName().toLowerCase(Locale.ROOT);
                if (!Set.of("jpeg", "jpg", "png").contains(format)) throw new IOException("format");
                long pixels = (long) reader.getWidth(0) * reader.getHeight(0);
                if (pixels <= 0 || pixels > MAX_PIXELS) throw new IOException("dimensions");
                if (reader.read(0) == null) throw new IOException("decode");
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            throw new ApiException(400, "AVATAR_INVALID", "Chỉ nhận ảnh JPG hoặc PNG hợp lệ.");
        }
    }
}
