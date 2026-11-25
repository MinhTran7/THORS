package com.thors.module.sales.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record InStoreSaleListItem(
        int orderId,
        String orderNumber,
        String invoiceNumber,
        LocalDateTime orderDate,
        String sellerName,
        BigDecimal totalAmount,
        String paymentMethod
) {
}
