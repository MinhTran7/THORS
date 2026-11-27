package com.thors.module.sales.dto;

import java.math.BigDecimal;
import java.util.List;

public record CreateInStoreSaleRequest(
        String requestId,
        List<ItemRequest> items,
        BigDecimal discountAmount,
        String paymentMethod,
        BigDecimal expectedSubtotal
) {
    public record ItemRequest(
            Integer detailId,
            Integer quantity
    ) {
    }
}
