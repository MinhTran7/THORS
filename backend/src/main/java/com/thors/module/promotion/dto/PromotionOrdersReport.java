package com.thors.module.promotion.dto;

import com.thors.module.promotion.entity.Promotion;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

// Hiệu quả của một mã giảm giá online: số liệu tổng không tính đơn hủy, bị từ chối, hết hạn; danh sách giữ mọi đơn
public record PromotionOrdersReport(
        int orderCount,
        BigDecimal discountTotal,
        BigDecimal revenue,
        Integer remaining,
        List<PromotionOrder> orders
) {
    private static final Set<String> NOT_COUNTED = Set.of("CANCELLED", "REJECTED", "EXPIRED");

    public static PromotionOrdersReport of(Promotion promotion, List<PromotionOrder> orders) {
        List<PromotionOrder> counted = orders.stream().filter(o -> !NOT_COUNTED.contains(o.orderStatus())).toList();
        return new PromotionOrdersReport(
                counted.size(),
                counted.stream().map(PromotionOrder::discountAmount).reduce(BigDecimal.ZERO, BigDecimal::add),
                counted.stream().map(PromotionOrder::totalAmount).reduce(BigDecimal.ZERO, BigDecimal::add),
                promotion.remaining(),
                orders);
    }
}
