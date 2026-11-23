package com.thors.module.tryon;

import com.thors.module.tryon.TryOnPlan.Garment;

/**
 * Dịch vụ AI vẽ ảnh "người mặc món đồ". Đổi dịch vụ (FASHN, fal.ai, ...) chỉ cần thêm một lớp mới,
 * chọn bằng cấu hình thors.tryon.provider - phần job / lưu ảnh / giới hạn lượt không đổi.
 */
public interface TryOnProvider {

    /** Tên ghi vào tryon_job.provider (MOCK, FASHN, ...). */
    String name();

    /** Dịch vụ có tự tạo người mẫu được không (chế độ GENERATE). */
    default boolean supportsGenerate() {
        return true;
    }

    /**
     * Vẽ 1 món lên ảnh người (chạy trong luồng nền, được phép chờ lâu).
     *
     * @param personImageUrl ảnh người (https, dịch vụ ngoài tải được)
     * @param garmentImageUrl ảnh sản phẩm (https)
     * @return ảnh kết quả: đường dẫn https hoặc nội dung ảnh (JPG / PNG)
     * @throws TryOnException lỗi có thông báo hiển thị được cho khách
     */
    Image apply(String personImageUrl, String garmentImageUrl, Garment garment);

    /**
     * AI tạo người mẫu mới (theo mô tả dáng người) đang mặc món đồ - chế độ GENERATE, không cần ảnh người.
     *
     * @param personDescription mô tả người mẫu (TryOnModels.describe)
     */
    Image generate(String garmentImageUrl, Garment garment, String personDescription);

    /** Ảnh trả về: một trong hai trường khác null. */
    record Image(String url, byte[] bytes) {
        public static Image ofUrl(String url) {
            return new Image(url, null);
        }

        public static Image ofBytes(byte[] bytes) {
            return new Image(null, bytes);
        }
    }

    /** Lỗi từ dịch vụ AI; message hiển thị cho khách (tiếng Việt, không lộ chi tiết kỹ thuật). */
    class TryOnException extends RuntimeException {
        public TryOnException(String message) {
            super(message);
        }

        public TryOnException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
