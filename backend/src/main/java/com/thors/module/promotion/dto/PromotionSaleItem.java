package com.thors.module.promotion.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

// Một dòng hàng đọc từ DB đã được giảm bởi khuyến mãi sản phẩm
public record PromotionSaleItem(
        int orderId,
        String orderNumber,
        String orderType,
        LocalDateTime orderDate,
        String productName,
        String size,
        String color,
        int quantity,
        BigDecimal originalPrice,
        BigDecimal unitPrice
) {
}
