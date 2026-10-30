package com.thors.module.sales.dto;

import java.math.BigDecimal;

public record InStoreSaleResponse(
        int orderId,
        String orderNumber,
        String invoiceNumber,
        String orderStatus,
        String paymentStatus,
        String paymentMethod,
        BigDecimal itemsAmount,
        BigDecimal discountAmount,
        BigDecimal totalAmount
) {
}