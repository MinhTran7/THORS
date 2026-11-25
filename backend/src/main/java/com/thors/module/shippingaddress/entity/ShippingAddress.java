package com.thors.module.shippingaddress.entity;

public record ShippingAddress(
        int addressId,
        int userId,
        String recipientName,
        String phone,
        String provinceCode,
        String provinceName,
        String wardCode,
        String wardName,
        String addressDetail,
        boolean isDefault) {
}
