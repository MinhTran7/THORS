package com.thors.module.promotion.entity;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;

public record Promotion(
        Integer promotionId,
        String name,
        String description,
        BigDecimal discountValue,
        LocalDateTime startDate,
        LocalDateTime endDate,
        String status,
        Integer createdBy,
        String discountType,
        BigDecimal minOrderValue,
        Integer usageLimit,
        String applyScope,
        List<Integer> productIds,
        Integer usedCount
) {
    public boolean isOrderVoucher() {
        return minOrderValue != null && minOrderValue.signum() > 0;
    }

    public boolean isExhausted() {
        return usageLimit != null && usedCount != null && usedCount >= usageLimit;
    }

    public BigDecimal discountOf(BigDecimal amount) {
        return discountOf(amount, discountType, discountValue);
    }

    public static BigDecimal discountOf(BigDecimal amount, String type, BigDecimal value) {
        BigDecimal discount = "PERCENT".equals(type)
                ? amount.multiply(value).divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP)
                : value;
        return discount.min(amount);
    }
}
