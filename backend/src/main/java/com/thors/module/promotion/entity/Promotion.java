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
        Integer usageLimit,
        Integer usedCount,
        String applyScope,
        List<Integer> productIds,
        LocalDateTime startDate,
        LocalDateTime endDate,
        String status,
        Integer createdBy
) {
    public static final String PRODUCT_DISCOUNT = "PRODUCT_DISCOUNT";
    public static final String ORDER_VOUCHER = "ORDER_VOUCHER";

    public enum Schedule { UPCOMING, ONGOING, ENDED }

    // ---- Loại, trạng thái ----

    public boolean isOrderVoucher() {
        return ORDER_VOUCHER.equals(type);
    }

    public boolean isActive() {
        return "ACTIVE".equals(status);
    }

    public boolean isExhausted() {
        return usageLimit != null && usedCount != null && usedCount >= usageLimit;
    }

    public Schedule schedule(LocalDateTime now) {
        if (now.isBefore(startDate)) return Schedule.UPCOMING;
        if (!now.isBefore(endDate)) return Schedule.ENDED;
        return Schedule.ONGOING;
    }

    // ---- Thao tác được phép (bảng quyết định) ----

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

    // ---- Tính giảm giá ----

    public BigDecimal discountOf(BigDecimal amount) {
        return discountOf(amount, discountType, discountValue);
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
        return new Promotion(promotionId, type, name, description, discountType, discountValue, minOrderValue,
                usageLimit, usedCount, applyScope, ids, startDate, endDate, status, createdBy);
    }
}
