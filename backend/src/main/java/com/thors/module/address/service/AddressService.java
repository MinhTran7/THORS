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
    /** Cùng giới hạn với trang "Địa chỉ giao hàng" (ShippingAddressService.MAX_ADDRESSES). */
    private static final int MAX_ADDRESSES = 5;

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
        // Khớp ràng buộc chk_shipping_address_required của bảng shipping_address (không thì DB báo lỗi
        // khó hiểu "Không thể xử lý yêu cầu")
        if (name.length() < 2) {
            throw new IllegalArgumentException("Họ tên người nhận cần ít nhất 2 ký tự.");
        }
        if (detail.length() < 2) {
            throw new IllegalArgumentException("Địa chỉ cụ thể cần ít nhất 2 ký tự (số nhà, tên đường).");
        }
        if (name.length() > 100 || detail.length() > 255) {
            throw new IllegalArgumentException("Họ tên tối đa 100 ký tự, địa chỉ cụ thể tối đa 255 ký tự.");
        }

        int count = addressRepository.countByUser(userId);
        if (count >= MAX_ADDRESSES) {
            throw new IllegalArgumentException("Bạn chỉ được lưu tối đa " + MAX_ADDRESSES
                    + " địa chỉ. Hãy xóa bớt ở trang Địa chỉ giao hàng, hoặc bỏ chọn \"Lưu địa chỉ này\".");
        }

        // Địa chỉ đầu tiên của khách luôn là mặc định
        boolean makeDefault = Boolean.TRUE.equals(request.isDefault()) || count == 0;
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