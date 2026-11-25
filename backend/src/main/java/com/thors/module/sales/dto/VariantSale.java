package com.thors.module.sales.dto;

import java.math.BigDecimal;

public record VariantSale(
        BigDecimal price,
        int available
) {
}
