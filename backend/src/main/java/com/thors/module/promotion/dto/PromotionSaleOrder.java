package com.thors.module.promotion.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

// Một đơn có sản phẩm được giảm bởi khuyến mãi sản phẩm, kèm các dòng hàng được giảm trong đơn
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

    public static PromotionSaleOrder of(List<PromotionSaleItem> rows) {
        PromotionSaleItem first = rows.get(0);
        BigDecimal original = BigDecimal.ZERO;
        BigDecimal revenue = BigDecimal.ZERO;
        int quantity = 0;
        for (PromotionSaleItem r : rows) {
            BigDecimal qty = BigDecimal.valueOf(r.quantity());
            original = original.add(r.originalPrice().multiply(qty));
            revenue = revenue.add(r.unitPrice().multiply(qty));
            quantity += r.quantity();
        }
        List<Line> items = rows.stream()
                .map(r -> new Line(r.productName(), r.size(), r.color(), r.quantity(), r.unitPrice()))
                .toList();
        return new PromotionSaleOrder(first.orderId(), first.orderNumber(), first.orderType(), first.orderDate(), quantity,
                original, original.subtract(revenue), revenue, items);
    }
}
