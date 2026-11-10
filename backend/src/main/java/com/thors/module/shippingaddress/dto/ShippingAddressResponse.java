package com.thors.module.shippingaddress.dto;

import com.thors.module.shippingaddress.entity.ShippingAddress;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public record ShippingAddressResponse(
        int addressId,
        String recipientName,
        String phone,
        String provinceCode,
        String provinceName,
        String wardCode,
        String wardName,
        String addressDetail,
        BigDecimal latitude,
        BigDecimal longitude,
        boolean isDefault,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {

    public static ShippingAddressResponse from(ShippingAddress a) {
        return new ShippingAddressResponse(
                a.addressId(), a.recipientName(), a.phone(),
                a.provinceCode(), a.provinceName(), a.wardCode(), a.wardName(),
                a.addressDetail(), a.latitude(), a.longitude(),
                a.isDefault(), a.createdAt(), a.updatedAt());
    }
}
