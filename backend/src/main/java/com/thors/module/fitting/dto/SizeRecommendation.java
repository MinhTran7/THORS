package com.thors.module.fitting.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Kết quả gợi ý size cho khách.
 *
 * @param recommendedSize size khớp số đo nhất (null nếu không đủ dữ liệu để so)
 * @param confidence HIGH (vừa mọi số đo) | MEDIUM (lệch ít) | LOW (lệch nhiều: bảng size có thể không hợp dáng)
 * @param inStock size gợi ý còn hàng bán online không
 * @param alternativeSize size gần nhất còn hàng khi size gợi ý hết (null nếu không cần / không có)
 * @param usedSavedProfile true = dùng số đo khách đã lưu ở "Số đo của tôi"
 * @param sizes chi tiết từng size (đã xếp từ khớp nhất), để giao diện / bước "thử 3D" tô màu
 */
public record SizeRecommendation(
        String recommendedSize,
        String confidence,
        boolean inStock,
        String alternativeSize,
        boolean usedSavedProfile,
        List<SizeFit> sizes) {

    /** Mức khớp của một size: score 0 = vừa hết; càng lớn càng lệch. */
    public record SizeFit(String size, double score, boolean inStock, List<MeasureFit> details) {
    }

    /**
     * Một số đo của một size. status: FIT (vừa) | TIGHT (chật) | LOOSE (rộng) | SHORT (ngắn) | LONG (dài).
     * value = số đo khách (đã cộng/trừ theo kiểu mặc ôm/rộng với các vòng đo).
     */
    public record MeasureFit(String measure, String label, BigDecimal value, BigDecimal min, BigDecimal max, String status) {
    }
}
