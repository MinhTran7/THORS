package com.thors.module.promotion.dto;

import com.thors.module.promotion.entity.Promotion;

import java.math.BigDecimal;
import java.time.LocalDateTime;

// Mã giảm giá online cho khách (Kho voucher, trang chủ)
public record VoucherView(
        int promotionId,
        String name,
        String description,
        String discountType,
        BigDecimal discountValue,
        BigDecimal minOrderValue,
        BigDecimal maxDiscountAmount,
        LocalDateTime startDate,
        LocalDateTime endDate,
        Integer remaining
) {
    public static VoucherView from(Promotion p) {
        return new VoucherView(p.promotionId(), p.name(), p.description(), p.discountType(), p.discountValue(),
                p.minOrderValue(), p.maxDiscountAmount(), p.startDate(), p.endDate(), p.remaining());
    }
}
