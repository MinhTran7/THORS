package com.thors.module.sales.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record InStoreSaleDetailResponse(
        int orderId,
        String orderNumber,
        String invoiceNumber,
        LocalDateTime orderDate,
        String customerName,
        String sellerName,
        BigDecimal subtotal,
        BigDecimal discountAmount,
        BigDecimal totalAmount,
        String paymentMethod,
        String paymentStatus,
        String orderStatus,
        List<SaleItemDetail> items
) {
    public record SaleItemDetail(
            int orderItemId,
            Integer detailId,
            String productName,
            String size,
            String color,
            int quantity,
            BigDecimal unitPrice,
            BigDecimal totalPrice
    ) {}
}
