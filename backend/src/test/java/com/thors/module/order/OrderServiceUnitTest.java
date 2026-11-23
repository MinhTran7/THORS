package com.thors.module.order;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.notification.service.NotificationPublisher;
import com.thors.module.notification.service.NotificationTypes;
import com.thors.module.order.delivery.GhnShippingService;
import com.thors.module.order.dto.OrderViews.Detail;
import com.thors.module.order.dto.OrderViews.ListItem;
import com.thors.module.order.dto.OrderViews.Page;
import com.thors.module.order.repository.OrderRepository;
import com.thors.module.order.repository.OrderRepository.Due;
import com.thors.module.order.repository.OrderRepository.Found;
import com.thors.module.order.repository.OrderRepository.Slice;
import com.thors.module.order.repository.OrderRepository.StockLine;
import com.thors.module.order.service.OrderMailService;
import com.thors.module.order.service.OrderService;
import com.thors.module.warehouse.WarehouseStore;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;

/**
 * Unit test cho OrderService theo sheet "Order" của Report-5.1_Unit Test (UTC-ORD-001..053). Mỗi test mang
 * đúng mã Test Case ID trong sheet.
 *
 * <p>Kỳ vọng viết đúng theo sheet. UTC-ORD-025..027 để @Disabled vì hàm createSample đã bị gỡ khỏi
 * OrderService.
 */
@DisplayName("OrderService Unit Test")
class OrderServiceUnitTest {
    private static final LocalDateTime AT = LocalDateTime.of(2026, 11, 15, 9, 0);
    private static final String ROLE_VIEW = "Vai trò này không được xem đơn hàng online.";

    private OrderRepository orders;
    private NotificationPublisher notifications;
    private WarehouseStore warehouse;
    private OrderService service;

    private final Account customer = account(7, "CUSTOMER");
    private final Account owner = account(2, "OWNER");
    private final Account admin = account(1, "ADMIN");

    @BeforeEach
    void setUp() {
        orders = mock(OrderRepository.class);
        notifications = mock(NotificationPublisher.class);
        warehouse = mock(WarehouseStore.class);
        service = new OrderService(
                orders, notifications, mock(GhnShippingService.class), warehouse, mock(OrderMailService.class));
        when(orders.isCustomerAccount(7)).thenReturn(true);
    }

    // ------------------------------------------------------------------ helpers

    private static Account account(int id, String role) {
        return new Account(id, role, "User " + id, "$2a$10$hash", "user" + id + "@shop.com", null, null, null,
                "ACTIVE", AT, AT, null, 0, null);
    }

    private static Detail detail(int id, String status, String paymentMethod, String paymentStatus) {
        return new Detail(id, "ORD-" + id, AT, status, null, paymentMethod, paymentStatus, null,
                200_000, null, 0, null, 0, 30_000, 230_000, "Nguyễn Văn A", "0912345678", "12 Trần Hưng Đạo",
                null, null, null, null, null, null, List.of(), null, null, null);
    }

    /** Đơn online id của khách userId đang ở trạng thái status (COD, chưa thanh toán). */
    private Detail stored(int id, int userId, String status) {
        return stored(id, userId, status, "Online");
    }

    private Detail stored(int id, int userId, String status, String orderType) {
        Detail d = detail(id, status, "COD", "UNPAID");
        when(orders.find(eq(id), anyBoolean())).thenReturn(Optional.of(new Found(userId, orderType, d)));
        return d;
    }

    private static ListItem item(int id) {
        return new ListItem(id, "ORD-" + id, AT, "PENDING_CONFIRMATION", null, "COD", "UNPAID", 230_000,
                "Nguyễn Văn A", "0912345678", "12 Trần Hưng Đạo", 1, "Áo thun", null, List.of(), null, null);
    }

    private void searchReturns(int count) {
        var items = IntStream.rangeClosed(1, count).mapToObj(OrderServiceUnitTest::item).toList();
        when(orders.search(any(), anyString(), anyList(), any(), any(), any(), any(), any(), any(), anyInt(), anyInt()))
                .thenReturn(new Slice(items, count));
    }

    /** Kiểm tra các tham số service truyền xuống repository.search. */
    private void verifySearch(Integer customerId, List<String> statuses, String q, LocalDate from, LocalDate to,
                              String payment, int page, int size) {
        verify(orders).search(eq(customerId), eq("Online"), eq(statuses), eq(q), eq(from), eq(to), eq(payment),
                isNull(), isNull(), eq(page), eq(size));
    }

