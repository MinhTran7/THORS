package com.thors.module.order.delivery;

import com.thors.common.ApiException;
import com.thors.module.order.delivery.GhnClient.CreateRequest;
import com.thors.module.order.delivery.GhnClient.Created;
import com.thors.module.order.delivery.GhnClient.Item;
import com.thors.module.order.repository.OrderRepository;
import com.thors.module.order.repository.OrderRepository.ShipInput;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Tạo vận đơn GHN cho một đơn online và lưu mã vận đơn, phí GHN, tiền thu hộ vào đơn. */
@Service
public class GhnShippingService {
    private static final Logger log = LoggerFactory.getLogger(GhnShippingService.class);
    public static final String CARRIER = "GHN";
    private static final int MAX_WEIGHT_G = 50_000;

    private final GhnClient ghn;
    private final OrderRepository orders;
    private final int defaultWeightG;

    public GhnShippingService(
            GhnClient ghn,
            OrderRepository orders,
            @Value("${thors.ghn.default-weight-g:500}") int defaultWeightG) {
        this.ghn = ghn;
        this.orders = orders;
        this.defaultWeightG = defaultWeightG;
    }

    /**
     * Tạo vận đơn GHN và lưu vào đơn. Đơn vẫn ở {@code from} (Chờ lấy hàng); khi GHN báo đã lấy hàng
     * thì GhnStatusService mới chuyển sang Đang giao. Nếu lưu vào DB không được (đơn vừa bị đổi trạng
     * thái hoặc đã có vận đơn) thì hủy lại vận đơn vừa tạo để không có vận đơn mồ côi trên GHN.
     *
     * @param weightG cân nặng Owner nhập; null thì dùng cân nặng đã lưu ở đơn hoặc mặc định
     * @param provinceId Tỉnh/Thành theo danh mục mới của GHN Owner chọn
     * @param wardId Phường/Xã theo danh mục mới của GHN Owner chọn (phải thuộc tỉnh đã chọn)
     */
    public Created ship(int orderId, String from, Integer weightG, Integer provinceId, Integer wardId) {
        ShipInput in =
                orders.findShipInput(orderId)
                        .orElseThrow(() -> new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."));

        if (blank(in.name()) || blank(in.phone()) || blank(in.address()))
            throw new ApiException(400, "GHN_ADDRESS", "Đơn thiếu tên, số điện thoại hoặc địa chỉ người nhận.");

        if (provinceId == null || wardId == null)
            throw new ApiException(400, "GHN_ADDRESS", "Vui lòng chọn Tỉnh/Thành và Phường/Xã theo GHN cho địa chỉ giao.");
        // Chặn mã gửi lên sai hoặc phường/xã không thuộc tỉnh đã chọn; GHN nhận theo tên nên lấy tên chuẩn
        String province =
                ghn.provinces().stream()
                        .filter(p -> p.id().equals(String.valueOf(provinceId)))
                        .findFirst()
                        .orElseThrow(() -> new ApiException(400, "GHN_ADDRESS", "Tỉnh/Thành không có trong danh mục GHN."))
                        .name();
        String ward =
                ghn.wards(provinceId).stream()
                        .filter(w -> w.id().equals(String.valueOf(wardId)))
                        .findFirst()
                        .orElseThrow(() -> new ApiException(400, "GHN_ADDRESS", "Phường/Xã không thuộc Tỉnh/Thành đã chọn."))
                        .name();

        int weight = weightG != null ? weightG : in.weightG() != null ? in.weightG() : defaultWeightG;
        if (weight <= 0 || weight > MAX_WEIGHT_G)
            throw new ApiException(400, "GHN_WEIGHT", "Cân nặng phải từ 1 đến " + MAX_WEIGHT_G + " gram.");

        // Đơn COD chưa thu tiền: GHN thu hộ toàn bộ tổng tiền (đã gồm phí ship khách trả)
        long cod = "COD".equals(in.paymentMethod()) && !"PAID".equals(in.paymentStatus()) ? in.totalAmount() : 0;

        var lines = orders.shipItems(orderId);
        if (lines.isEmpty()) throw new ApiException(400, "GHN_ITEMS", "Đơn không có sản phẩm nào.");
        int totalQty = lines.stream().mapToInt(OrderRepository.ShipItem::quantity).sum();
        int perUnit = Math.max(1, weight / Math.max(1, totalQty));
        List<Item> items =
                lines.stream().map(l -> new Item(l.name(), l.code(), l.quantity(), l.price(), perUnit)).toList();

        Created created =
                ghn.create(
                        new CreateRequest(
                                in.orderNumber(),
                                in.name(),
                                in.phone(),
                                in.address(),
                                province,
                                ward,
                                cod,
                                weight,
                                "Đơn " + in.orderNumber(),
                                items));

        boolean saved;
        try {
            saved =
                    orders.shipWithCarrier(
                            orderId,
                            from,
                            CARRIER,
                            created.orderCode(),
                            String.valueOf(ghn.serviceTypeId()),
                            created.totalFee(),
                            cod,
                            weight,
                            province,
                            ward);
        } catch (RuntimeException e) {
            cancelQuietly(created.orderCode());
            throw e;
        }
        if (!saved) {
            cancelQuietly(created.orderCode());
            throw new ApiException(
                    409, "ORDER_STATE", "Đơn vừa thay đổi hoặc đã có vận đơn, vui lòng tải lại trang.");
        }
        log.info("Đã tạo vận đơn GHN {} cho đơn {}, phí {}", created.orderCode(), in.orderNumber(), created.totalFee());
        return created;
    }

    private void cancelQuietly(String orderCode) {
        try {
            ghn.cancel(orderCode);
        } catch (RuntimeException e) {
            log.error("Không hủy được vận đơn GHN {}, cần hủy tay trên trang GHN", orderCode, e);
        }
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
