package com.thors.module.promotion.dto;

import java.math.BigDecimal;
import java.util.List;

// Hiệu quả mã giảm giá online: số liệu tổng không tính đơn hủy, bị từ chối, hết hạn; danh sách giữ mọi đơn
public record PromotionOrdersReport(
        int orderCount,
        BigDecimal discountTotal,
        BigDecimal revenue,
        Integer remaining,
        List<PromotionOrder> orders
) {
}
