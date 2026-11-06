package com.thors.module.shippingaddress.service;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
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

    public ShippingAddressService(ShippingAddressRepository addresses) {
        this.addresses = addresses;
    }

    public List<ShippingAddressResponse> list(Account actor) {
        return addresses.findAll(customerId(actor)).stream().map(ShippingAddressResponse::from).toList();
    }

    public ShippingAddressResponse detail(Account actor, int addressId) {
        return ShippingAddressResponse.from(find(customerId(actor), addressId));
    }

    @Transactional
    public ShippingAddressResponse create(Account actor, ShippingAddressRequest request) {
        int userId = customerId(actor);
        ShippingAddressRequest data = validate(request);
        int count = addresses.count(userId);
        if (count >= MAX_ADDRESSES) {
            throw new ApiException(409, "ADDRESS_LIMIT", "Bạn chỉ được lưu tối đa 5 địa chỉ giao hàng.");
        }
        boolean makeDefault = count == 0 || Boolean.TRUE.equals(data.isDefault());
        if (makeDefault) addresses.clearDefault(userId);
        int id = addresses.insert(userId, data, makeDefault);
        return ShippingAddressResponse.from(find(userId, id));
    }

    @Transactional
    public ShippingAddressResponse update(Account actor, int addressId, ShippingAddressRequest request) {
        int userId = customerId(actor);
        find(userId, addressId);
        ShippingAddressRequest data = validate(request);
        addresses.update(userId, addressId, data);
        if (Boolean.TRUE.equals(data.isDefault())) {
            addresses.clearDefault(userId);
            addresses.setDefault(userId, addressId);
        }
        return ShippingAddressResponse.from(find(userId, addressId));
    }

    @Transactional
    public void delete(Account actor, int addressId) {
        int userId = customerId(actor);
        if (find(userId, addressId).isDefault()) {
            throw new ApiException(409, "DEFAULT_ADDRESS_CANNOT_DELETE",
                    "Không thể xóa địa chỉ mặc định. Vui lòng chọn địa chỉ khác làm mặc định trước.");
        }
        addresses.softDelete(userId, addressId);
    }

    private static int customerId(Account actor) {
        if (actor == null || !"CUSTOMER".equals(actor.role())) {
            throw new ApiException(403, "CUSTOMER_ONLY", "Chỉ khách hàng mới được quản lý địa chỉ giao hàng.");
        }
        return actor.id();
    }

    private ShippingAddress find(int userId, int addressId) {
        return addresses.findById(userId, addressId)
                .orElseThrow(() -> new ApiException(404, "ADDRESS_NOT_FOUND", "Không tìm thấy địa chỉ giao hàng."));
    }

    private static ShippingAddressRequest validate(ShippingAddressRequest r) {
        if (r == null) throw new ApiException(400, "ADDRESS_REQUIRED", "Vui lòng nhập thông tin địa chỉ.");
        String phone = text(r.phone(), "Số điện thoại", 1, 20).replaceAll("[\\s.-]", "");
        if (!phone.matches("0\\d{9}")) {
            throw new ApiException(400, "PHONE_INVALID", "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng số 0.");
        }
        if ((r.latitude() == null) != (r.longitude() == null)) {
            throw new ApiException(400, "COORDINATES_INVALID", "Tọa độ bản đồ không hợp lệ.");
        }
        return new ShippingAddressRequest(
                text(r.recipientName(), "Họ và tên người nhận", 2, 100),
                phone,
                text(r.provinceCode(), "Tỉnh/Thành phố", 1, 20),
                text(r.provinceName(), "Tỉnh/Thành phố", 1, 100),
                text(r.wardCode(), "Phường/Xã", 1, 20),
                text(r.wardName(), "Phường/Xã", 1, 100),
                text(r.addressDetail(), "Số nhà, tên đường", 2, 255),
                r.latitude(),
                r.longitude(),
                r.isDefault());
    }

    private static String text(String value, String label, int min, int max) {
        String result = value == null ? "" : value.trim();
        if (result.isEmpty()) throw new ApiException(400, "ADDRESS_INVALID", label + " là bắt buộc.");
        if (result.length() < min || result.length() > max) {
            throw new ApiException(400, "ADDRESS_INVALID", label + " phải từ " + min + " đến " + max + " ký tự.");
        }
        return result;
    }
}
