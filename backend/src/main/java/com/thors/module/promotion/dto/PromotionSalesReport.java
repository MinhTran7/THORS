package com.thors.module.promotion.dto;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.stream.Collectors;

// Hiệu quả của một khuyến mãi sản phẩm: số đơn, số sản phẩm được giảm, tổng tiền đã giảm, doanh thu sau giảm; mỗi đơn một dòng
public record PromotionSalesReport(
        int orderCount,
        int quantity,
        BigDecimal discountTotal,
        BigDecimal revenue,
        List<PromotionSaleOrder> orders
) {
    public static PromotionSalesReport of(List<PromotionSaleItem> rows) {
        List<PromotionSaleOrder> orders = rows.stream()
                .collect(Collectors.groupingBy(PromotionSaleItem::orderId, LinkedHashMap::new, Collectors.toList()))
                .values().stream().map(PromotionSaleOrder::of).toList();
        return new PromotionSalesReport(
                orders.size(),
                orders.stream().mapToInt(PromotionSaleOrder::quantity).sum(),
                orders.stream().map(PromotionSaleOrder::discountAmount).reduce(BigDecimal.ZERO, BigDecimal::add),
                orders.stream().map(PromotionSaleOrder::revenue).reduce(BigDecimal.ZERO, BigDecimal::add),
                orders);
    }
}
