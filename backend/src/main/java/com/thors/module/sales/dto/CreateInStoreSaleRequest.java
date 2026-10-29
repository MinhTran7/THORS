package com.thors.module.sales.dto;

import java.math.BigDecimal;
import java.util.List;

public record CreateInStoreSaleRequest(
        List<ItemRequest> items,
        BigDecimal discountAmount,
        String paymentMethod,
        String customerName
) {
    public record ItemRequest(
            Integer detailId,
            Integer quantity
    ) {
    }
}