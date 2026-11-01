package com.thors.module.shippingaddress.service;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.shippingaddress.dto.ShippingAddressRequest;
import com.thors.module.shippingaddress.dto.ShippingAddressResponse;
import com.thors.module.shippingaddress.repository.ShippingAddressRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Service
public class ShippingAddressService {

    private static final int MAX_ACTIVE_ADDRESSES = 5;
    private final ShippingAddressRepository addresses;

    public ShippingAddressService(ShippingAddressRepository addresses) {
        this.addresses = addresses;
    }

    private static int requireCustomer(Account actor) {
        if (actor == null || !"CUSTOMER".equals(actor.role())) {
            throw new ApiException(403, "CUSTOMER_ONLY", "Chỉ Customer mới được quản lý địa chỉ giao hàng.");
        }
        return actor.id();
    }

    public List<ShippingAddressResponse> list(Account actor) {
        int userId = requireCustomer(actor);
        return addresses.findAllActive(userId).stream().map(ShippingAddressResponse::from).toList();
    }

    public ShippingAddressResponse detail(Account actor, int addressId) {
        int userId = requireCustomer(actor);
        return addresses.findActiveById(userId, addressId)
                .map(ShippingAddressResponse::from)
                .orElseThrow(() -> notFound());
    }

    @Transactional
    public ShippingAddressResponse create(Account actor, ShippingAddressRequest request) {
        int userId = requireCustomer(actor);
        Validated v = validate(request);

        int currentCount = addresses.countActiveByUser(userId);
        if (currentCount >= MAX_ACTIVE_ADDRESSES) {
            throw new ApiException(409, "ADDRESS_LIMIT", "Mỗi Customer chỉ được lưu tối đa 5 địa chỉ giao hàng.");
        }

        boolean makeDefault = currentCount == 0 || Boolean.TRUE.equals(request.isDefault());
        if (makeDefault) addresses.clearDefault(userId);

        int newId = addresses.insert(userId, v.recipientName(), v.phone(),
                v.provinceCode(), v.provinceName(),
                v.districtCode(), v.districtName(),
                v.wardCode(), v.wardName(), v.addressDetail(),
                v.latitude(), v.longitude(), makeDefault);

        return addresses.findActiveById(userId, newId)
                .map(ShippingAddressResponse::from)
                .orElseThrow(() -> notFound());
    }

    @Transactional
    public ShippingAddressResponse update(Account actor, int addressId, ShippingAddressRequest request) {
        int userId = requireCustomer(actor);
        Validated v = validate(request);
        addresses.findActiveById(userId, addressId).orElseThrow(() -> notFound());

        if (Boolean.TRUE.equals(request.isDefault())) {
            addresses.clearDefault(userId);
            addresses.setDefault(userId, addressId);
        }

        int updated = addresses.update(userId, addressId, v.recipientName(), v.phone(),
                v.provinceCode(), v.provinceName(),
                v.districtCode(), v.districtName(),
                v.wardCode(), v.wardName(),
                v.addressDetail(), v.latitude(), v.longitude());
        if (updated == 0) throw notFound();

        return addresses.findActiveById(userId, addressId)
                .map(ShippingAddressResponse::from)
                .orElseThrow(() -> notFound());
    }

    @Transactional
    public ShippingAddressResponse setDefault(Account actor, int addressId) {
        int userId = requireCustomer(actor);
        addresses.findActiveById(userId, addressId).orElseThrow(() -> notFound());
        addresses.clearDefault(userId);
        if (addresses.setDefault(userId, addressId) == 0) throw notFound();
        return addresses.findActiveById(userId, addressId)
                .map(ShippingAddressResponse::from)
                .orElseThrow(() -> notFound());
    }

