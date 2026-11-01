package com.thors.module.order.dto;

import java.util.List;

public record CreateOrderRequest(
        Integer shippingAddressId,          // khi chọn địa chỉ đã lưu
        ShippingAddressInput shippingAddress, // khi không lưu địa chỉ mới
        String paymentMethod,               // "COD" | "BANK"
        String note,
        List<Integer> cartItemIds,          // mua từ giỏ hàng
        List<Item> items                    // "Mua ngay"
) {
    public record ShippingAddressInput(
            String recipientName,
            String phone,
            String provinceName,
            String wardName,
            String addressDetail) {}

    public record Item(Integer productVariantId, Integer quantity) {}
}