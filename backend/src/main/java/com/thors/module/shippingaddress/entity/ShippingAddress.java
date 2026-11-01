package com.thors.module.shippingaddress.entity;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Một địa chỉ giao hàng thuộc về một Customer. */
public record ShippingAddress(
        int addressId,
        int userId,
        String recipientName,
        String phone,
        String provinceCode,
        String provinceName,
        String districtCode,
        String districtName,
        String wardCode,
        String wardName,
        String addressDetail,
        BigDecimal latitude,
        BigDecimal longitude,
        boolean isDefault,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {
}
