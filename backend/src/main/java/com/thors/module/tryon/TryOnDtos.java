package com.thors.module.tryon;

import java.time.LocalDateTime;
import java.util.List;

/** Dữ liệu trả cho giao diện mặc thử 2D. */
public final class TryOnDtos {

    private TryOnDtos() {
    }

    /** Một món trong lần thử (theo thứ tự mặc). */
    public record JobItem(int productId, String productName, String garment, String imageUrl) {
    }

    /**
     * Trạng thái 1 lần mặc thử. Giao diện hỏi lại định kỳ tới khi status = DONE / FAILED.
     *
     * @param mode PHOTO (ảnh của khách) | MODEL (người mẫu dựng sẵn) | GENERATE (AI tạo người mẫu)
     * @param mock true = ảnh mẫu (chưa bật dịch vụ AI thật)
     * @param reused true = đã có sẵn kết quả (cùng ảnh / người mẫu + cùng món), không tính lượt
     * @param skipped tên các món không vẽ được (giày dép...) - chỉ có khi vừa tạo
     * @param photoAvailable ảnh của khách còn lưu (dùng lại được khi "đổi món")
     */
    public record JobView(long jobId, String status, String mode, Integer modelId, String resultImageUrl,
                          String errorMessage, boolean mock, boolean reused, List<JobItem> items, List<String> skipped,
                          LocalDateTime createdAt, LocalDateTime expiresAt, boolean photoAvailable) {
    }

    /**
     * Số lượt còn lại trong 24 giờ + dịch vụ đang dùng. ready = false khi DB chưa có bảng.
     * generateSupported = false: dịch vụ hiện tại không tự tạo người mẫu (ẩn chế độ "AI tạo người mẫu").
     */
    public record Quota(boolean ready, int limit, int used, int remaining, boolean mock, int keepHours,
                        boolean generateSupported) {
    }

    /** Người mẫu cho khách chọn (không lộ ghi chú nội bộ). */
    public record ModelCard(int modelId, String gender, String bodyType, int heightCm, String imageUrl) {
    }

    /**
     * Danh sách người mẫu + người mẫu gợi ý theo số đo đã lưu.
     *
     * @param generateDescription mô tả người mẫu AI sẽ tạo (null = chưa lưu số đo)
     */
    public record ModelChoice(List<ModelCard> models, Integer suggestedModelId, String gender,
                              String generateDescription) {
    }
}
