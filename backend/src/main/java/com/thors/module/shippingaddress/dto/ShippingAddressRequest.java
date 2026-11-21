package com.thors.module.shippingaddress.dto;

public record ShippingAddressRequest(
        String recipientName,
        String phone,
        String provinceCode,
        String provinceName,
        String wardCode,
        String wardName,
        String addressDetail,
        Boolean isDefault) {
}
