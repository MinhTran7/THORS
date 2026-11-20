package com.thors.module.outfit;

import java.util.List;
import java.util.Map;

/** Dữ liệu vào / ra của module phối đồ (gom một file cho gọn). */
public final class OutfitDtos {

    private OutfitDtos() {
    }

    /**
     * Yêu cầu phối đồ.
     *
     * @param occasion mã dịp (WORK, PARTY...) - bắt buộc
     * @param budget ngân sách tối đa cho cả bộ (VNĐ) - bắt buộc
     * @param gender MALE / FEMALE; bỏ trống = theo số đo đã lưu (chưa có thì không lọc)
     * @param styles phong cách thích; bỏ trống = theo hồ sơ phong cách đã lưu
     * @param avoidColors màu tránh; bỏ trống = theo hồ sơ phong cách đã lưu
     * @param keepDetailIds các món đang giữ (khi bấm "Đổi món" ở món khác)
     * @param excludeProductIds sản phẩm khách đã bỏ qua (bấm "Đổi món")
     */
    public record OutfitRequest(
            String occasion,
            Long budget,
            String gender,
            List<String> styles,
            List<String> avoidColors,
            List<Integer> keepDetailIds,
            List<Integer> excludeProductIds) {
    }

    public record OutfitItem(
            String role,
            String roleLabel,
            int productId,
            String productName,
            String imageUrl,
            int detailId,
            String size,
            String color,
            long price,
            String sizeNote) {
    }

    /** Một bộ: các món, tổng tiền, tiền còn dư so với ngân sách, lý do gợi ý. */
    public record OutfitView(List<OutfitItem> items, long total, long remaining, List<String> reasons) {
    }

    /**
     * @param outfits các bộ gợi ý, tốt nhất trước (rỗng -> xem message)
     * @param usedBodyProfile có dùng số đo đã lưu để chọn size không
     */
    public record OutfitResponse(List<OutfitView> outfits, String message, boolean usedBodyProfile) {
    }

    /** Danh sách dịp / phong cách (mã -> nhãn) cho giao diện. */
    public record OutfitOptions(Map<String, String> occasions, Map<String, String> styles) {
    }

    /** Thẻ của sản phẩm. guessed = chưa được gắn, đang dùng thẻ đoán theo tên. */
    public record ProductStyle(List<String> occasions, List<String> styles, boolean guessed) {
    }

    public record ProductStyleRequest(List<String> occasions, List<String> styles) {
    }

    /** Hồ sơ phong cách của khách (đều không bắt buộc). */
    public record StyleProfile(Integer birthYear, String occupation, List<String> preferredStyles, List<String> avoidColors) {
    }
}
