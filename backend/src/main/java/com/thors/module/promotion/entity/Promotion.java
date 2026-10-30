
package com.thors.module.promotion.entity;

import java.math.BigDecimal;
import java.time.LocalDate;

public record Promotion(
        Integer promotionId,
        String name,
        String description,
        BigDecimal discountValue,
        LocalDate startDate,
        LocalDate endDate,
        String status,
        Integer createdBy,
        String discountType,
        BigDecimal minOrderValue,
        BigDecimal maxDiscountAmount,
        Integer usageLimit
) {
}
