package com.thors.module.promotion.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

// Một đơn hàng đã áp mã giảm giá (trang chi tiết giảm giá đơn hàng)
public record PromotionOrder(
        int orderId,
        String orderNumber,
        LocalDateTime orderDate,
        String customerName,
        BigDecimal itemsAmount,
        BigDecimal discountAmount,
        BigDecimal totalAmount,
        String orderStatus
) {
}