    private static ApiException api(int status, String code, Executable call) {
        ApiException e = assertThrows(ApiException.class, call);
        assertEquals(status, e.status);
        assertEquals(code, e.code);
        return e;
    }

    private static ApiException api(int status, String code, String message, Executable call) {
        ApiException e = api(status, code, call);
        assertEquals(message, e.getMessage());
        return e;
    }

    private void verifyToCustomer(int userId, String title, int orderId) {
        verify(notifications).toUser(eq(userId), eq(NotificationTypes.ORDER_STATUS), eq(title), anyString(),
                eq(NotificationTypes.ENTITY_ORDER), eq(orderId));
    }

    private void verifyToRole(String role, String title, int orderId) {
        verify(notifications).toRole(eq(role), eq(NotificationTypes.ORDER_STATUS), eq(title), anyString(),
                eq(NotificationTypes.ENTITY_ORDER), eq(orderId));
    }

    // ------------------------------------------------------------------ list

    @Nested
    @DisplayName("list(Account actor, String status, String q, LocalDate dateFrom, LocalDate dateTo, String paymentMethod, String source, int page, int size)")
    class ListTests {
        @Test
        @DisplayName("UTC-ORD-001: Customer id=7 xem danh sách 3 đơn của mình")
        void ord001() {
            searchReturns(3);

            Page p = service.list(customer, null, null, null, null, null, null, 0, 10);

            verifySearch(7, List.of(), null, null, null, null, 0, 10);
            assertEquals(3, p.items().size());
            assertEquals(3, p.total());
            assertEquals(1, p.totalPages());
        }

        @Test
        @DisplayName("UTC-ORD-002: Owner xem mọi đơn online của cửa hàng (customerId = null)")
        void ord002() {
            searchReturns(5);

            Page p = service.list(owner, null, null, null, null, null, null, 0, 10);

            verifySearch(null, List.of(), null, null, null, null, 0, 10);
            assertEquals(5, p.items().size());
        }

        @Test
        @DisplayName("UTC-ORD-003: lọc nhiều trạng thái ngăn cách bằng dấu phẩy")
        void ord003() {
            searchReturns(2);

            service.list(owner, "PENDING_CONFIRMATION, AWAITING_PICKUP", null, null, null, null, null, 0, 10);

            verifySearch(null, List.of("PENDING_CONFIRMATION", "AWAITING_PICKUP"), null, null, null, null, 0, 10);
        }

        @Test
        @DisplayName("UTC-ORD-004: tìm theo mã đơn q = 'ORD-123456'")
        void ord004() {
            searchReturns(1);

            service.list(owner, null, "ORD-123456", null, null, null, null, 0, 10);

            verifySearch(null, List.of(), "ORD-123456", null, null, null, 0, 10);
        }

        @Test
        @DisplayName("UTC-ORD-005: paymentMethod 'cod' được chuyển thành 'COD'")
        void ord005() {
            searchReturns(1);

            service.list(owner, null, null, null, null, "cod", null, 0, 10);

            verifySearch(null, List.of(), null, null, null, "COD", 0, 10);
        }

        @Test
        @DisplayName("UTC-ORD-006: lọc khoảng ngày 2026-11-01 đến 2026-11-10")
        void ord006() {
            searchReturns(2);
            LocalDate from = LocalDate.of(2026, 11, 1), to = LocalDate.of(2026, 11, 10);

            service.list(owner, null, null, from, to, null, null, 0, 10);

            verifySearch(null, List.of(), null, from, to, null, 0, 10);
        }

        @Test
        @DisplayName("UTC-ORD-007: dateFrom bằng dateTo (2026-11-15)")
        void ord007() {
            searchReturns(1);
            LocalDate day = LocalDate.of(2026, 11, 15);

            assertDoesNotThrow(() -> service.list(owner, null, null, day, day, null, null, 0, 10));

            verifySearch(null, List.of(), null, day, day, null, 0, 10);
        }

        @Test
        @DisplayName("UTC-ORD-008: page = -3 được ép về 0")
        void ord008() {
            searchReturns(0);

            Page p = service.list(owner, null, null, null, null, null, null, -3, 10);

            verifySearch(null, List.of(), null, null, null, null, 0, 10);
            assertEquals(0, p.page());
        }

