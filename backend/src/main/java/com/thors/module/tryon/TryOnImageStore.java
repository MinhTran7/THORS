package com.thors.module.tryon;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import com.thors.common.ApiException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/**
 * Ảnh thử đồ trên Cloudinary (thư mục thors/tryon, dùng chung cấu hình CloudinaryConfig).
 * public_id dạng {@code thors/tryon/u<userId>_<ngẫu nhiên>}: chỉ xóa được ảnh mang đúng id của khách,
 * không bao giờ xóa nhầm ảnh sản phẩm dù cột URL chứa gì.
 */
@Component
public class TryOnImageStore {

    static final long MAX_BYTES = 8 * 1024 * 1024;
    static final int MIN_SIDE = 384;
    static final String FOLDER = "thors/tryon";
    private static final long MAX_PIXELS = 25_000_000;
    private static final Logger log = LoggerFactory.getLogger(TryOnImageStore.class);
    private static final Pattern DELIVERY =
            Pattern.compile("^https://res\\.cloudinary\\.com/([^/]+)/image/upload/(?:v\\d+/)?(.+?)(?:\\.[a-zA-Z0-9]+)?$");

    private final Cloudinary cloudinary;

    public TryOnImageStore(Cloudinary cloudinary) {
        this.cloudinary = cloudinary;
    }

    /** Đọc + kiểm tra ảnh tải lên (JPG / PNG thật, không quá lớn / quá nhỏ): ảnh khách và ảnh người mẫu. */
    public byte[] readPhoto(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ApiException(400, "TRYON_PHOTO_EMPTY", "Vui lòng chọn hoặc chụp ảnh của bạn.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ApiException(400, "TRYON_PHOTO_SIZE", "Ảnh tối đa 8 MB.");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new ApiException(400, "TRYON_PHOTO_INVALID", "Không đọc được ảnh. Vui lòng chọn ảnh JPG hoặc PNG.");
        }
        checkImage(bytes);
        return bytes;
    }

    /** Kiểm tra nội dung thật (không tin Content-Type), kích thước đủ để AI vẽ rõ. */
    static void checkImage(byte[] bytes) {
        int w;
        int h;
        try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            if (input == null) throw new IOException("stream");
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw new IOException("format");
            var reader = readers.next();
            try {
                reader.setInput(input, true, true);
                String format = reader.getFormatName().toLowerCase(Locale.ROOT);
                if (!Set.of("jpeg", "jpg", "png").contains(format)) throw new IOException("format");
                w = reader.getWidth(0);
                h = reader.getHeight(0);
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            throw new ApiException(400, "TRYON_PHOTO_INVALID", "Chỉ nhận ảnh JPG hoặc PNG hợp lệ.");
        }
        if ((long) w * h > MAX_PIXELS) {
            throw new ApiException(400, "TRYON_PHOTO_INVALID", "Ảnh quá lớn, vui lòng chọn ảnh nhỏ hơn.");
        }
        if (Math.min(w, h) < MIN_SIDE) {
            throw new ApiException(400, "TRYON_PHOTO_SMALL",
                    "Ảnh quá nhỏ (cạnh ngắn tối thiểu " + MIN_SIDE + " px). Hãy dùng ảnh rõ, thấy cả người.");
        }
    }

    /**
     * Đường dẫn ảnh ở dạng JPG để mọi dịch vụ đọc được (Java ImageIO không đọc WebP / AVIF):
     * Cloudinary đổi định dạng theo đuôi (.webp -> .jpg), Unsplash theo tham số fm=jpg. Ảnh nơi khác giữ nguyên.
     */
    public static String jpegUrl(String url) {
        if (url == null) return null;
        if (url.startsWith("https://res.cloudinary.com/") && url.contains("/image/upload/")) {
            int q = url.indexOf('?');
            String path = q < 0 ? url : url.substring(0, q);
            int slash = path.lastIndexOf('/');
            int dot = path.lastIndexOf('.');
            String base = dot > slash ? path.substring(0, dot) : path;
            return base + ".jpg";
        }
        if (url.startsWith("https://images.unsplash.com/")) {
            String noFm = url.replaceAll("([?&])fm=[^&]*&?", "$1").replaceAll("[?&]$", "");
            return noFm + (noFm.contains("?") ? "&" : "?") + "fm=jpg";
        }
        return url;
    }

