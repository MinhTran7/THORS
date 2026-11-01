package com.thors.module.address.dto;

/**
 * Dữ liệu khách gửi lên khi lưu địa chỉ mới.
 * provinceCode / wardCode có thể để trống nếu form chưa có danh sách tỉnh/phường để chọn.
 */
public record CreateAddressRequest(
        String recipientName,
        String phone,
        String provinceCode,
        String provinceName,
        String wardCode,
        String wardName,
        String addressDetail,
        Boolean isDefault) {
}