    @Transactional
    public void delete(Account actor, int addressId) {
        int userId = requireCustomer(actor);
        var address = addresses.findActiveById(userId, addressId).orElseThrow(() -> notFound());
        if (address.isDefault()) {
            throw new ApiException(409, "DEFAULT_ADDRESS_CANNOT_DELETE",
                    "Không thể xóa địa chỉ mặc định. Vui lòng chọn địa chỉ khác làm mặc định trước.");
        }
        if (addresses.softDelete(userId, addressId) == 0) throw notFound();
    }

    private static Validated validate(ShippingAddressRequest request) {
        if (request == null) throw new ApiException(400, "ADDRESS_REQUIRED", "Vui lòng nhập thông tin địa chỉ.");
        String recipient = required(request.recipientName(), "RECIPIENT_NAME", "Họ và tên người nhận là bắt buộc.", 100);
        if (recipient.length() < 2) {
            throw new ApiException(400, "RECIPIENT_NAME_TOO_SHORT", "Họ và tên người nhận phải có ít nhất 2 ký tự.");
        }

        String rawPhone = required(request.phone(), "PHONE", "Số điện thoại là bắt buộc.", 20);
        String phone = rawPhone.replaceAll("[\\s.-]", "");
        if (!phone.matches("^0[0-9]{9}$")) {
            throw new ApiException(400, "PHONE_INVALID", "Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng số 0.");
        }

        String provinceCode = required(request.provinceCode(), "PROVINCE_CODE", "Vui lòng chọn tỉnh/thành phố.", 20);
        String provinceName = required(request.provinceName(), "PROVINCE_NAME", "Tên tỉnh/thành phố không hợp lệ.", 100);
        String districtCode = required(request.districtCode(), "DISTRICT_CODE", "Vui lòng chọn quận/huyện.", 20);
        String districtName = required(request.districtName(), "DISTRICT_NAME", "Tên quận/huyện không hợp lệ.", 100);
        String wardCode = required(request.wardCode(), "WARD_CODE", "Vui lòng chọn phường/xã.", 20);
        String wardName = required(request.wardName(), "WARD_NAME", "Tên phường/xã không hợp lệ.", 100);

        String detail = required(request.addressDetail(), "ADDRESS_DETAIL", "Vui lòng nhập số nhà, tên đường hoặc địa chỉ chi tiết.", 255);
        if (detail.length() < 2) {
            throw new ApiException(400, "ADDRESS_DETAIL_TOO_SHORT", "Địa chỉ chi tiết phải có ít nhất 2 ký tự.");
        }

        BigDecimal lat = request.latitude();
        BigDecimal lng = request.longitude();
        if ((lat == null) != (lng == null)) {
            throw new ApiException(400, "COORDINATES_INCOMPLETE", "Vĩ độ và kinh độ phải được gửi cùng nhau.");
        }
        if (lat != null && (lat.compareTo(BigDecimal.valueOf(-90)) < 0 || lat.compareTo(BigDecimal.valueOf(90)) > 0
                || lng.compareTo(BigDecimal.valueOf(-180)) < 0 || lng.compareTo(BigDecimal.valueOf(180)) > 0)) {
            throw new ApiException(400, "COORDINATES_INVALID", "Tọa độ bản đồ không hợp lệ.");
        }
        return new Validated(recipient, phone, provinceCode, provinceName, districtCode, districtName, wardCode, wardName, detail, lat, lng);
    }

    private static String required(String value, String code, String message, int maxLength) {
        if (value == null || value.isBlank()) throw new ApiException(400, code + "_REQUIRED", message);
        String result = value.trim();
        if (result.length() > maxLength) throw new ApiException(400, code + "_TOO_LONG", "Thông tin địa chỉ vượt quá độ dài cho phép.");
        return result;
    }

    private static ApiException notFound() {
        return new ApiException(404, "ADDRESS_NOT_FOUND", "Không tìm thấy địa chỉ giao hàng.");
    }

    private record Validated(String recipientName, String phone, String provinceCode,
                             String provinceName, String districtCode, String districtName,
                             String wardCode, String wardName,
                             String addressDetail, BigDecimal latitude, BigDecimal longitude) {}
}