        @Test
        @DisplayName("UTC-ORD-009: size = 0 hoặc -5 được ép về 1")
        void ord009() {
            searchReturns(0);

            assertEquals(1, service.list(owner, null, null, null, null, null, null, 0, 0).size());
            assertEquals(1, service.list(owner, null, null, null, null, null, null, 0, -5).size());

            verify(orders, times(2)).search(isNull(), eq("Online"), eq(List.of()), isNull(), isNull(), isNull(),
                    isNull(), isNull(), isNull(), eq(0), eq(1));
        }

        @Test
        @DisplayName("UTC-ORD-010: size = 100 được ép về MAX_SIZE 50")
        void ord010() {
            searchReturns(0);

            Page p = service.list(owner, null, null, null, null, null, null, 0, 100);

            verifySearch(null, List.of(), null, null, null, null, 0, 50);
            assertEquals(50, p.size());
        }

        @Test
        @DisplayName("UTC-ORD-011: từ khóa q đúng 100 ký tự (biên trên hợp lệ)")
        void ord011() {
            searchReturns(0);
            String q = "a".repeat(100);

            assertDoesNotThrow(() -> service.list(owner, null, q, null, null, null, null, 0, 10));

            verifySearch(null, List.of(), q, null, null, null, 0, 10);
        }

        @Test
        @DisplayName("UTC-ORD-012: Admin không được xem danh sách đơn online")
        void ord012() {
            api(403, "ROLE", ROLE_VIEW, () -> service.list(admin, null, null, null, null, null, null, 0, 10));
            verifyNoInteractions(orders);
        }

        @Test
        @DisplayName("UTC-ORD-013: từ khóa q 101 ký tự")
        void ord013() {
            api(400, "QUERY", "Từ khóa tìm kiếm quá dài.",
                    () -> service.list(owner, null, "a".repeat(101), null, null, null, null, 0, 10));
        }

        @Test
        @DisplayName("UTC-ORD-014: dateFrom sau dateTo")
        void ord014() {
            api(400, "DATE_RANGE", "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.",
                    () -> service.list(owner, null, null, LocalDate.of(2026, 11, 20), LocalDate.of(2026, 11, 10),
                            null, null, 0, 10));
        }

        @Test
        @DisplayName("UTC-ORD-015: paymentMethod 'CRYPTO' không hợp lệ")
        void ord015() {
            api(400, "PAYMENT_METHOD", "Hình thức thanh toán không hợp lệ.",
                    () -> service.list(owner, null, null, null, null, "CRYPTO", null, 0, 10));
        }

        @Test
        @DisplayName("UTC-ORD-016: status chứa trạng thái không tồn tại")
        void ord016() {
            api(400, "ORDER_STATUS", "Trạng thái đơn hàng không hợp lệ.",
                    () -> service.list(owner, "PENDING_CONFIRMATION, INVALID_STATUS", null, null, null, null, null, 0, 10));
        }
    }

    // ------------------------------------------------------------------ counts

    @Nested
    @DisplayName("counts(Account actor)")
    class CountsTests {
        @Test
        @DisplayName("UTC-ORD-017: Customer id=7 đếm đơn của riêng mình")
        void ord017() {
            Map<String, Long> mine = Map.of("AWAITING_PAYMENT", 1L, "DELIVERED", 2L);
            when(orders.countByStatus(7, "Online")).thenReturn(mine);

            assertEquals(mine, service.counts(customer));
        }

        @Test
        @DisplayName("UTC-ORD-018: Owner đếm toàn bộ đơn online (customerId = null)")
        void ord018() {
            Map<String, Long> all = Map.of("PENDING_CONFIRMATION", 4L, "SHIPPING", 3L, "COMPLETED", 3L);
            when(orders.countByStatus(null, "Online")).thenReturn(all);

            Map<String, Long> result = service.counts(owner);

            assertEquals(all, result);
            assertEquals(10L, result.values().stream().mapToLong(Long::longValue).sum());
        }

        @Test
        @DisplayName("UTC-ORD-019: Admin không được xem")
        void ord019() {
            api(403, "ROLE", ROLE_VIEW, () -> service.counts(admin));
            verifyNoInteractions(orders);
        }
    }

    // ------------------------------------------------------------------ detail

