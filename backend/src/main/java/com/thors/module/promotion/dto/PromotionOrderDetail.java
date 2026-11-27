package com.thors.module.promotion.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

// Một đơn có dùng khuyến mãi, xem trong popup ở trang chi tiết khuyến mãi
public record PromotionOrderDetail(
        int orderId,
        String orderNumber,
        String orderType,
        LocalDateTime orderDate,
        String customerName,
        String orderStatus,
        BigDecimal itemsAmount,
        BigDecimal voucherDiscount,
        BigDecimal otherDiscount,
        BigDecimal shippingFee,
        BigDecimal totalAmount,
        List<Line> items
) {
    // promoted: dòng hàng được giảm bởi chính khuyến mãi đang xem
    public record Line(String productName, String size, String color, int quantity, BigDecimal originalPrice,
                       BigDecimal unitPrice, boolean promoted) {
    }
}
