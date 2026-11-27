package com.thors.module.promotion.dto;

import java.math.BigDecimal;

// Giá một sản phẩm lúc bán: giá gốc, giá sau khuyến mãi sản phẩm và khuyến mãi đã áp dụng (null nếu không có)
public record SalePrice(BigDecimal originalPrice, BigDecimal price, Integer promotionId) {
}