    @Nested
    @DisplayName("detail(Account actor, int orderId)")
    class DetailTests {
        @Test
        @DisplayName("UTC-ORD-020: Customer id=7 xem đơn 100 của chính mình")
        void ord020() {
            Detail d = stored(100, 7, "PENDING_CONFIRMATION");

            assertSame(d, service.detail(customer, 100));
            verify(orders).find(100, false);
        }

        @Test
        @DisplayName("UTC-ORD-021: Owner xem đơn 100 của khách, kèm thông tin khách")
        void ord021() {
            Detail d = stored(100, 7, "PENDING_CONFIRMATION");

            assertSame(d, service.detail(owner, 100));
            verify(orders).find(100, true);
        }

        @Test
        @DisplayName("UTC-ORD-022: Customer id=7 xem đơn 101 của Customer id=8")
        void ord022() {
            stored(101, 8, "PENDING_CONFIRMATION");

            api(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng.", () -> service.detail(customer, 101));
        }

        @Test
        @DisplayName("UTC-ORD-023: đơn 99999 không tồn tại")
        void ord023() {
            when(orders.find(eq(99999), anyBoolean())).thenReturn(Optional.empty());

            api(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng.", () -> service.detail(owner, 99999));
        }

        @Test
        @DisplayName("UTC-ORD-024: đơn 102 là đơn POS, không phải Online")
        void ord024() {
            stored(102, 7, "COMPLETED", "POS");

            api(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng.", () -> service.detail(owner, 102));
        }
    }

    // ------------------------------------------------------------------ createSample

    @Nested
    @DisplayName("createSample(Account actor)")
    class CreateSampleTests {
        private static final String REMOVED = "OrderService.createSample(Account) không còn trong code nên không gọi được";

        @Test
        @Disabled(REMOVED)
        @DisplayName("UTC-ORD-025: Owner tạo đơn online mẫu")
        void ord025() {}

        @Test
        @Disabled(REMOVED)
        @DisplayName("UTC-ORD-026: actor không phải OWNER tạo đơn mẫu")
        void ord026() {}

        @Test
        @Disabled(REMOVED)
        @DisplayName("UTC-ORD-027: chưa có tài khoản mẫu customer@thors.shop")
        void ord027() {}
    }

    // ------------------------------------------------------------------ notifyOrderPlaced

    @Nested
    @DisplayName("notifyOrderPlaced(customerId, orderId, orderNumber, orderStatus)")
    class NotifyOrderPlacedTests {
        @Test
        @DisplayName("UTC-ORD-028: đơn COD chờ xác nhận báo khách và cửa hàng")
        void ord028() {
            service.notifyOrderPlaced(7, 100, "ORD-100", "PENDING_CONFIRMATION");

            verifyToCustomer(7, "Đặt hàng thành công", 100);
            verifyToRole("OWNER", "Có đơn hàng online mới", 100);
            verifyToRole("FAMILY_MEMBER", "Có đơn hàng online mới", 100);
        }

        @Test
        @DisplayName("UTC-ORD-029: đơn chờ thanh toán online chỉ báo khách")
        void ord029() {
            service.notifyOrderPlaced(7, 101, "ORD-101", "AWAITING_PAYMENT");

            verify(notifications).toUser(eq(7), eq(NotificationTypes.ORDER_STATUS), eq("Đặt hàng thành công"),
                    contains("Vui lòng thanh toán"), eq(NotificationTypes.ENTITY_ORDER), eq(101));
            verify(notifications, never()).toRole(anyString(), anyString(), anyString(), anyString(), anyString(), anyInt());
        }
    }

    // ------------------------------------------------------------------ changeStatus

    @Nested
    @DisplayName("changeStatus(actor, orderId, target, reason, carrier, weightG, ghnProvinceId, ghnWardId)")
    class ChangeStatusTests {
        @BeforeEach
        void transitionsSucceed() {
            when(orders.transition(anyInt(), anyString(), anyString(), any(), any(), any())).thenReturn(true);
        }

        private Detail change(Account actor, String target, String reason, String carrier) {
            return service.changeStatus(actor, 100, target, reason, carrier, null, null, null);
        }

        @Test
        @DisplayName("UTC-ORD-030: Owner xác nhận đơn, xuất kho và báo khách")
        void ord030() {
            stored(100, 7, "PENDING_CONFIRMATION");
            when(orders.unshippedLines(100)).thenReturn(List.of(new StockLine(501, 11, 2, 2), new StockLine(502, 12, 1, 0)));

            change(owner, "AWAITING_PICKUP", null, null);

            verify(warehouse).lock();
            verify(orders).transition(100, "PENDING_CONFIRMATION", "AWAITING_PICKUP", 2, null, null);
            verify(warehouse).sell(2, 11, 2, 2, 501, "ORDER_OUT:item:501", "Xuất bán đơn online ORD-100");
            verify(warehouse).sell(2, 12, 1, 0, 502, "ORDER_OUT:item:502", "Xuất bán đơn online ORD-100");
            verify(orders).markStockDeducted(100);
            verifyToCustomer(7, "Đơn hàng đã được xác nhận", 100);
        }

        @Test
        @DisplayName("UTC-ORD-031: Owner từ chối đơn với lý do cụ thể")
        void ord031() {
            stored(100, 7, "PENDING_CONFIRMATION");

            change(owner, "REJECTED", "Hết hàng tạm thời", null);

            verify(orders).transition(100, "PENDING_CONFIRMATION", "REJECTED", 2, "Hết hàng tạm thời", null);
            verify(notifications).toUser(eq(7), eq(NotificationTypes.ORDER_STATUS), eq("Đơn hàng bị từ chối"),
                    contains("Hết hàng tạm thời"), eq(NotificationTypes.ENTITY_ORDER), eq(100));
            verify(warehouse, never()).sell(anyInt(), anyInt(), anyInt(), anyInt(), anyInt(), anyString(), anyString());
        }

        @Test
        @DisplayName("UTC-ORD-032: Owner từ chối đơn, bỏ trống lý do → lý do mặc định")
        void ord032() {
            stored(100, 7, "PENDING_CONFIRMATION");

            change(owner, "REJECTED", null, null);

            verify(orders).transition(100, "PENDING_CONFIRMATION", "REJECTED", 2, "Cửa hàng từ chối đơn", null);
            verify(notifications).toUser(eq(7), anyString(), eq("Đơn hàng bị từ chối"),
                    contains("Cửa hàng từ chối đơn"), anyString(), eq(100));
        }

        @Test
        @DisplayName("UTC-ORD-033: Owner chuyển đơn sang Đang giao, cửa hàng tự giao (SELF)")
        void ord033() {
            stored(100, 7, "AWAITING_PICKUP");

            change(owner, "SHIPPING", null, "SELF");

            verify(orders).transition(100, "AWAITING_PICKUP", "SHIPPING", 2, null, "SELF");
            verify(notifications).toUser(eq(7), anyString(), eq("Đơn hàng đang được giao"),
                    contains("đang được cửa hàng giao đến bạn"), anyString(), eq(100));
        }

        @Test
        @DisplayName("UTC-ORD-034: Owner bàn giao cho đối tác vận chuyển thứ ba (carrier='GHTK')")
        void ord034() {
            stored(100, 7, "AWAITING_PICKUP");

            change(owner, "SHIPPING", null, "GHTK");

            verify(orders).transition(100, "AWAITING_PICKUP", "SHIPPING", 2, null, "GHTK");
            verify(notifications).toUser(eq(7), anyString(), eq("Đơn hàng đang được giao"),
                    contains("đã được giao cho đơn vị vận chuyển"), anyString(), eq(100));
        }

        @Test
        @DisplayName("UTC-ORD-035: Owner xác nhận đã giao đơn tự giao")
        void ord035() {
            stored(100, 7, "SHIPPING");

            change(owner, "DELIVERED", null, null);

            verify(orders).transition(100, "SHIPPING", "DELIVERED", 2, null, null);
            verifyToCustomer(7, "Đơn hàng đã giao", 100);
        }

        @Test
        @DisplayName("UTC-ORD-036: Customer bấm 'Đã nhận hàng'")
        void ord036() {
            stored(100, 7, "DELIVERED");

            change(customer, "COMPLETED", null, null);

            verify(orders).transition(100, "DELIVERED", "COMPLETED", 7, null, null);
            verifyToRole("OWNER", "Khách đã nhận hàng", 100);
        }

        @Test
        @DisplayName("UTC-ORD-037: Customer hủy đơn chưa được xác nhận")
        void ord037() {
            stored(100, 7, "PENDING_CONFIRMATION");

            change(customer, "CANCELLED", "Đổi ý không mua nữa", null);

            verify(orders).transition(100, "PENDING_CONFIRMATION", "CANCELLED", 7, "Đổi ý không mua nữa", null);
            verify(notifications).toRole(eq("OWNER"), anyString(), eq("Khách đã hủy đơn"),
                    contains("Đổi ý không mua nữa"), anyString(), eq(100));
        }

        @Test
        @DisplayName("UTC-ORD-038: Customer hủy đơn chờ thanh toán → lý do mặc định, báo OWNER")
        void ord038() {
            stored(100, 7, "AWAITING_PAYMENT");

            change(customer, "CANCELLED", null, null);

            verify(orders).transition(100, "AWAITING_PAYMENT", "CANCELLED", 7, "Khách hủy đơn", null);
            verifyToRole("OWNER", "Khách đã hủy đơn", 100);
        }

        @Test
        @DisplayName("UTC-ORD-039: FAMILY_MEMBER đổi trạng thái đơn (chỉ OWNER được xử lý)")
        void ord039() {
            stored(100, 7, "PENDING_CONFIRMATION");

            api(403, "ROLE", "Chỉ Owner được xử lý đơn hàng online.",
                    () -> change(account(4, "FAMILY_MEMBER"), "AWAITING_PICKUP", null, null));
            verify(orders, never()).transition(anyInt(), anyString(), anyString(), any(), any(), any());
        }

        @Test
        @DisplayName("UTC-ORD-040: target 'UNKNOWN' không hợp lệ")
        void ord040() {
            api(400, "ORDER_STATUS", "Trạng thái đơn hàng không hợp lệ.", () -> change(owner, "UNKNOWN", null, null));
        }

        @Test
        @DisplayName("UTC-ORD-041: lý do 256 ký tự")
        void ord041() {
            api(400, "REASON", "Lý do quá dài (tối đa 255 ký tự).", () -> change(owner, "REJECTED", "r".repeat(256), null));
        }

        @Test
        @DisplayName("UTC-ORD-042: lý do đúng 255 ký tự (biên trên hợp lệ)")
        void ord042() {
            stored(100, 7, "PENDING_CONFIRMATION");
            String reason = "r".repeat(255);

            assertDoesNotThrow(() -> change(owner, "REJECTED", reason, null));

            verify(orders).transition(100, "PENDING_CONFIRMATION", "REJECTED", 2, reason, null);
        }

        @Test
        @DisplayName("UTC-ORD-043: chuyển SHIPPING nhưng không chọn carrier")
        void ord043() {
            api(400, "CARRIER", "Vui lòng chọn hình thức giao hàng.", () -> change(owner, "SHIPPING", null, null));
        }

        @Test
        @DisplayName("UTC-ORD-044: carrier 'GRAB_EXPRESS' không hợp lệ")
        void ord044() {
            api(400, "CARRIER", "Vui lòng chọn hình thức giao hàng.", () -> change(owner, "SHIPPING", null, "GRAB_EXPRESS"));
        }

        @Test
        @DisplayName("UTC-ORD-045: Owner nhảy cóc PENDING_CONFIRMATION → DELIVERED")
        void ord045() {
            stored(100, 7, "PENDING_CONFIRMATION");

            api(409, "ORDER_TRANSITION", "Không thể chuyển đơn từ PENDING_CONFIRMATION sang DELIVERED.",
                    () -> change(owner, "DELIVERED", null, null));
            verify(orders, never()).transition(anyInt(), anyString(), anyString(), any(), any(), any());
        }

        @Test
        @DisplayName("UTC-ORD-046: Customer hủy đơn đã được xác nhận")
        void ord046() {
            stored(100, 7, "AWAITING_PICKUP");

            api(409, "ORDER_TRANSITION", "Không thể chuyển đơn từ AWAITING_PICKUP sang CANCELLED.",
                    () -> change(customer, "CANCELLED", "Muốn hủy", null));
        }

        @Test
        @DisplayName("UTC-ORD-047: Customer tự xác nhận đơn")
        void ord047() {
            stored(100, 7, "PENDING_CONFIRMATION");

            api(409, "ORDER_TRANSITION", "Không thể chuyển đơn từ PENDING_CONFIRMATION sang AWAITING_PICKUP.",
                    () -> change(customer, "AWAITING_PICKUP", null, null));
        }

        @Test
        @DisplayName("UTC-ORD-048: trạng thái đơn vừa bị đổi (transition trả về false)")
        void ord048() {
            stored(100, 7, "PENDING_CONFIRMATION");
            when(orders.transition(anyInt(), anyString(), anyString(), any(), any(), any())).thenReturn(false);

            api(409, "ORDER_STATE", "Trạng thái đơn vừa thay đổi, vui lòng tải lại trang.",
                    () -> change(owner, "REJECTED", null, null));
            verifyNoInteractions(notifications);
        }

        @Test
        @DisplayName("UTC-ORD-049: xác nhận đơn nhưng tồn kho không đủ")
        void ord049() {
            stored(100, 7, "PENDING_CONFIRMATION");
            when(orders.unshippedLines(100)).thenReturn(List.of(new StockLine(501, 11, 5, 0)));
            when(warehouse.sell(anyInt(), anyInt(), anyInt(), anyInt(), anyInt(), anyString(), anyString()))
                    .thenThrow(WarehouseStore.invalid("Biến thể #11 không đủ hàng có thể bán: tồn 2, đang giữ cho đơn khác 0, cần 5."));

            api(409, "WAREHOUSE_CONFLICT", () -> change(owner, "AWAITING_PICKUP", null, null));
            // Lỗi ném ra khỏi hàm @Transactional nên Spring rollback cả bước đổi trạng thái
            verify(orders, never()).markStockDeducted(anyInt());
            verifyNoInteractions(notifications);
        }
    }

    // ------------------------------------------------------------------ background jobs

    @Nested
    @DisplayName("expireUnpaidOrders()")
    class ExpireTests {
        @Test
        @DisplayName("UTC-ORD-050: 3 đơn quá hạn thanh toán chuyển sang EXPIRED")
        void ord050() {
            when(orders.expiredUnpaid()).thenReturn(List.of(new Due(101, 7, "ORD-101"), new Due(102, 7, "ORD-102"),
                    new Due(103, 7, "ORD-103")));
            when(orders.transition(anyInt(), eq("AWAITING_PAYMENT"), eq("EXPIRED"), isNull(), eq("Hết hạn thanh toán"), isNull()))
                    .thenReturn(true);

            assertEquals(3, service.expireUnpaidOrders());

            for (int id : List.of(101, 102, 103)) {
                verify(orders).transition(id, "AWAITING_PAYMENT", "EXPIRED", null, "Hết hạn thanh toán", null);
                verifyToCustomer(7, "Đơn hàng đã hết hạn", id);
            }
        }

        @Test
        @DisplayName("UTC-ORD-051: không có đơn quá hạn")
        void ord051() {
            when(orders.expiredUnpaid()).thenReturn(List.of());

            assertEquals(0, service.expireUnpaidOrders());

            verify(orders, never()).transition(anyInt(), anyString(), anyString(), any(), any(), any());
            verifyNoInteractions(notifications);
        }
    }

    @Nested
    @DisplayName("autoCompleteDelivered()")
    class AutoCompleteTests {
        @Test
        @DisplayName("UTC-ORD-052: 2 đơn đã giao quá 7 ngày tự hoàn tất")
        void ord052() {
            when(orders.deliveredLongAgo(7)).thenReturn(List.of(new Due(201, 7, "ORD-201"), new Due(202, 7, "ORD-202")));
            when(orders.transition(anyInt(), eq("DELIVERED"), eq("COMPLETED"), isNull(), isNull(), isNull())).thenReturn(true);

            assertEquals(2, service.autoCompleteDelivered());

            for (int id : List.of(201, 202)) {
                verify(orders).transition(id, "DELIVERED", "COMPLETED", null, null, null);
                verify(notifications).toUser(eq(7), anyString(), eq("Đơn hàng hoàn tất"),
                        contains("sau 7 ngày"), anyString(), eq(id));
            }
        }

        @Test
        @DisplayName("UTC-ORD-053: đơn mới giao 6 ngày chưa bị tự hoàn tất")
        void ord053() {
            // deliveredLongAgo(7) chỉ trả đơn đã giao đủ 7 ngày; đơn 6 ngày không có trong danh sách
            when(orders.deliveredLongAgo(7)).thenReturn(List.of());

            assertEquals(0, service.autoCompleteDelivered());

            verify(orders).deliveredLongAgo(7);
            verify(orders, never()).transition(anyInt(), anyString(), anyString(), any(), any(), any());
        }
    }
}
