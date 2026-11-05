package com.thors.module.order.service;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.notification.service.NotificationPublisher;
import com.thors.module.notification.service.NotificationTypes;
import com.thors.module.order.delivery.DeliveryService;
import com.thors.module.order.delivery.GhnShippingService;
import com.thors.module.order.dto.OrderViews.Detail;
import com.thors.module.order.dto.OrderViews.Page;
import com.thors.module.order.repository.OrderRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderService {
    private static final int MAX_SIZE = 50;

    /** Tài khoản khách dùng để tạo đơn mẫu khi Owner bấm nút test. */
    private static final String TEST_CUSTOMER_EMAIL = "customer@thors.shop";

    /** Các vai trò xử lý đơn online của cửa hàng. */
    private static final Set<String> STORE_ROLES = Set.of("OWNER", "FAMILY_MEMBER");

    /** Luồng xử lý của cửa hàng (chỉ Owner): trạng thái hiện tại -> các trạng thái được chuyển tới. */
    private static final Map<String, List<String>> OWNER_FLOW =
            Map.of(
                    OrderStatus.PENDING_CONFIRMATION,
                    List.of(OrderStatus.AWAITING_PICKUP, OrderStatus.REJECTED),
                    OrderStatus.AWAITING_PICKUP, List.of(OrderStatus.SHIPPING),
                    OrderStatus.SHIPPING, List.of(OrderStatus.DELIVERED));

    /**
     * Customer: hủy khi cửa hàng chưa xác nhận; bấm "Đã nhận hàng" khi đơn đã giao. Owner không tự
     * hoàn tất đơn, nếu khách không bấm thì hệ thống tự hoàn tất sau AUTO_COMPLETE_DAYS ngày.
     */
    private static final Map<String, List<String>> CUSTOMER_FLOW =
            Map.of(
                    OrderStatus.AWAITING_PAYMENT, List.of(OrderStatus.CANCELLED),
                    OrderStatus.PENDING_CONFIRMATION, List.of(OrderStatus.CANCELLED),
                    OrderStatus.DELIVERED, List.of(OrderStatus.COMPLETED));

    /** Số ngày sau khi giao mà khách chưa xác nhận thì đơn tự hoàn tất. */
    private static final int AUTO_COMPLETE_DAYS = 7;

    /** Vai trò nhận thông báo của chủ shop (cùng tên với Account.role()). */
    private static final String OWNER_ROLE = "OWNER";

    /** Hình thức giao: SELF = cửa hàng tự giao (địa chỉ gần), còn lại là đơn vị vận chuyển (địa chỉ xa). */
    private static final Set<String> ALLOWED_CARRIERS =
            Set.of("SELF", "GHN", "GHTK", "VIETTEL_POST", "JT");

    /** Bộ lọc hình thức thanh toán: khớp đúng giá trị cột orders.payment_method. */
    private static final Set<String> PAYMENT_FILTERS = Set.of("COD", "ONLINE", "CASH");

    private final OrderRepository orders;
    private final NotificationPublisher notifications;
    private final GhnShippingService ghnShipping;
    private final DeliveryService delivery;

    public OrderService(
            OrderRepository orders,
            NotificationPublisher notifications,
            GhnShippingService ghnShipping,
            DeliveryService delivery) {
        this.orders = orders;
        this.notifications = notifications;
        this.ghnShipping = ghnShipping;
        this.delivery = delivery;
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
     * online. Có lọc theo trạng thái, ngày đặt (dateFrom, dateTo, gồm cả hai đầu), hình thức thanh
     * toán (COD / ONLINE / CASH), tìm theo mã đơn / tên / số điện thoại người nhận và phân trang.
     */
    public Page list(
            Account actor,
            String status,
            String q,
            LocalDate dateFrom,
            LocalDate dateTo,
            String paymentMethod,
            int page,
            int size) {
        requireOrderAccess(actor);
        List<String> statuses = parseStatuses(status);
        String safeQuery = blankToNull(q);
        if (safeQuery != null && safeQuery.length() > 100)
            throw new ApiException(400, "QUERY", "Từ khóa tìm kiếm quá dài.");

        if (dateFrom != null && dateTo != null && dateFrom.isAfter(dateTo))
            throw new ApiException(400, "DATE_RANGE", "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");

        String safePayment = blankToNull(paymentMethod);
        if (safePayment != null) {
            safePayment = safePayment.toUpperCase();
            if (!PAYMENT_FILTERS.contains(safePayment))
                throw new ApiException(400, "PAYMENT_METHOD", "Hình thức thanh toán không hợp lệ.");
        }

        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), MAX_SIZE);
        Integer customerId = isCustomer(actor) ? actor.id() : null;

        var slice =
                orders.search(
                        customerId,
                        OrderStatus.TYPE_ONLINE,
                        statuses,
                        safeQuery,
                        dateFrom,
                        dateTo,
                        safePayment,
                        safePage,
                        safeSize);
        int totalPages = (int) Math.ceil(slice.total() / (double) safeSize);
        return new Page(slice.items(), safePage, safeSize, slice.total(), totalPages);
    }

    /** Số đơn theo từng trạng thái: Customer đếm đơn của mình, nhân viên cửa hàng đếm mọi đơn online. */
    public Map<String, Long> counts(Account actor) {
        requireOrderAccess(actor);
        return orders.countByStatus(isCustomer(actor) ? actor.id() : null, OrderStatus.TYPE_ONLINE);
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
     * Chỉ để test: tạo một đơn online mẫu cho tài khoản customer@thors.shop rồi gửi thông báo.
     * Chỉ Owner được dùng; Customer và các vai trò khác bị chặn.
     */
    @Transactional
    public Detail createSample(Account actor) {
        if (!"OWNER".equals(actor.role()))
            throw new ApiException(403, "ROLE", "Chỉ Owner được dùng chức năng tạo đơn mẫu.");
        int customerId =
                orders.findUserIdByEmail(TEST_CUSTOMER_EMAIL)
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

        // Dùng chung thông báo với luồng đặt hàng thật
        notifyOrderPlaced(customerId, orderId, orderNumber, OrderStatus.PENDING_CONFIRMATION);

        return detail(actor, orderId);
    }

    // ------------------------------------------------------------------
    // Thông báo khi có đơn mới: gọi từ mọi nơi tạo đơn online (checkout thật, đơn mẫu, thanh toán xong)
    // ------------------------------------------------------------------

    /**
     * Gọi ngay sau khi một đơn online mới được tạo (checkout thật hoặc đơn mẫu). Đơn chờ thanh toán
     * online thì chỉ báo khách; chủ shop chỉ được báo khi đơn đã sẵn sàng để xác nhận.
     */
    public void notifyOrderPlaced(int customerId, int orderId, String orderNumber, String orderStatus) {
        if (OrderStatus.AWAITING_PAYMENT.equals(orderStatus)) {
            notifyCustomer(
                    customerId,
                    orderId,
                    "Đặt hàng thành công",
                    "Đơn " + orderNumber + " đã được tạo. Vui lòng thanh toán để cửa hàng xử lý đơn.");
            return;
        }
        notifyCustomer(
                customerId,
                orderId,
                "Đặt hàng thành công",
                "Đơn " + orderNumber + " đã được ghi nhận và đang chờ cửa hàng xác nhận.");
        notifyOwnersNewOrder(orderId, orderNumber);
    }

    /**
     * Báo chủ shop có đơn đang chờ xác nhận. Gọi thêm ở chỗ xử lý thanh toán online thành công (đơn
     * chuyển từ AWAITING_PAYMENT sang PENDING_CONFIRMATION).
     */
    public void notifyOwnersNewOrder(int orderId, String orderNumber) {
        notifications.toRole(
                OWNER_ROLE,
                NotificationTypes.ORDER_STATUS,
                "Có đơn hàng online mới",
                "Đơn " + orderNumber + " đang chờ xác nhận.",
                NotificationTypes.ENTITY_ORDER,
                orderId);
    }

    /**
     * Chuyển trạng thái đơn. Owner đi theo luồng xác nhận -> giao -> hoàn tất (hoặc từ chối); Customer
     * chỉ hủy được đơn của mình khi chưa được xác nhận. Mỗi lần chuyển đều gửi thông báo cho bên còn lại.
     * Bản này chỉ đổi trạng thái, chưa trừ tồn kho.
     *
     * <p>Chọn GHN khi chuyển sang SHIPPING thì tạo vận đơn thật trên GHN; weightG là cân nặng Owner
     * nhập (null = cân nặng mặc định), ghnDistrictId / ghnWardCode là Quận-Huyện / Phường-Xã theo GHN
     * Owner chọn (null = dùng mã đã lưu ở đơn).
     */
    @Transactional
    public Detail changeStatus(
            Account actor,
            int orderId,
            String target,
            String reason,
            String carrier,
            Integer weightG,
            Integer ghnDistrictId,
            String ghnWardCode) {
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
                (isCustomer(actor) ? CUSTOMER_FLOW : OWNER_FLOW)
                        .getOrDefault(current, List.of())
                        .contains(target);
        if (!allowed)
            throw new ApiException(
                    409, "ORDER_TRANSITION", "Không thể chuyển đơn từ " + current + " sang " + target + ".");

        // Đơn đã tạo vận đơn GHN: "Đang giao" / "Đã giao" do GHN báo về (webhook / hỏi định kỳ), chủ shop
        // không tự bấm
        var shipment = found.detail().shipment();
        if ((OrderStatus.SHIPPING.equals(target) || OrderStatus.DELIVERED.equals(target))
                && shipment != null
                && GhnShippingService.CARRIER.equals(shipment.carrier()))
            throw new ApiException(
                    409,
                    "CARRIER_MANAGED",
                    "Đơn đã gửi GHN sẽ tự chuyển trạng thái khi GHN lấy hàng và giao thành công.");

        // Không tìm thấy địa chỉ giao trên bản đồ: chặn ngay từ bước xác nhận đơn (lúc này chủ shop vẫn từ
        // chối được), và chặn cả lúc bàn giao (bất kể hình thức giao) cho các đơn đã xác nhận từ trước
        if (OrderStatus.AWAITING_PICKUP.equals(target))
            delivery.requireDeliverableAddress(orderId, DeliveryService.NOT_FOUND_ON_CONFIRM);
        else if (OrderStatus.SHIPPING.equals(target))
            delivery.requireDeliverableAddress(orderId, DeliveryService.NOT_FOUND_ON_SHIP);

        String finalReason = safeReason;
        if (finalReason == null && OrderStatus.REJECTED.equals(target)) finalReason = "Cửa hàng từ chối đơn";
        if (finalReason == null && OrderStatus.CANCELLED.equals(target)) finalReason = "Khách hủy đơn";

        if (OrderStatus.SHIPPING.equals(target) && GhnShippingService.CARRIER.equals(safeCarrier)) {
            // Tạo vận đơn GHN và lưu vào đơn; tự kiểm tra trạng thái đơn và báo lỗi nếu không được
            ghnShipping.ship(orderId, current, weightG, ghnDistrictId, ghnWardCode);
        } else if (!orders.transition(orderId, current, target, actor.id(), finalReason, safeCarrier))
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
            case OrderStatus.SHIPPING -> {
                if (GhnShippingService.CARRIER.equals(safeCarrier))
                    notifyCustomer(customerId, orderId, "Đơn hàng đã được gửi GHN",
                            "Đơn " + number + " đã được tạo vận đơn GHN và đang chờ GHN đến lấy hàng.");
                else
                    notifyCustomer(customerId, orderId, "Đơn hàng đang được giao",
                            "SELF".equals(safeCarrier)
                                    ? "Đơn " + number + " đang được cửa hàng giao đến bạn."
                                    : "Đơn " + number + " đã được giao cho đơn vị vận chuyển.");
            }
            case OrderStatus.DELIVERED ->
                    notifyCustomer(customerId, orderId, "Đơn hàng đã giao",
                            "Đơn " + number + " đã được giao thành công.");
            case OrderStatus.COMPLETED ->
                    notifications.toRole(
                            OWNER_ROLE,
                            NotificationTypes.ORDER_STATUS,
                            "Khách đã nhận hàng",
                            "Đơn " + number + " đã được khách xác nhận nhận hàng.",
                            NotificationTypes.ENTITY_ORDER,
                            orderId);
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

    /**
     * Việc nền: hủy đơn online chờ thanh toán đã quá hạn (đơn trả tiền online được cho 2 giờ, hạn lưu ở
     * payment_expires_at). Trả về số đơn đã chuyển sang hết hạn.
     */
    @Transactional
    public int expireUnpaidOrders() {
        int count = 0;
        for (var due : orders.expiredUnpaid()) {
            boolean moved =
                    orders.transition(
                            due.orderId(),
                            OrderStatus.AWAITING_PAYMENT,
                            OrderStatus.EXPIRED,
                            null,
                            "Hết hạn thanh toán",
                            null);
            if (!moved) continue;
            notifyCustomer(
                    due.userId(),
                    due.orderId(),
                    "Đơn hàng đã hết hạn",
                    "Đơn " + due.orderNumber() + " đã hết hạn thanh toán và bị hủy.");
            count++;
        }
        return count;
    }

    /** Việc nền: tự hoàn tất đơn đã giao quá AUTO_COMPLETE_DAYS ngày mà khách chưa xác nhận. */
    @Transactional
    public int autoCompleteDelivered() {
        int count = 0;
        for (var due : orders.deliveredLongAgo(AUTO_COMPLETE_DAYS)) {
            boolean moved =
                    orders.transition(
                            due.orderId(),
                            OrderStatus.DELIVERED,
                            OrderStatus.COMPLETED,
                            null,
                            null,
                            null);
            if (!moved) continue;
            notifyCustomer(
                    due.userId(),
                    due.orderId(),
                    "Đơn hàng hoàn tất",
                    "Đơn " + due.orderNumber() + " đã tự động hoàn tất sau " + AUTO_COMPLETE_DAYS
                            + " ngày kể từ khi giao.");
            count++;
        }
        return count;
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