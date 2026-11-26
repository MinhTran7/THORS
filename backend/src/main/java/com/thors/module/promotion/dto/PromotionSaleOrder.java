package com.thors.module.promotion.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

// Một đơn có sản phẩm được giảm bởi khuyến mãi sản phẩm, kèm các dòng hàng được giảm
public record PromotionSaleOrder(
        int orderId,
        String orderNumber,
        String orderType,
        LocalDateTime orderDate,
        int quantity,
        BigDecimal originalAmount,
        BigDecimal discountAmount,
        BigDecimal revenue,
        List<Line> items
) {
    public record Line(String productName, String size, String color, int quantity, BigDecimal unitPrice) {
    }
}
