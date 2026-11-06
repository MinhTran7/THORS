package com.thors.module.order.delivery;

import com.thors.module.notification.service.NotificationPublisher;
import com.thors.module.notification.service.NotificationTypes;
import com.thors.module.order.repository.OrderRepository;
import com.thors.module.order.repository.OrderRepository.Tracked;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Áp dụng trạng thái vận đơn GHN vào đơn hàng. Dùng chung cho webhook (GHN gọi về) và việc hỏi định kỳ.
 * Bỏ qua sự kiện đã xử lý (cùng mã vận đơn + trạng thái + thời điểm) và sự kiện cũ hơn sự kiện đã ghi.
 */
@Service
public class GhnStatusService {
    private static final Logger log = LoggerFactory.getLogger(GhnStatusService.class);
    private static final String OWNER_ROLE = "OWNER";

    /** Trạng thái GHN -> shipment_status (theo ràng buộc ck_orders_12). Trạng thái không có ở đây bị bỏ qua. */
    private static final Map<String, String> STATUS =
            Map.ofEntries(
                    Map.entry("ready_to_pick", "AWAITING_PICKUP"),
                    Map.entry("picking", "AWAITING_PICKUP"),
                    Map.entry("money_collect_picking", "AWAITING_PICKUP"),
                    Map.entry("picked", "IN_TRANSIT"),
                    Map.entry("storing", "IN_TRANSIT"),
                    Map.entry("transporting", "IN_TRANSIT"),
                    Map.entry("sorting", "IN_TRANSIT"),
                    Map.entry("delivering", "IN_TRANSIT"),
                    Map.entry("money_collect_delivering", "IN_TRANSIT"),
                    Map.entry("delivered", "DELIVERED"),
                    Map.entry("delivery_fail", "FAILED"),
                    Map.entry("exception", "FAILED"),
                    Map.entry("damage", "FAILED"),
                    Map.entry("lost", "FAILED"),
                    Map.entry("waiting_to_return", "RETURNING"),
                    Map.entry("return", "RETURNING"),
                    Map.entry("return_transporting", "RETURNING"),
                    Map.entry("return_sorting", "RETURNING"),
                    Map.entry("returning", "RETURNING"),
                    Map.entry("return_fail", "RETURNING"),
                    Map.entry("returned", "RETURNED"),
                    Map.entry("cancel", "CANCELLED"));

    /** Kết quả xử lý một sự kiện, để ghi log / trả lời webhook. */
    public enum Result { APPLIED, DUPLICATE, STALE, UNKNOWN_ORDER, IGNORED_STATUS }

    private final OrderRepository orders;
    private final NotificationPublisher notifications;

    public GhnStatusService(OrderRepository orders, NotificationPublisher notifications) {
        this.orders = orders;
        this.notifications = notifications;
    }

