package com.thors.module.order.delivery;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.order.delivery.GeoClient.LatLng;
import com.thors.module.order.delivery.GeoClient.Precision;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Gợi ý hình thức giao cho đơn online: trong bán kính self-radius-km (quãng đường đi thực tế) thì cửa
 * hàng tự giao, xa hơn thì gửi hãng vận chuyển. Đây chỉ là gợi ý, chủ shop vẫn được chọn khác.
 */
@Service
public class DeliveryService {
    private static final Set<String> STORE_ROLES = Set.of("OWNER", "FAMILY_MEMBER");

    public record Suggestion(
            String address,
            Double lat,
            Double lng,
            double storeLat,
            double storeLng,
            Double distanceKm,
            boolean approximate,
            double selfRadiusKm,
            String suggestedCarrier,
            String mapUrl,
            String note,
            // true: đã tìm trên bản đồ mà không thấy địa chỉ -> không được bàn giao đơn
            boolean addressNotFound) {}

    private static final String NOT_FOUND =
            "Không tìm thấy địa chỉ này trên bản đồ (có thể địa chỉ không có thật hoặc ghi chưa rõ).";
    static final String NOT_FOUND_MESSAGE =
            NOT_FOUND + " Không thể bàn giao đơn, vui lòng liên hệ khách để kiểm tra lại địa chỉ.";
    /** Dùng khi xác nhận đơn: lúc này chủ shop vẫn còn từ chối được đơn. */
    public static final String NOT_FOUND_ON_CONFIRM =
            NOT_FOUND + " Không thể xác nhận đơn, vui lòng liên hệ khách hoặc từ chối đơn"
                    + " với lý do \"Địa chỉ giao hàng không hợp lệ\".";
    public static final String NOT_FOUND_ON_SHIP = NOT_FOUND_MESSAGE;

    private final DeliveryRepository repo;
    private final GeoClient geo;
    private final LatLng store;
    private final double selfRadiusKm;
    private final String defaultCarrier;

    public DeliveryService(
            DeliveryRepository repo,
            GeoClient geo,
            @Value("${thors.shipping.store-lat:20.900063}") double storeLat,
            @Value("${thors.shipping.store-lng:105.749828}") double storeLng,
            @Value("${thors.shipping.self-radius-km:5}") double selfRadiusKm,
            @Value("${thors.shipping.default-carrier:GHN}") String defaultCarrier) {
        this.repo = repo;
        this.geo = geo;
        this.store = new LatLng(storeLat, storeLng);
        this.selfRadiusKm = selfRadiusKm;
        this.defaultCarrier = defaultCarrier;
    }

    public Suggestion suggest(Account actor, int orderId) {
        if (!STORE_ROLES.contains(actor.role()))
            throw new ApiException(403, "ROLE", "Chỉ cửa hàng được xem gợi ý giao hàng.");
        var g =
                repo.findOnline(orderId)
                        .orElseThrow(() -> new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."));

        Double lat = g.lat();
        Double lng = g.lng();
        Integer meters = g.distanceM();
        boolean approximate = g.approximate();
        // Mức chính xác của vị trí vừa tìm; null = đọc từ đơn (đã lưu thì là vị trí khớp tới số nhà)
        Precision precision = null;

        // Chưa có tọa độ: đổi địa chỉ dạng chữ thành tọa độ
        if (lat == null || lng == null) {
            var lookup = geo.lookup(g.address());
            if (lookup.notFound())
                return new Suggestion(
                        g.address(), null, null, store.lat(), store.lng(), null, false, selfRadiusKm, null, null,
                        NOT_FOUND_MESSAGE, true);
            if (lookup.place().isEmpty())
                return new Suggestion(
                        g.address(), null, null, store.lat(), store.lng(), null, false, selfRadiusKm, null, null,
                        "Không kết nối được dịch vụ bản đồ nên chưa tính được khoảng cách, vui lòng tự chọn hình thức giao.",
                        false);
            var found = lookup.place().get();
            lat = found.lat();
            lng = found.lng();
            precision = found.precision();
            meters = null;
        }

        // Chưa có quãng đường (hoặc lần trước chỉ ước tính được): tính lại
        if (meters == null || approximate) {
            var route = geo.route(store, new LatLng(lat, lng));
            meters = route.meters();
            approximate = route.approximate();
            // Chỉ lưu vị trí khớp tới số nhà; vị trí theo tên đường / phường xã thì lần sau tìm lại
            // (dữ liệu bản đồ có thể đã bổ sung, hoặc địa chỉ đã được sửa)
            if (precision == null || precision == Precision.HOUSE) repo.save(orderId, lat, lng, meters, approximate);
        }

        double km = meters / 1000.0;
        String carrier = km <= selfRadiusKm ? "SELF" : defaultCarrier;
        String mapUrl =
                "https://www.google.com/maps/dir/?api=1&origin=" + store.lat() + "," + store.lng()
                        + "&destination=" + lat + "," + lng + "&travelmode=driving";
        String note = null;
        if (precision == Precision.AREA)
            note = "Không tìm thấy chính xác số nhà / tên đường, khoảng cách chỉ ước tính theo phường/xã."
                    + " Nên kiểm tra lại địa chỉ với khách.";
        else if (precision == Precision.STREET)
            note = "Bản đồ chưa có số nhà này, vị trí lấy theo điểm giữa con đường nên khoảng cách có thể lệch"
                    + " vài trăm mét.";
        else if (approximate)
            note = "Khoảng cách ước tính theo đường thẳng, chưa lấy được quãng đường thực tế.";
        approximate = approximate || precision == Precision.AREA || precision == Precision.STREET;
        return new Suggestion(
                g.address(), lat, lng, store.lat(), store.lng(), km, approximate, selfRadiusKm, carrier, mapUrl, note,
                false);
    }

    /**
     * Chặn xác nhận đơn / bàn giao khi đã tìm trên bản đồ mà không thấy địa chỉ giao, với mọi hình thức
     * giao. Đơn đã có tọa độ thì cho qua. Dịch vụ bản đồ lỗi (chưa biết địa chỉ có thật hay không) thì
     * không chặn, để việc xử lý đơn không bị kẹt vì mất mạng. message: nội dung báo lỗi cho chủ shop.
     */
    public void requireDeliverableAddress(int orderId, String message) {
        var g = repo.findOnline(orderId).orElse(null);
        if (g == null || (g.lat() != null && g.lng() != null)) return;
        if (geo.lookup(g.address()).notFound()) throw new ApiException(409, "ADDRESS_NOT_FOUND", message);
    }
}