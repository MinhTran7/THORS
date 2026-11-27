package com.thors.module.shippingaddress.service;

import com.thors.common.ApiException;
import com.thors.module.shippingaddress.dto.ShippingAddressRequest;
import com.thors.module.shippingaddress.dto.ShippingAddressResponse;
import com.thors.module.shippingaddress.entity.ShippingAddress;
import com.thors.module.shippingaddress.repository.ShippingAddressRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ShippingAddressService {

    private static final int MAX_ADDRESSES = 5;

    private final ShippingAddressRepository addresses;
    private final ShippingAddressValidator validator;

    public ShippingAddressService(ShippingAddressRepository addresses, ShippingAddressValidator validator) {
        this.addresses = addresses;
        this.validator = validator;
    }

    public List<ShippingAddressResponse> list(int userId) {
        return addresses.findAll(userId).stream().map(ShippingAddressResponse::from).toList();
    }

    public ShippingAddressResponse detail(int userId, int addressId) {
        return ShippingAddressResponse.from(find(userId, addressId));
    }

    @Transactional
    public void create(int userId, ShippingAddressRequest request) {
        ShippingAddress address = validator.validate(userId, 0, request);
        addresses.lockCustomer(userId);
        int count = addresses.count(userId);
        if (count >= MAX_ADDRESSES) {
            throw new ApiException(409, "ADDRESS_LIMIT", "Bạn chỉ được lưu tối đa " + MAX_ADDRESSES + " địa chỉ giao hàng.");
        }
        if (count == 0) {
            address = address.withDefault(true);
        } else if (address.isDefault()) {
            addresses.clearDefault(userId);
        }
        addresses.insert(address);
    }

    @Transactional
    public void update(int userId, int addressId, ShippingAddressRequest request) {
        ShippingAddress address = validator.validate(userId, addressId, request);
        lockAndFind(userId, addressId);
        addresses.update(address);
        if (address.isDefault()) {
            makeDefault(userId, addressId);
        }
    }

    @Transactional
    public void setDefault(int userId, int addressId) {
        lockAndFind(userId, addressId);
        makeDefault(userId, addressId);
    }

    @Transactional
    public void delete(int userId, int addressId) {
        if (lockAndFind(userId, addressId).isDefault()) {
            throw new ApiException(409, "DEFAULT_ADDRESS_CANNOT_DELETE",
                    "Không thể xóa địa chỉ mặc định. Vui lòng chọn địa chỉ khác làm mặc định trước.");
        }
        addresses.softDelete(userId, addressId);
    }

    private ShippingAddress lockAndFind(int userId, int addressId) {
        addresses.lockCustomer(userId);
        return find(userId, addressId);
    }

    private void makeDefault(int userId, int addressId) {
        addresses.clearDefault(userId);
        addresses.markDefault(userId, addressId);
    }

    private ShippingAddress find(int userId, int addressId) {
        return addresses.findById(userId, addressId)
                .orElseThrow(() -> new ApiException(404, "ADDRESS_NOT_FOUND", "Không tìm thấy địa chỉ giao hàng."));
    }
}
