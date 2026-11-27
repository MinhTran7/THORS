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

    public ShippingAddress withDefault(boolean value) {
        return new ShippingAddress(addressId, userId, recipientName, phone, provinceCode, provinceName,
                wardCode, wardName, addressDetail, value);
    }
}
