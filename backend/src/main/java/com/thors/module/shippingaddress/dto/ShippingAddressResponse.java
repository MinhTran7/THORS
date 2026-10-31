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

    public static ShippingAddressResponse from(ShippingAddress address) {
        return new ShippingAddressResponse(
                address.addressId(), address.recipientName(), address.phone(),
                address.provinceCode(), address.provinceName(), address.wardCode(),
                address.wardName(), address.addressDetail(), address.latitude(),
                address.longitude(), address.isDefault(), address.createdAt(), address.updatedAt());
    }
}