    public static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Thư mục ảnh người mẫu dựng sẵn (tách khỏi ảnh của khách). */
    static final String MODEL_FOLDER = "thors/tryon-models";

    /** Ảnh của khách / kết quả riêng của khách: thors/tryon/u<userId>_... */
    public String upload(int userId, Object source) {
        return upload(FOLDER, "u" + userId + "_", source);
    }

    /** Kết quả mặc trên người mẫu (dùng chung mọi khách): thors/tryon/m<modelId>_... */
    public String uploadShared(int modelId, Object source) {
        return upload(FOLDER, "m" + modelId + "_", source);
    }

    /** Ảnh người mẫu Owner tải lên: thors/tryon-models/model_... */
    public String uploadModel(byte[] bytes) {
        return upload(MODEL_FOLDER, "model_", bytes);
    }

    /** Đẩy ảnh (nội dung hoặc đường dẫn https của dịch vụ AI) lên Cloudinary, trả secure_url. */
    private String upload(String folder, String prefix, Object source) {
        Map<?, ?> result;
        try {
            result = cloudinary.uploader().upload(source, ObjectUtils.asMap(
                    "folder", folder,
                    "public_id", prefix + UUID.randomUUID().toString().replace("-", ""),
                    "overwrite", false,
                    "resource_type", "image"));
        } catch (Exception e) {
            log.warn("Try-on image upload failed ({}{}): {}", folder, prefix, e.toString());
            throw new ApiException(502, "TRYON_UPLOAD", "Không tải được ảnh lên. Vui lòng thử lại.");
        }
        Object url = result == null ? null : result.get("secure_url");
        if (url == null || !url.toString().startsWith("https://")) {
            throw new ApiException(502, "TRYON_UPLOAD", "Không tải được ảnh lên. Vui lòng thử lại.");
        }
        return url.toString();
    }

    /** Xóa ảnh thử đồ của đúng khách này; ảnh khác (sản phẩm, người mẫu, cloud khác...) bỏ qua. */
    public void destroy(int userId, String url) {
        destroyPrefixed(FOLDER + "/u" + userId + "_", url);
    }

    /** Xóa kết quả dùng chung của người mẫu này. */
    public void destroyShared(int modelId, String url) {
        destroyPrefixed(FOLDER + "/m" + modelId + "_", url);
    }

    /** Xóa ảnh người mẫu (chỉ ảnh trong thư mục người mẫu). */
    public void destroyModel(String url) {
        destroyPrefixed(MODEL_FOLDER + "/model_", url);
    }

    /** Lỗi chỉ ghi log: dữ liệu đã lưu xong, không làm hỏng thao tác của người dùng. */
    private void destroyPrefixed(String prefix, String url) {
        String publicId = publicIdWithPrefix(prefix, url);
        if (publicId == null) return;
        try {
            cloudinary.uploader().destroy(publicId, ObjectUtils.asMap("resource_type", "image", "invalidate", true));
        } catch (Exception e) {
            log.warn("Could not delete try-on image {}: {}", publicId, e.toString());
        }
    }

    String ownedPublicId(int userId, String url) {
        return publicIdWithPrefix(FOLDER + "/u" + userId + "_", url);
    }

    private String publicIdWithPrefix(String prefix, String url) {
        if (url == null) return null;
        var m = DELIVERY.matcher(url);
        if (!m.matches() || !m.group(1).equals(cloudinary.config.cloudName)) return null;
        String publicId = m.group(2);
        return publicId.startsWith(prefix) && !publicId.contains("..") ? publicId : null;
    }
}
