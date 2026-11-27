package com.thors.module.promotion.entity;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;

public record Promotion(
        Integer promotionId,
        String type,
        String name,
        String description,
        String discountType,
        BigDecimal discountValue,
        BigDecimal minOrderValue,
        BigDecimal maxDiscountAmount,
        Integer usageLimit,
        Integer usedCount,
        String applyScope,
        List<Integer> productIds,
        LocalDateTime startDate,
        LocalDateTime endDate,
        String status
) {
    public static final String PRODUCT_DISCOUNT = "PRODUCT_DISCOUNT";
    public static final String ORDER_VOUCHER = "ORDER_VOUCHER";

    public enum Schedule { UPCOMING, ONGOING, ENDED }

    public boolean isOrderVoucher() {
        return ORDER_VOUCHER.equals(type);
    }

    public boolean isActive() {
        return "ACTIVE".equals(status);
    }

    public boolean isExhausted() {
        return usageLimit != null && usedCount != null && usedCount >= usageLimit;
    }

    // Lượt còn lại của mã giảm giá online; null = không giới hạn
    public Integer remaining() {
        return usageLimit == null ? null : Math.max(0, usageLimit - (usedCount == null ? 0 : usedCount));
    }

    public Schedule schedule(LocalDateTime now) {
        if (now.isBefore(startDate)) return Schedule.UPCOMING;
        if (!now.isBefore(endDate)) return Schedule.ENDED;
        return Schedule.ONGOING;
    }

    // Thao tác được phép theo lịch và trạng thái bật/tắt
    public boolean canEdit(LocalDateTime now) {
        return schedule(now) == Schedule.UPCOMING;
    }

    public boolean canAdjust(LocalDateTime now) {
        return schedule(now) == Schedule.ONGOING;
    }

    public boolean canEnable(LocalDateTime now) {
        return !isActive() && schedule(now) != Schedule.ENDED;
    }

    public boolean canDisable(LocalDateTime now) {
        return isActive() && schedule(now) == Schedule.UPCOMING;
    }

    public boolean canEndEarly(LocalDateTime now) {
        return isActive() && schedule(now) == Schedule.ONGOING;
    }

    public boolean canDelete(LocalDateTime now) {
        return schedule(now) == Schedule.UPCOMING;
    }

    // Số tiền được giảm trên amount; mã giảm % có thể bị chặn bởi mức giảm tối đa
    public BigDecimal discountOf(BigDecimal amount) {
        BigDecimal discount = discountOf(amount, discountType, discountValue);
        return maxDiscountAmount == null ? discount : discount.min(maxDiscountAmount);
    }

    public BigDecimal priceAfter(BigDecimal price) {
        return price.subtract(discountOf(price));
    }

    public static BigDecimal discountOf(BigDecimal amount, String type, BigDecimal value) {
        BigDecimal discount = "PERCENT".equals(type)
                ? amount.multiply(value).divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP)
                : value;
        return discount.min(amount);
    }

    public Promotion withProductIds(List<Integer> ids) {
        return new Promotion(promotionId, type, name, description, discountType, discountValue, minOrderValue, maxDiscountAmount,
                usageLimit, usedCount, applyScope, ids, startDate, endDate, status);
    }
}
