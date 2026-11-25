package com.thors.module.sales.entity;

import java.math.BigDecimal;

// Biến thể đang được khóa để bán; held là phần hàng đang giữ cho đơn khác
public record SaleVariant(
        int detailId,
        int productId,
        String productName,
        String size,
        String color,
        BigDecimal price,
        int stockQuantity,
        int held,
        boolean active
) {
    public int available() {
        return stockQuantity - held;
    }
}
