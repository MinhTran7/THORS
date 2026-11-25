package com.thors.module.order.delivery;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Thông tin cho hộp thoại "Giao hàng" của đơn online: địa chỉ giao, link Google Maps chỉ đường từ cửa hàng
 * tới địa chỉ đó, và hình thức giao chọn sẵn (mặc định gửi hãng vận chuyển). Không tính khoảng cách: chủ
 * shop bấm "Xem đường đi" để tự xem xa gần rồi chọn tự giao hay gửi hãng.
 */
@Service
public class DeliveryService {
    private static final Set<String> STORE_ROLES = Set.of("OWNER", "FAMILY_MEMBER");

    /** defaultCarrier: hình thức giao chọn sẵn trong hộp thoại; mapUrl: null nếu đơn chưa có địa chỉ. */
    public record Suggestion(String address, String mapUrl, String defaultCarrier) {}

    private final DeliveryRepository repo;
    private final double storeLat;
    private final double storeLng;
    private final String defaultCarrier;

    public DeliveryService(
            DeliveryRepository repo,
            @Value("${thors.shipping.store-lat:20.900063}") double storeLat,
            @Value("${thors.shipping.store-lng:105.749828}") double storeLng,
            @Value("${thors.shipping.default-carrier:GHN}") String defaultCarrier) {
        this.repo = repo;
        this.storeLat = storeLat;
        this.storeLng = storeLng;
        this.defaultCarrier = defaultCarrier;
    }

    public Suggestion suggest(Account actor, int orderId) {
        if (!STORE_ROLES.contains(actor.role()))
            throw new ApiException(403, "ROLE", "Chỉ cửa hàng được xem thông tin giao hàng.");
        String address =
                repo.findOnline(orderId)
                        .orElseThrow(() -> new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."))
                        .address();
        return new Suggestion(address, mapUrl(address), defaultCarrier);
    }

    /** Link Google Maps chỉ đường từ cửa hàng tới địa chỉ dạng chữ; Google tự tìm địa chỉ, không cần key. */
    String mapUrl(String address) {
        if (address == null || address.isBlank()) return null;
        return "https://www.google.com/maps/dir/?api=1&origin=" + storeLat + "," + storeLng
                + "&destination=" + URLEncoder.encode(address.trim(), StandardCharsets.UTF_8)
                + "&travelmode=driving";
    }
}