    /**
     * @param orderCode mã vận đơn GHN (OrderCode)
     * @param ghnStatus trạng thái GHN, ví dụ "delivered"
     * @param time thời điểm GHN ghi trạng thái (chuỗi ISO, ví dụ 2026-11-04T05:10:47.75Z); null = bây giờ
     * @param reason lý do GHN ghi kèm (hủy, giao thất bại...), có thể null
     */
    @Transactional
    public Result apply(String orderCode, String ghnStatus, String time, String reason) {
        String status = ghnStatus == null ? "" : ghnStatus.trim().toLowerCase();
        String mapped = STATUS.get(status);
        if (mapped == null) {
            log.info("Bỏ qua trạng thái GHN không xử lý: {} ({})", status, orderCode);
            return Result.IGNORED_STATUS;
        }
        Tracked t = orders.findByTrackingForUpdate(GhnShippingService.CARRIER, orderCode).orElse(null);
        if (t == null) {
            log.warn("Nhận trạng thái GHN cho vận đơn không có trong hệ thống: {}", orderCode);
            return Result.UNKNOWN_ORDER;
        }

        LocalDateTime at = parseUtc(time);
        String eventId = limit(orderCode + "|" + status + "|" + (time == null ? "" : time.trim()), 100);
        if (eventId.equals(t.lastEventId())) return Result.DUPLICATE;
        // Đã xử lý một sự kiện mới hơn (GHN có thể gửi lệch thứ tự): không cho trạng thái lùi lại
        if (t.lastEventId() != null && t.shipmentUpdatedAt() != null && at.isBefore(t.shipmentUpdatedAt()))
            return Result.STALE;

        orders.applyShipmentEvent(
                t.orderId(), mapped, eventId, at, "IN_TRANSIT".equals(mapped), "DELIVERED".equals(mapped));

        if (mapped.equals(t.shipmentStatus())) return Result.APPLIED; // cùng nhóm trạng thái, không báo lại

        switch (mapped) {
            case "IN_TRANSIT" -> {
                // GHN đã lấy hàng: lúc này đơn mới thực sự "Đang giao"
                orders.markShippingByCarrier(t.orderId());
                notifyCustomer(t, "Đơn hàng đang được giao",
                        "GHN đã lấy hàng đơn " + t.orderNumber() + " và đang giao đến bạn.");
            }
            case "DELIVERED" -> {
                if (orders.markDeliveredByCarrier(t.orderId()))
                    notifyCustomer(t, "Đơn hàng đã giao",
                            "Đơn " + t.orderNumber() + " đã được GHN giao thành công.");
                notifyOwner(t, "GHN đã giao đơn", "Đơn " + t.orderNumber() + " đã được GHN giao thành công.");
            }
            case "FAILED" -> notifyOwner(t, "GHN giao không thành công",
                    "Đơn " + t.orderNumber() + " giao không thành công (" + status + "). Vui lòng kiểm tra trên GHN.");
            case "RETURNING" -> notifyOwner(t, "Đơn đang hoàn về",
                    "Đơn " + t.orderNumber() + " đang được GHN hoàn về cửa hàng.");
            case "RETURNED" -> notifyOwner(t, "Đơn đã hoàn về",
                    "Đơn " + t.orderNumber() + " đã được GHN hoàn về cửa hàng.");
            case "CANCELLED" -> {
                // Vận đơn bị hủy trên GHN (shop hủy trên trang GHN hoặc GHN hủy): hủy luôn đơn trên THORS
                String why = "Vận đơn GHN bị hủy" + (blank(reason) ? "" : ": " + reason.trim());
                if (orders.markCancelledByCarrier(t.orderId(), limit(why, 255)))
                    notifyCustomer(t, "Đơn hàng đã bị hủy", "Đơn " + t.orderNumber() + " đã bị hủy. " + why + ".");
                notifyOwner(t, "Vận đơn GHN đã bị hủy", "Đơn " + t.orderNumber() + " đã bị hủy. " + why + ".");
            }
            default -> {}
        }
        log.info("GHN {} -> {} cho đơn {}", status, mapped, t.orderNumber());
        return Result.APPLIED;
    }

    /** Thời điểm GHN gửi (UTC, cùng múi giờ với DB); không đọc được thì lấy thời điểm hiện tại. */
    private static LocalDateTime parseUtc(String time) {
        if (time != null && !time.isBlank()) {
            try {
                return LocalDateTime.ofInstant(Instant.parse(time.trim()), ZoneOffset.UTC);
            } catch (DateTimeParseException ignored) {
                // rơi xuống dùng thời điểm hiện tại
            }
        }
        return LocalDateTime.now(ZoneOffset.UTC);
    }

    private void notifyCustomer(Tracked t, String title, String message) {
        notifications.toUser(
                t.userId(), NotificationTypes.ORDER_STATUS, title, message, NotificationTypes.ENTITY_ORDER, t.orderId());
    }

    private void notifyOwner(Tracked t, String title, String message) {
        notifications.toRole(
                OWNER_ROLE, NotificationTypes.ORDER_STATUS, title, message, NotificationTypes.ENTITY_ORDER, t.orderId());
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private static String limit(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }
}
