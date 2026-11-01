package com.thors.module.promotion.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record CreatePromotionRequest(
        String name,
        String description,
        String discountType,
        BigDecimal discountValue,
        BigDecimal minOrderValue,
        BigDecimal maxDiscountAmount,
        LocalDateTime startDate,
        LocalDateTime endDate,
        Integer usageLimit,
        String applyScope,
        List<Integer> productIds
) {
}