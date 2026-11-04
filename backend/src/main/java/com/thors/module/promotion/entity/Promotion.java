package com.thors.module.promotion.entity;

import java.math.BigDecimal;
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
        BigDecimal maxDiscountAmount,
        Integer usageLimit,
        String applyScope,
        List<Integer> productIds,
        Integer usedCount
) {
    public Promotion(
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
            BigDecimal maxDiscountAmount,
            Integer usageLimit,
            String applyScope,
            List<Integer> productIds
    ) {
        this(
                promotionId,
                name,
                description,
                discountValue,
                startDate,
                endDate,
                status,
                createdBy,
                discountType,
                minOrderValue,
                maxDiscountAmount,
                usageLimit,
                applyScope,
                productIds,
                0
        );
    }
}
