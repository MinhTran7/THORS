package com.thors.module.fitting.garment;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import com.thors.common.ApiException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * File GLB quần áo 3D trên Cloudinary (thư mục thors/garments, dạng raw, dùng chung cấu hình CloudinaryConfig).
 * Tên file: p{productId}_{ngẫu nhiên}.glb - mỗi lần thay file là tên mới (trình duyệt không dùng nhầm bản cũ trong cache),
 * file cũ xóa sau khi lưu DB xong. Chỉ xóa file đúng tiền tố của sản phẩm (không bao giờ đụng ảnh sản phẩm / try-on).
 */
@Component
public class GarmentModelStore {

    static final String FOLDER = "thors/garments";
    private static final Logger log = LoggerFactory.getLogger(GarmentModelStore.class);

    private final Cloudinary cloudinary;

    public GarmentModelStore(Cloudinary cloudinary) {
        this.cloudinary = cloudinary;
    }

    /** File đã tải lên: link https + public_id (để xóa / thay). */
    public record Stored(String url, String publicId) {
    }

    public Stored upload(int productId, byte[] bytes) {
        try {
            Map<?, ?> result = cloudinary.uploader().upload(bytes, ObjectUtils.asMap(
                    "folder", FOLDER,
                    "public_id", "p" + productId + "_" + UUID.randomUUID().toString().replace("-", "") + ".glb",
                    "resource_type", "raw",
                    "overwrite", false));
            return new Stored(String.valueOf(result.get("secure_url")), String.valueOf(result.get("public_id")));
        } catch (Exception e) {
            log.warn("Garment model upload failed (product {}): {}", productId, e.toString());
            throw new ApiException(502, "GARMENT_UPLOAD_FAILED", "Không tải được file mô hình 3D lên kho lưu trữ. Hãy thử lại.");
        }
    }

    /** Xóa file của sản phẩm (bỏ qua nếu public_id không đúng tiền tố của sản phẩm đó). Lỗi chỉ ghi log. */
    public void destroy(int productId, String publicId) {
        if (!belongsTo(productId, publicId)) return;
        try {
            cloudinary.uploader().destroy(publicId, ObjectUtils.asMap("resource_type", "raw", "invalidate", true));
        } catch (Exception e) {
            log.warn("Garment model delete failed ({}): {}", publicId, e.toString());
        }
    }

    /** Một file trên Cloudinary: public_id + thời điểm tải lên (null nếu không đọc được). */
    public record CloudFile(String publicId, Instant createdAt) {
    }

    /** Mọi file trong thors/garments (để dọn file không còn sản phẩm nào dùng). Lỗi -> danh sách rỗng. */
    @SuppressWarnings("unchecked") // ObjectUtils.asMap trả Map thô của thư viện Cloudinary
    public List<CloudFile> listFiles() {
        List<CloudFile> files = new ArrayList<>();
        String cursor = null;
        try {
            do {
                Map<String, Object> options = ObjectUtils.asMap(
                        "type", "upload", "resource_type", "raw", "prefix", FOLDER + "/", "max_results", 500);
                if (cursor != null) options.put("next_cursor", cursor);
                Map<?, ?> page = cloudinary.api().resources(options);
                if (page.get("resources") instanceof List<?> resources) {
                    for (Object r : resources) {
                        if (r instanceof Map<?, ?> m && m.get("public_id") != null) {
                            files.add(new CloudFile(String.valueOf(m.get("public_id")), parseInstant(m.get("created_at"))));
                        }
                    }
                }
                Object next = page.get("next_cursor");
                cursor = next == null ? null : String.valueOf(next);
            } while (cursor != null);
        } catch (Exception e) {
            log.warn("Garment model listing failed: {}", e.toString());
            return List.of();
        }
        return files;
    }

    private static Instant parseInstant(Object value) {
        try {
            return value == null ? null : Instant.parse(String.valueOf(value));
        } catch (Exception e) {
            return null;
        }
    }

    /** Xóa file theo public_id (chỉ trong thors/garments). Dùng khi dọn file mồ côi. */
    void destroyOrphan(String publicId) {
        if (publicId == null || !publicId.startsWith(FOLDER + "/p") || publicId.contains("..")) return;
        try {
            cloudinary.uploader().destroy(publicId, ObjectUtils.asMap("resource_type", "raw", "invalidate", true));
        } catch (Exception e) {
            log.warn("Garment orphan delete failed ({}): {}", publicId, e.toString());
        }
    }

    static boolean belongsTo(int productId, String publicId) {
        return publicId != null && publicId.startsWith(FOLDER + "/p" + productId + "_") && !publicId.contains("..");
    }
}
