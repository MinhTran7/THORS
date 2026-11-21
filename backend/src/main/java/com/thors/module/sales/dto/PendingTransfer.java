package com.thors.module.sales.dto;

import java.math.BigDecimal;
import java.util.List;

public record PendingTransfer(
        InStoreSaleResponse sale,
        List<Line> items
) {
    public record Line(
            int productId,
            int detailId,
            String productName,
            String imageUrl,
            String size,
            String color,
            BigDecimal unitPrice,
            BigDecimal originalPrice,
            int quantity,
            int available
    ) {
    }
}
