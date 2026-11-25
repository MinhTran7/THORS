package com.thors.module.sales.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

// Chi tiết hóa đơn tại quầy: tổng tiền hàng (giá đã giảm khuyến mãi), giảm tay của người bán, tổng thanh toán
public record InStoreSaleDetailResponse(
        int orderId,
        String orderNumber,
        String invoiceNumber,
        LocalDateTime orderDate,
        String sellerName,
        BigDecimal subtotal,
        BigDecimal manualDiscount,
        BigDecimal totalAmount,
        String paymentMethod,
        String paymentStatus,
        List<SaleItemDetail> items
) {
    public record SaleItemDetail(
            int orderItemId,
            String productName,
            String size,
            String color,
            int quantity,
            BigDecimal originalPrice,
            BigDecimal unitPrice,
            BigDecimal totalPrice,
            String imageUrl
    ) {}

    public static InStoreSaleDetailResponse of(int orderId, String orderNumber, String invoiceNumber, LocalDateTime orderDate,
                                               String sellerName, BigDecimal manualDiscount, BigDecimal totalAmount,
                                               String paymentMethod, String paymentStatus, List<SaleItemDetail> items) {
        BigDecimal subtotal = items.stream().map(SaleItemDetail::totalPrice).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new InStoreSaleDetailResponse(orderId, orderNumber, invoiceNumber, orderDate, sellerName, subtotal,
                manualDiscount, totalAmount, paymentMethod, paymentStatus, items);
    }
}
