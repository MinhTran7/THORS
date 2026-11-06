package com.thors.module.shippingaddress.dto;

import java.math.BigDecimal;

public record ShippingAddressRequest(
        String recipientName,
        String phone,
        String provinceCode,
        String provinceName,
        String wardCode,
        String wardName,
        String addressDetail,
        BigDecimal latitude,
        BigDecimal longitude,
        Boolean isDefault) {
}
