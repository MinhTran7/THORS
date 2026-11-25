package com.thors.module.promotion.dto;

import com.thors.module.promotion.entity.Promotion;

import java.math.BigDecimal;
import java.time.LocalDateTime;

// Mã giảm giá online cho khách (Kho voucher, banner trang chủ)
public record VoucherView(
        int promotionId,
        String name,
        String description,
        String discountType,
        BigDecimal discountValue,
        BigDecimal minOrderValue,
        LocalDateTime startDate,
        LocalDateTime endDate,
        Integer remaining
) {
    public static VoucherView of(Promotion p) {
        Integer remaining = p.usageLimit() == null ? null : p.usageLimit() - p.usedCount();
        return new VoucherView(p.promotionId(), p.name(), p.description(), p.discountType(), p.discountValue(),
                p.minOrderValue(), p.startDate(), p.endDate(), remaining);
    }
}
