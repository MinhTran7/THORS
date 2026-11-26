package com.thors.module.shippingaddress.service;

import com.thors.common.ApiException;
import com.thors.module.shippingaddress.dto.ShippingAddressRequest;
import com.thors.module.shippingaddress.entity.ShippingAddress;
import org.springframework.stereotype.Component;

import java.util.regex.Pattern;

@Component
public class ShippingAddressValidator {

    private static final Pattern NAME = Pattern.compile("[\\p{L}\\p{M} ]+");
    private static final Pattern PHONE = Pattern.compile("0\\d{9}");

    public ShippingAddress validate(int userId, int addressId, ShippingAddressRequest r) {
        String name = text(r.recipientName(), "Tên người nhận", 2, 100);
        if (!NAME.matcher(name).matches()) {
            throw invalid("ADDRESS_INVALID", "Tên người nhận chỉ được gồm chữ cái và khoảng trắng.");
        }
        String phone = text(r.phone(), "Số điện thoại", 1, 20).replaceAll("[\\s.-]", "");
        if (!PHONE.matcher(phone).matches()) {
            throw invalid("PHONE_INVALID", "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng số 0.");
        }
        return new ShippingAddress(
                addressId,
                userId,
                name,
                phone,
                text(r.provinceCode(), "Tỉnh/Thành phố", 1, 20),
                text(r.provinceName(), "Tỉnh/Thành phố", 1, 100),
                text(r.wardCode(), "Phường/Xã", 1, 20),
                text(r.wardName(), "Phường/Xã", 1, 100),
                text(r.addressDetail(), "Số nhà, tên đường", 2, 255),
                Boolean.TRUE.equals(r.isDefault()));
    }

    private static String text(String value, String label, int min, int max) {
        String result = value == null ? "" : value.trim();
        if (result.isEmpty()) {
            throw invalid("ADDRESS_INVALID", label + " là bắt buộc.");
        }
        if (result.length() < min || result.length() > max) {
            throw invalid("ADDRESS_INVALID", label + " phải từ " + min + " đến " + max + " ký tự.");
        }
        return result;
    }

    private static ApiException invalid(String code, String message) {
        return new ApiException(400, code, message);
    }
}
