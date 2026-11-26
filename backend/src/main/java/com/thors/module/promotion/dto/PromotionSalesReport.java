package com.thors.module.promotion.dto;

import java.math.BigDecimal;
import java.util.List;

// Hiệu quả khuyến mãi sản phẩm: mỗi đơn một dòng
public record PromotionSalesReport(
        int orderCount,
        int quantity,
        BigDecimal discountTotal,
        BigDecimal revenue,
        List<PromotionSaleOrder> orders
) {
}
