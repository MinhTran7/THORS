package com.thors.module.order.service;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.notification.service.NotificationPublisher;
import com.thors.module.notification.service.NotificationTypes;
import com.thors.module.order.dto.OrderViews.Detail;
import com.thors.module.order.dto.OrderViews.Page;
import com.thors.module.order.repository.OrderRepository;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderService {
    private static final int MAX_SIZE = 50;

    /** Tài khoản khách dùng để tạo đơn mẫu khi Owner / Family Member bấm nút test. */
    private static final String TEST_CUSTOMER_EMAIL = "customer@thors.shop";

    /** Các vai trò xử lý đơn online của cửa hàng. */
    private static final Set<String> STORE_ROLES = Set.of("OWNER", "FAMILY_MEMBER");

    /** Luồng xử lý của cửa hàng (chỉ Owner): trạng thái hiện tại -> các trạng thái được chuyển tới. */
    private static final Map<String, List<String>> OWNER_FLOW =
            Map.of(
                    OrderStatus.PENDING_CONFIRMATION,
                    List.of(OrderStatus.AWAITING_PICKUP, OrderStatus.REJECTED),
                    OrderStatus.AWAITING_PICKUP, List.of(OrderStatus.SHIPPING),
                    OrderStatus.SHIPPING, List.of(OrderStatus.DELIVERED),
                    OrderStatus.DELIVERED, List.of(OrderStatus.COMPLETED));

    /** Customer chỉ được hủy khi cửa hàng chưa xác nhận. */
    private static final Set<String> CUSTOMER_CANCELABLE =
            Set.of(OrderStatus.AWAITING_PAYMENT, OrderStatus.PENDING_CONFIRMATION);

    /** Vai trò nhận thông báo của chủ shop (cùng tên với Account.role()). */
    private static final String OWNER_ROLE = "OWNER";

    /** Hình thức giao: SELF = cửa hàng tự giao (địa chỉ gần), còn lại là đơn vị vận chuyển (địa chỉ xa). */
    private static final Set<String> ALLOWED_CARRIERS =
            Set.of("SELF", "GHN", "GHTK", "VIETTEL_POST", "JT");

    private final OrderRepository orders;
    private final NotificationPublisher notifications;

    public OrderService(OrderRepository orders, NotificationPublisher notifications) {
        this.orders = orders;
        this.notifications = notifications;
    }

    private static boolean isStore(Account actor) {
        return STORE_ROLES.contains(actor.role());
    }

    private static boolean isCustomer(Account actor) {
        return "CUSTOMER".equals(actor.role());
    }

    private static void requireOrderAccess(Account actor) {
        if (!isCustomer(actor) && !isStore(actor))
            throw new ApiException(403, "ROLE", "Vai trò này không được xem đơn hàng online.");
    }

    /**
     * View Order List: Customer thấy đơn của chính mình; Owner và Family Member thấy mọi đơn
     * online. Có lọc theo trạng thái, tìm theo mã đơn / tên / số điện thoại người nhận và phân trang.
     */
    public Page list(Account actor, String status, String q, int page, int size) {
        requireOrderAccess(actor);
        List<String> statuses = parseStatuses(status);
        String safeQuery = blankToNull(q);
        if (safeQuery != null && safeQuery.length() > 100)
            throw new ApiException(400, "QUERY", "Từ khóa tìm kiếm quá dài.");

        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), MAX_SIZE);
        Integer customerId = isCustomer(actor) ? actor.id() : null;

        var slice =
                orders.search(
                        customerId, OrderStatus.TYPE_ONLINE, statuses, safeQuery, safePage, safeSize);
        int totalPages = (int) Math.ceil(slice.total() / (double) safeSize);
        return new Page(slice.items(), safePage, safeSize, slice.total(), totalPages);
    }

    /**
     * View Order Detail: Customer chỉ xem đơn của mình (đơn của người khác trả 404 để không lộ đơn có
     * tồn tại); nhân viên cửa hàng xem mọi đơn online, kèm thông tin khách.
     */
    public Detail detail(Account actor, int orderId) {
        requireOrderAccess(actor);
        var found =
                orders.find(orderId, isStore(actor))
                        .filter(f -> OrderStatus.TYPE_ONLINE.equals(f.orderType()))
                        .filter(f -> !isCustomer(actor) || f.userId() == actor.id())
                        .orElseThrow(
                                () -> new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."));
        return found.detail();
    }

    /**
     * Chỉ để test: tạo một đơn online mẫu rồi gửi thông báo. Customer tạo cho chính mình;
     * Owner / Family Member tạo cho tài khoản customer@thors.shop.
     */
    @Transactional
    public Detail createSample(Account actor) {
        requireOrderAccess(actor);
        int customerId =
                isCustomer(actor)
                        ? actor.id()
                        : orders.findUserIdByEmail(TEST_CUSTOMER_EMAIL)
                        .orElseThrow(
                                () ->
                                        new ApiException(
                                                404,
                                                "TEST_CUSTOMER",
                                                "Không tìm thấy tài khoản " + TEST_CUSTOMER_EMAIL));

        String orderNumber = "ORD-" + System.currentTimeMillis();
        int quantity = ThreadLocalRandom.current().nextInt(1, 3);
        int orderId =
                orders.createSampleOrder(customerId, orderNumber, quantity)
                        .orElseThrow(
                                () ->
                                        new ApiException(
                                                400, "NO_PRODUCT", "Chưa có sản phẩm nào để tạo đơn mẫu."));

        // Báo cho khách
        notifications.toUser(
                customerId,
                NotificationTypes.ORDER_STATUS,
                "Đặt hàng thành công",
                "Đơn " + orderNumber + " đã được ghi nhận và đang chờ cửa hàng xác nhận.",
                NotificationTypes.ENTITY_ORDER,
                orderId);
        // Báo cho chủ shop: có đơn đang chờ xác nhận
        notifications.toRole(
                OWNER_ROLE,
                NotificationTypes.ORDER_STATUS,
                "Có đơn hàng online mới",
                "Đơn " + orderNumber + " đang chờ xác nhận.",
                NotificationTypes.ENTITY_ORDER,
                orderId);

        return detail(actor, orderId);
    }

    /**
     * Chuyển trạng thái đơn. Owner đi theo luồng xác nhận -> giao -> hoàn tất (hoặc từ chối); Customer
     * chỉ hủy được đơn của mình khi chưa được xác nhận. Mỗi lần chuyển đều gửi thông báo cho bên còn lại.
     * Bản này chỉ đổi trạng thái, chưa trừ tồn kho.
     */
    @Transactional
    public Detail changeStatus(
            Account actor, int orderId, String target, String reason, String carrier) {
        requireOrderAccess(actor);
        if (!isCustomer(actor) && !"OWNER".equals(actor.role()))
            throw new ApiException(403, "ROLE", "Chỉ Owner được xử lý đơn hàng online.");
        if (target == null || !OrderStatus.ALL.contains(target))
            throw new ApiException(400, "ORDER_STATUS", "Trạng thái đơn hàng không hợp lệ.");
        String safeReason = blankToNull(reason);
        if (safeReason != null && safeReason.length() > 255)
            throw new ApiException(400, "REASON", "Lý do quá dài (tối đa 255 ký tự).");
        String safeCarrier = blankToNull(carrier);
        if (OrderStatus.SHIPPING.equals(target)) {
            if (safeCarrier == null || !ALLOWED_CARRIERS.contains(safeCarrier))
                throw new ApiException(400, "CARRIER", "Vui lòng chọn hình thức giao hàng.");
        } else {
            safeCarrier = null;
        }

        var found =
                orders.find(orderId, isStore(actor))
                        .filter(f -> OrderStatus.TYPE_ONLINE.equals(f.orderType()))
                        .filter(f -> !isCustomer(actor) || f.userId() == actor.id())
                        .orElseThrow(
                                () -> new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."));
        String current = found.detail().orderStatus();
        String number = found.detail().orderNumber();

        boolean allowed =
                isCustomer(actor)
                        ? OrderStatus.CANCELLED.equals(target) && CUSTOMER_CANCELABLE.contains(current)
                        : OWNER_FLOW.getOrDefault(current, List.of()).contains(target);
        if (!allowed)
            throw new ApiException(
                    409, "ORDER_TRANSITION", "Không thể chuyển đơn từ " + current + " sang " + target + ".");

        String finalReason = safeReason;
        if (finalReason == null && OrderStatus.REJECTED.equals(target)) finalReason = "Cửa hàng từ chối đơn";
        if (finalReason == null && OrderStatus.CANCELLED.equals(target)) finalReason = "Khách hủy đơn";

        if (!orders.transition(orderId, current, target, actor.id(), finalReason, safeCarrier))
            throw new ApiException(
                    409, "ORDER_STATE", "Trạng thái đơn vừa thay đổi, vui lòng tải lại trang.");

        int customerId = found.userId();
        switch (target) {
            case OrderStatus.AWAITING_PICKUP ->
                    notifyCustomer(customerId, orderId, "Đơn hàng đã được xác nhận",
                            "Đơn " + number + " đã được xác nhận và đang chờ lấy hàng.");
            case OrderStatus.REJECTED ->
                    notifyCustomer(customerId, orderId, "Đơn hàng bị từ chối",
                            "Đơn " + number + " bị từ chối: " + finalReason);
            case OrderStatus.SHIPPING ->
                    notifyCustomer(customerId, orderId, "Đơn hàng đang được giao",
                            "SELF".equals(safeCarrier)
                                    ? "Đơn " + number + " đang được cửa hàng giao đến bạn."
                                    : "Đơn " + number + " đã được giao cho đơn vị vận chuyển.");
            case OrderStatus.DELIVERED ->
                    notifyCustomer(customerId, orderId, "Đơn hàng đã giao",
                            "Đơn " + number + " đã được giao thành công.");
            case OrderStatus.COMPLETED ->
                    notifyCustomer(customerId, orderId, "Đơn hàng hoàn tất",
                            "Đơn " + number + " đã hoàn tất. Cảm ơn bạn đã mua hàng!");
            case OrderStatus.CANCELLED ->
                    notifications.toRole(
                            OWNER_ROLE,
                            NotificationTypes.ORDER_STATUS,
                            "Khách đã hủy đơn",
                            "Đơn " + number + " đã bị khách hủy: " + finalReason,
                            NotificationTypes.ENTITY_ORDER,
                            orderId);
            default -> {}
        }
        return detail(actor, orderId);
    }

    private void notifyCustomer(int userId, int orderId, String title, String message) {
        notifications.toUser(
                userId,
                NotificationTypes.ORDER_STATUS,
                title,
                message,
                NotificationTypes.ENTITY_ORDER,
                orderId);
    }

    /** status là một trạng thái hoặc nhiều trạng thái ngăn cách bằng dấu phẩy (ví dụ tab "Đã hủy"). */
    private static List<String> parseStatuses(String status) {
        String safe = blankToNull(status);
        if (safe == null) return List.of();
        List<String> out = new java.util.ArrayList<>();
        for (String part : safe.split(",")) {
            String s = part.trim();
            if (s.isEmpty()) continue;
            if (!OrderStatus.ALL.contains(s))
                throw new ApiException(400, "ORDER_STATUS", "Trạng thái đơn hàng không hợp lệ.");
            out.add(s);
        }
        return out;
    }

    private static String blankToNull(String value) {
        if (value == null) return null;
        String s = value.trim();
        return s.isEmpty() ? null : s;
    }
}