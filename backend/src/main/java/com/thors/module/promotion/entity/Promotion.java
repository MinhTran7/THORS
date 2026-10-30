
package com.thors.module.promotion.entity;

import java.math.BigDecimal;
import java.time.LocalDateTime;

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
        Integer usageLimit
) {
}
