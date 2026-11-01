package com.thors.module.address.service;

import com.thors.module.address.dto.CreateAddressRequest;
import com.thors.module.address.repository.AddressRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Service
public class AddressService {

    private static final Pattern PHONE = Pattern.compile("^(0|\\+84)\\d{9}$");

    private final AddressRepository addressRepository;

    public AddressService(AddressRepository addressRepository) {
        this.addressRepository = addressRepository;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(int userId) {
        return addressRepository.findByUser(userId);
    }

    @Transactional
    public int create(int userId, CreateAddressRequest request) {
        String name = required(request.recipientName(), "Vui lòng nhập họ tên người nhận.");
        String phone = required(request.phone(), "Vui lòng nhập số điện thoại.");
        if (!PHONE.matcher(phone).matches()) {
            throw new IllegalArgumentException("Số điện thoại không hợp lệ.");
        }
        // province_code và ward_code là cột bắt buộc trong bảng shipping_address
        String provinceCode = required(request.provinceCode(), "Vui lòng chọn tỉnh / thành phố.");
        String province = required(request.provinceName(), "Vui lòng chọn tỉnh / thành phố.");
        String wardCode = required(request.wardCode(), "Vui lòng chọn phường / xã.");
        String ward = required(request.wardName(), "Vui lòng chọn phường / xã.");
        String detail = required(request.addressDetail(), "Vui lòng nhập địa chỉ cụ thể.");

        // Địa chỉ đầu tiên của khách luôn là mặc định
        boolean makeDefault = Boolean.TRUE.equals(request.isDefault())
                || addressRepository.countByUser(userId) == 0;
        if (makeDefault) {
            addressRepository.clearDefault(userId);
        }
        return addressRepository.insert(userId, name, phone,
                provinceCode, province,
                wardCode, ward,
                detail, makeDefault);
    }

    private String required(String value, String message) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(message);
        }
        return value.trim();
    }
}