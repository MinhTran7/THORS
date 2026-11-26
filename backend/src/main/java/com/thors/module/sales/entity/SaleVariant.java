package com.thors.module.sales.entity;

import java.math.BigDecimal;

public record SaleVariant(
        int detailId,
        int productId,
        String productName,
        String size,
        String color,
        BigDecimal price,
        int stockQuantity,
        int held,
        int defective,
        boolean active
) {
    public int available() {
        return stockQuantity - held - defective;
    }

    public SaleVariant withDefective(int count) {
        return new SaleVariant(detailId, productId, productName, size, color, price, stockQuantity, held, count, active);
    }
}
