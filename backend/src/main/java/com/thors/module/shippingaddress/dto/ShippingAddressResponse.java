package com.thors.module.shippingaddress.dto;

import com.thors.module.shippingaddress.entity.ShippingAddress;

public record ShippingAddressResponse(
        int addressId,
        String recipientName,
        String phone,
        String provinceCode,
        String provinceName,
        String wardCode,
        String wardName,
        String addressDetail,
        boolean isDefault) {

    public static ShippingAddressResponse from(ShippingAddress a) {
        return new ShippingAddressResponse(
                a.addressId(), a.recipientName(), a.phone(),
                a.provinceCode(), a.provinceName(), a.wardCode(), a.wardName(),
                a.addressDetail(),
                a.isDefault());
    }
}
