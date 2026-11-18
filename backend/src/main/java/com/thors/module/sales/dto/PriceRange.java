package com.thors.module.sales.dto;

import java.math.BigDecimal;

public record PriceRange(
        BigDecimal min,
        BigDecimal max,
        BigDecimal saleMin,
        BigDecimal saleMax
) {
}
