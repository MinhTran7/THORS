package com.thors.module.order;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.cloudinary.Cloudinary;
import com.cloudinary.Uploader;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.notification.service.NotificationPublisher;
import com.thors.module.notification.service.NotificationTypes;
import com.thors.module.order.delivery.GhnClient;
import com.thors.module.order.delivery.GhnClient.Area;
import com.thors.module.order.delivery.GhnClient.CreateRequest;
import com.thors.module.order.delivery.GhnClient.Created;
import com.thors.module.order.delivery.GhnClient.Tracking;
import com.thors.module.order.delivery.GhnShippingService;
import com.thors.module.order.delivery.GhnStatusService;
import com.thors.module.order.delivery.GhnStatusService.Result;
import com.thors.module.order.delivery.GhnTrackingScheduler;
import com.thors.module.order.delivery.GhnWebhookController;
import com.thors.module.order.dto.OrderViews.Detail;
import com.thors.module.order.dto.OrderViews.Shipment;
import com.thors.module.order.repository.DeliveryProofRepository;
import com.thors.module.order.repository.DeliveryProofRepository.Proof;
import com.thors.module.order.repository.OrderRepository;
import com.thors.module.order.repository.OrderRepository.Found;
import com.thors.module.order.repository.OrderRepository.ShipInput;
import com.thors.module.order.repository.OrderRepository.ShipItem;
import com.thors.module.order.repository.OrderRepository.Tracked;
import com.thors.module.order.service.DeliveryProofService;
import com.thors.module.order.service.OrderMailService;
import com.thors.module.order.service.OrderService;
import com.thors.module.warehouse.repository.WarehouseStore;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.IntStream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

/**
 * Unit test cho chức năng "Cập nhật trạng thái giao hàng", viết theo sheet "Order" của Report-5.1_Unit Test
 * (UTC-ORD-001..075). Bộ test case trong sheet được lập từ 5 sequence diagram của chức năng; mỗi test mang
 * đúng mã Test Case ID trong sheet.
 */
@DisplayName("Cập nhật trạng thái giao hàng - Unit Test")
class OrderServiceUnitTest {
    private static final LocalDateTime AT = LocalDateTime.of(2026, 11, 15, 9, 0);
    private static final String PICKED_AT = "2026-11-20T03:00:00Z";

    private final Account owner = account(2, "OWNER");
    private final Account family = account(3, "FAMILY_MEMBER");
    private final Account staff = account(5, "STAFF");
    private final Account customer = account(7, "CUSTOMER");

    // ------------------------------------------------------------------ helpers

    private static Account account(int id, String role) {
        return new Account(id, role, "User " + id, "$2a$10$hash", "user" + id + "@shop.com", null, null, null,
                "ACTIVE", AT, AT, null, 0, null);
    }

    private static Detail detail(int id, String status, Shipment shipment) {
        return new Detail(id, "ORD-" + id, AT, status, null, "COD", "UNPAID", null, 200_000, null, 0, null, 0,
                30_000, 230_000, "Nguyễn Văn A", "0912345678", "12 Trần Hưng Đạo", null, null, null, null,
                shipment, null, List.of(), null, null, null);
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

    private static MultipartFile png() throws Exception {
        var out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB), "png", out);
        return new MockMultipartFile("images", "giao.png", "image/png", out.toByteArray());
    }

    private static List<MultipartFile> pngs(int n) throws Exception {
        List<MultipartFile> out = new ArrayList<>();
        for (int i = 0; i < n; i++) out.add(png());
        return out;
    }

    // ================================================================== DeliveryProofService.guardStatusChange

    @Nested
    @DisplayName("DeliveryProofService.guardStatusChange(String target)")
    class GuardStatusChangeTests {
        private DeliveryProofRepository proofs;
        private DeliveryProofService service;

        @BeforeEach
        void setUp() {
            proofs = mock(DeliveryProofRepository.class);
            service = new DeliveryProofService(proofs, mock(OrderService.class), mock(Cloudinary.class));
        }

        @Test
        @DisplayName("UTC-ORD-001: Đã bắt buộc minh chứng, chuyển sang SHIPPING thì không chặn")
        void ord001() {
            when(proofs.ready()).thenReturn(true);
            assertDoesNotThrow(() -> service.guardStatusChange("SHIPPING"));
        }

        @Test
        @DisplayName("UTC-ORD-002: Đã bắt buộc minh chứng, chuyển thẳng sang DELIVERED bị chặn")
        void ord002() {
            when(proofs.ready()).thenReturn(true);
            api(400, "DELIVERY_PROOF_REQUIRED", "Cần tải ảnh minh chứng giao hàng trước khi xác nhận đã giao.",
                    () -> service.guardStatusChange("DELIVERED"));
        }

        @Test
        @DisplayName("UTC-ORD-003: Database chưa có bảng minh chứng, DELIVERED không bị chặn")
        void ord003() {
            when(proofs.ready()).thenReturn(false);
            assertDoesNotThrow(() -> service.guardStatusChange("DELIVERED"));
        }
    }

    // ================================================================== OrderService.changeStatus

    abstract class ChangeStatusBase {
        OrderRepository orders;
        NotificationPublisher notifications;
        GhnShippingService ghnShipping;
        OrderService service;

        @BeforeEach
        void setUp() {
            orders = mock(OrderRepository.class);
            notifications = mock(NotificationPublisher.class);
            ghnShipping = mock(GhnShippingService.class);
            service = new OrderService(orders, notifications, ghnShipping, mock(WarehouseStore.class),
                    mock(OrderMailService.class), mock(com.thors.module.sales.service.InStoreSaleCompleter.class));
            when(orders.isCustomerAccount(7)).thenReturn(true);
            when(orders.storeUserIds()).thenReturn(List.of(2, 3));
            when(orders.transition(anyInt(), anyString(), anyString(), anyInt(), any(), any())).thenReturn(true);
        }

        void stored(int userId, String orderType, String status, Shipment shipment) {
            when(orders.find(eq(100), anyBoolean()))
                    .thenReturn(Optional.of(new Found(userId, orderType, detail(100, status, shipment))));
        }

        void stored(String status) {
            stored(7, "Online", status, null);
        }

        Detail ship(Account actor, String target, String carrier) {
            return service.changeStatus(actor, 100, target, null, carrier, null, null, null);
        }

        void verifyToUser(int userId, String title, String message) {
            verify(notifications).toUser(userId, NotificationTypes.ORDER_STATUS, title, message,
                    NotificationTypes.ENTITY_ORDER, 100);
        }

        void verifyToUsers(List<Integer> ids, String message) {
            verify(notifications).toUsers(ids, NotificationTypes.ORDER_STATUS, "Đơn hàng đã được xử lý", message,
                    NotificationTypes.ENTITY_ORDER, 100);
        }
    }

    @Nested
    @DisplayName("OrderService.changeStatus(...) - cửa hàng tự giao")
    class ChangeStatusSelfTests extends ChangeStatusBase {
        @Test
        @DisplayName("UTC-ORD-004: Owner chuyển đơn AWAITING_PICKUP sang SHIPPING, cửa hàng tự giao")
        void ord004() {
            stored("AWAITING_PICKUP");
            Detail result = service.changeStatus(owner, 100, "SHIPPING", null, "SELF", null, null, null);

            verify(orders, times(1)).transition(100, "AWAITING_PICKUP", "SHIPPING", 2, null, "SELF");
            verifyToUser(7, "Đơn hàng đang được giao", "Đơn ORD-100 đang được cửa hàng giao đến bạn.");
            verifyToUsers(List.of(3), "Đơn ORD-100 đã được User 2 chuyển sang đang giao.");
            assertEquals(100, result.id());
        }

        @Test
        @DisplayName("UTC-ORD-005: Family Member chuyển sang SHIPPING, chỉ báo Owner")
        void ord005() {
            stored("AWAITING_PICKUP");
            ship(family, "SHIPPING", "SELF");

            verify(orders).transition(100, "AWAITING_PICKUP", "SHIPPING", 3, null, "SELF");
            verifyToUsers(List.of(2), "Đơn ORD-100 đã được User 3 chuyển sang đang giao.");
        }

        @Test
        @DisplayName("UTC-ORD-006: Không chọn hình thức giao")
        void ord006() {
            stored("AWAITING_PICKUP");
            api(400, "CARRIER", "Vui lòng chọn hình thức giao hàng.", () -> ship(owner, "SHIPPING", null));
            verify(orders, never()).find(anyInt(), anyBoolean());
        }

        @Test
        @DisplayName("UTC-ORD-007: Hình thức giao GHTK không còn được hỗ trợ")
        void ord007() {
            stored("AWAITING_PICKUP");
            api(400, "CARRIER", "Vui lòng chọn hình thức giao hàng.", () -> ship(owner, "SHIPPING", "GHTK"));
        }

        @Test
        @DisplayName("UTC-ORD-008: Hình thức giao chỉ có khoảng trắng")
        void ord008() {
            stored("AWAITING_PICKUP");
            api(400, "CARRIER", "Vui lòng chọn hình thức giao hàng.", () -> ship(owner, "SHIPPING", "   "));
        }

        @Test
        @DisplayName("UTC-ORD-009: STAFF không được xử lý đơn online")
        void ord009() {
            stored("AWAITING_PICKUP");
            api(403, "ROLE", "Vai trò này không được xem đơn hàng online.", () -> ship(staff, "SHIPPING", "SELF"));
        }

        @Test
        @DisplayName("UTC-ORD-010: Đơn không tồn tại")
        void ord010() {
            when(orders.find(eq(999), anyBoolean())).thenReturn(Optional.empty());
            api(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng.",
                    () -> service.changeStatus(owner, 999, "SHIPPING", null, "SELF", null, null, null));
        }

        @Test
        @DisplayName("UTC-ORD-011: Đơn POS không xử lý ở luồng đơn online")
        void ord011() {
            stored(7, "POS", "AWAITING_PICKUP", null);
            api(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng.", () -> ship(owner, "SHIPPING", "SELF"));
        }

        @Test
        @DisplayName("UTC-ORD-012: Đơn chưa xác nhận không chuyển thẳng sang SHIPPING được")
        void ord012() {
            stored("PENDING_CONFIRMATION");
            api(409, "ORDER_TRANSITION", "Không thể chuyển đơn từ PENDING_CONFIRMATION sang SHIPPING.",
                    () -> ship(owner, "SHIPPING", "SELF"));
        }

        @Test
        @DisplayName("UTC-ORD-013: Đơn vừa bị người khác đổi trạng thái")
        void ord013() {
            stored("AWAITING_PICKUP");
            when(orders.transition(anyInt(), anyString(), anyString(), anyInt(), any(), any())).thenReturn(false);
            api(409, "ORDER_STATE", "Trạng thái đơn vừa thay đổi, vui lòng tải lại trang.",
                    () -> ship(owner, "SHIPPING", "SELF"));
            verifyNoInteractions(notifications);
        }

        @Test
        @DisplayName("UTC-ORD-014: Khách không được chuyển đơn sang Đang giao")
        void ord014() {
            stored("AWAITING_PICKUP");
            api(409, "ORDER_TRANSITION", "Không thể chuyển đơn từ AWAITING_PICKUP sang SHIPPING.",
                    () -> ship(customer, "SHIPPING", "SELF"));
        }

        @Test
        @DisplayName("UTC-ORD-015: Trạng thái đích không hợp lệ")
        void ord015() {
            stored("AWAITING_PICKUP");
            api(400, "ORDER_STATUS", "Trạng thái đơn hàng không hợp lệ.", () -> ship(owner, "SHIPPED", "SELF"));
        }

        @Test
        @DisplayName("UTC-ORD-016: Đơn Facebook không có tài khoản khách thì không báo khách")
        void ord016() {
            stored(5, "Online", "AWAITING_PICKUP", null);
            ship(owner, "SHIPPING", "SELF");

            verify(orders).transition(100, "AWAITING_PICKUP", "SHIPPING", 2, null, "SELF");
            verify(notifications, never()).toUser(anyInt(), anyString(), anyString(), anyString(), any(), any());
            verifyToUsers(List.of(3), "Đơn ORD-100 đã được User 2 chuyển sang đang giao.");
        }
    }

    @Nested
    @DisplayName("OrderService.changeStatus(...) - gửi GHN")
    class ChangeStatusGhnTests extends ChangeStatusBase {
        @Test
        @DisplayName("UTC-ORD-017: Owner gửi đơn cho GHN")
        void ord017() {
            stored("AWAITING_PICKUP");
            service.changeStatus(owner, 100, "SHIPPING", null, "GHN", 1200, 202, 20308);

            verify(ghnShipping, times(1)).ship(100, "AWAITING_PICKUP", 1200, 202, 20308);
            verify(orders, never()).transition(anyInt(), anyString(), anyString(), any(), any(), any());
            verifyToUser(7, "Đơn hàng đã được gửi GHN",
                    "Đơn ORD-100 đã được tạo vận đơn GHN và đang chờ GHN đến lấy hàng.");
            verifyToUsers(List.of(3), "Đơn ORD-100 đã được User 2 gửi GHN.");
        }

        @Test
        @DisplayName("UTC-ORD-018: GHN báo lỗi địa chỉ thì truyền nguyên lỗi, không gửi thông báo")
        void ord018() {
            stored("AWAITING_PICKUP");
            when(ghnShipping.ship(anyInt(), anyString(), any(), any(), any()))
                    .thenThrow(new ApiException(400, "GHN_ADDRESS", "Vui lòng chọn Tỉnh/Thành và Phường/Xã theo GHN cho địa chỉ giao."));
            api(400, "GHN_ADDRESS", "Vui lòng chọn Tỉnh/Thành và Phường/Xã theo GHN cho địa chỉ giao.",
                    () -> service.changeStatus(owner, 100, "SHIPPING", null, "GHN", 1200, 202, null));
            verifyNoInteractions(notifications);
        }

        @Test
        @DisplayName("UTC-ORD-019: Đơn đã gửi GHN không tự bấm Đã giao được")
        void ord019() {
            stored(7, "Online", "SHIPPING", new Shipment("GHN", "GHN123", "IN_TRANSIT", AT, AT, null));
            api(409, "CARRIER_MANAGED",
                    "Đơn đã gửi GHN sẽ tự chuyển trạng thái khi GHN lấy hàng và giao thành công.",
                    () -> ship(owner, "DELIVERED", null));
        }
    }

    // ================================================================== GhnShippingService.ship

    @Nested
    @DisplayName("GhnShippingService.ship(int orderId, String from, Integer weightG, Integer provinceId, Integer wardId)")
    class GhnShipTests {
        private GhnClient ghn;
        private OrderRepository orders;
        private GhnShippingService service;

        @BeforeEach
        void setUp() {
            ghn = mock(GhnClient.class);
            orders = mock(OrderRepository.class);
            service = new GhnShippingService(ghn, orders, 500);
            input("COD", "UNPAID", "0912345678");
            when(ghn.provinces()).thenReturn(List.of(new Area("202", "Hồ Chí Minh", List.of())));
            when(ghn.wards(202)).thenReturn(List.of(new Area("20308", "Phường Bến Thành", List.of())));
            when(orders.shipItems(100)).thenReturn(List.of(new ShipItem("Áo thun", "SP01", 2, 100_000)));
            when(ghn.create(any())).thenReturn(new Created("GHN123", 35_000, null));
            when(ghn.serviceTypeId()).thenReturn(2);
            when(orders.shipWithCarrier(anyInt(), anyString(), anyString(), anyString(), anyString(), anyLong(),
                    anyLong(), anyInt(), anyString(), anyString())).thenReturn(true);
        }

        private void input(String method, String paymentStatus, String phone) {
            when(orders.findShipInput(100)).thenReturn(Optional.of(new ShipInput("ORD-100", "Nguyễn Văn A", phone,
                    "12 Trần Hưng Đạo", method, paymentStatus, 230_000, null)));
        }

        private CreateRequest sent() {
            var captor = ArgumentCaptor.forClass(CreateRequest.class);
            verify(ghn).create(captor.capture());
            return captor.getValue();
        }

        @Test
        @DisplayName("UTC-ORD-020: Tạo vận đơn GHN thành công cho đơn COD")
        void ord020() {
            Created created = service.ship(100, "AWAITING_PICKUP", 1200, 202, 20308);

            assertEquals("GHN123", created.orderCode());
            assertEquals(35_000, created.totalFee());
            CreateRequest r = sent();
            assertEquals(230_000, r.codAmount());
            assertEquals(1200, r.weightG());
            assertEquals("Hồ Chí Minh", r.toProvinceName());
            assertEquals("Phường Bến Thành", r.toWardName());
            assertEquals(600, r.items().get(0).weightG());
            verify(orders).shipWithCarrier(100, "AWAITING_PICKUP", "GHN", "GHN123", "2", 35_000, 230_000, 1200,
                    "Hồ Chí Minh", "Phường Bến Thành");
        }

        @Test
        @DisplayName("UTC-ORD-021: Không nhập cân nặng thì dùng cân nặng mặc định 500 g")
        void ord021() {
            service.ship(100, "AWAITING_PICKUP", null, 202, 20308);
            assertEquals(500, sent().weightG());
        }

        @Test
        @DisplayName("UTC-ORD-022: Đơn đã thanh toán online thì không thu hộ")
        void ord022() {
            input("ONLINE", "PAID", "0912345678");
            service.ship(100, "AWAITING_PICKUP", 1200, 202, 20308);
            assertEquals(0, sent().codAmount());
        }

        @Test
        @DisplayName("UTC-ORD-023: Không tìm thấy thông tin giao của đơn")
        void ord023() {
            when(orders.findShipInput(100)).thenReturn(Optional.empty());
            api(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng.",
                    () -> service.ship(100, "AWAITING_PICKUP", 1200, 202, 20308));
        }

        @Test
        @DisplayName("UTC-ORD-024: Thiếu số điện thoại người nhận")
        void ord024() {
            input("COD", "UNPAID", "");
            api(400, "GHN_ADDRESS", "Đơn thiếu tên, số điện thoại hoặc địa chỉ người nhận.",
                    () -> service.ship(100, "AWAITING_PICKUP", 1200, 202, 20308));
        }

        @Test
        @DisplayName("UTC-ORD-025: Chưa chọn Tỉnh/Thành")
        void ord025() {
            api(400, "GHN_ADDRESS", "Vui lòng chọn Tỉnh/Thành và Phường/Xã theo GHN cho địa chỉ giao.",
                    () -> service.ship(100, "AWAITING_PICKUP", 1200, null, 20308));
        }

        @Test
        @DisplayName("UTC-ORD-026: Tỉnh/Thành không có trong danh mục GHN")
        void ord026() {
            when(ghn.wards(999)).thenReturn(List.of());
            api(400, "GHN_ADDRESS", "Tỉnh/Thành không có trong danh mục GHN.",
                    () -> service.ship(100, "AWAITING_PICKUP", 1200, 999, 20308));
        }

        @Test
        @DisplayName("UTC-ORD-027: Phường/Xã không thuộc Tỉnh/Thành đã chọn")
        void ord027() {
            api(400, "GHN_ADDRESS", "Phường/Xã không thuộc Tỉnh/Thành đã chọn.",
                    () -> service.ship(100, "AWAITING_PICKUP", 1200, 202, 11111));
        }

        @Test
        @DisplayName("UTC-ORD-028: Cân nặng bằng giới hạn trên 50000 g")
        void ord028() {
            service.ship(100, "AWAITING_PICKUP", 50_000, 202, 20308);
            assertEquals(50_000, sent().weightG());
        }

        @Test
        @DisplayName("UTC-ORD-029: Cân nặng vượt 50000 g")
        void ord029() {
            api(400, "GHN_WEIGHT", "Cân nặng phải từ 1 đến 50000 gram.",
                    () -> service.ship(100, "AWAITING_PICKUP", 50_001, 202, 20308));
            verify(ghn, never()).create(any());
        }

        @Test
        @DisplayName("UTC-ORD-030: Cân nặng bằng 0")
        void ord030() {
            api(400, "GHN_WEIGHT", "Cân nặng phải từ 1 đến 50000 gram.",
                    () -> service.ship(100, "AWAITING_PICKUP", 0, 202, 20308));
        }

        @Test
        @DisplayName("UTC-ORD-031: Đơn không có sản phẩm")
        void ord031() {
            when(orders.shipItems(100)).thenReturn(List.of());
            api(400, "GHN_ITEMS", "Đơn không có sản phẩm nào.",
                    () -> service.ship(100, "AWAITING_PICKUP", 1200, 202, 20308));
        }

        @Test
        @DisplayName("UTC-ORD-032: Không lưu được vận đơn thì hủy vận đơn vừa tạo trên GHN")
        void ord032() {
            when(orders.shipWithCarrier(anyInt(), anyString(), anyString(), anyString(), anyString(), anyLong(),
                    anyLong(), anyInt(), anyString(), anyString())).thenReturn(false);
            api(409, "ORDER_STATE", "Đơn vừa thay đổi hoặc đã có vận đơn, vui lòng tải lại trang.",
                    () -> service.ship(100, "AWAITING_PICKUP", 1200, 202, 20308));
            verify(ghn).cancel("GHN123");
        }
    }

    // ================================================================== DeliveryProofService

    abstract class ProofBase {
        static final int ORDER = 42;
        DeliveryProofRepository proofs;
        OrderService orders;
        Uploader uploader;
        DeliveryProofService service;
        final Detail delivered = detail(ORDER, "DELIVERED", null);
        final Proof proof = new Proof(List.of("https://x"), null, AT, "User 2");
        int uploads;

        @BeforeEach
        void setUp() throws Exception {
            proofs = mock(DeliveryProofRepository.class);
            orders = mock(OrderService.class);
            uploader = mock(Uploader.class);
            Cloudinary cloudinary = mock(Cloudinary.class);
            when(cloudinary.uploader()).thenReturn(uploader);
            when(uploader.upload(any(), anyMap())).thenAnswer(inv -> Map.of("secure_url",
                    "https://res.cloudinary.com/demo/image/upload/v1/thors/delivery-proofs/o42_" + (++uploads) + ".jpg"));
            service = new DeliveryProofService(proofs, orders, cloudinary);
            when(proofs.ready()).thenReturn(true);
            when(proofs.find(ORDER)).thenReturn(Optional.of(proof));
            order("SHIPPING", null);
            when(orders.changeStatus(any(), eq(ORDER), eq("DELIVERED"), any(), any(), any(), any(), any()))
                    .thenReturn(delivered);
        }

        void order(String status, String carrier) {
            Shipment shipment = carrier == null ? null : new Shipment(carrier, "GHN123", null, null, null, null);
            when(orders.detail(any(), eq(ORDER))).thenReturn(detail(ORDER, status, shipment));
        }

        static String url(int n) {
            return "https://res.cloudinary.com/demo/image/upload/v1/thors/delivery-proofs/o42_" + n + ".jpg";
        }
    }

    @Nested
    @DisplayName("DeliveryProofService.required()")
    class RequiredTests extends ProofBase {
        @Test
        @DisplayName("UTC-ORD-033: Bảng minh chứng đã có thì bắt buộc ảnh")
        void ord033() {
            assertTrue(service.required());
        }

        @Test
        @DisplayName("UTC-ORD-034: Chưa có bảng minh chứng thì không bắt buộc")
        void ord034() {
            when(proofs.ready()).thenReturn(false);
            assertFalse(service.required());
        }
    }

    @Nested
    @DisplayName("DeliveryProofService.confirmDelivered(Account actor, int orderId, List<MultipartFile> images, String note)")
    class ConfirmDeliveredTests extends ProofBase {
        @Test
        @DisplayName("UTC-ORD-035: Xác nhận đã giao kèm 1 ảnh và ghi chú")
        void ord035() throws Exception {
            Map<String, Object> result = service.confirmDelivered(owner, ORDER, List.of(png()), "Giao tận tay");

            verify(uploader, times(1)).upload(any(), argThat(m -> "thors/delivery-proofs".equals(m.get("folder"))));
            verify(orders).changeStatus(owner, ORDER, "DELIVERED", null, null, null, null, null);
            verify(proofs).insert(ORDER, List.of(url(1)), "Giao tận tay", 2);
            assertSame(delivered, result.get("order"));
            assertSame(proof, result.get("proof"));
        }

        @Test
        @DisplayName("UTC-ORD-036: Tải lên đúng 3 ảnh (tối đa)")
        void ord036() throws Exception {
            service.confirmDelivered(owner, ORDER, pngs(3), null);
            verify(uploader, times(3)).upload(any(), anyMap());
            verify(proofs).insert(ORDER, List.of(url(1), url(2), url(3)), null, 2);
        }

        @Test
        @DisplayName("UTC-ORD-037: Tải lên 4 ảnh")
        void ord037() throws Exception {
            List<MultipartFile> four = pngs(4);
            api(400, "DELIVERY_PROOF_COUNT", "Tối đa 3 ảnh minh chứng.",
                    () -> service.confirmDelivered(owner, ORDER, four, null));
            verify(uploader, never()).upload(any(), anyMap());
        }

        @Test
        @DisplayName("UTC-ORD-038: Không có ảnh nào")
        void ord038() {
            api(400, "DELIVERY_PROOF_REQUIRED", "Vui lòng chụp ít nhất 1 ảnh lúc giao hàng.",
                    () -> service.confirmDelivered(owner, ORDER, List.of(), null));
        }

        @Test
        @DisplayName("UTC-ORD-039: File đặt tên .png nhưng không phải ảnh")
        void ord039() {
            var fake = new MockMultipartFile("images", "giao.png", "image/png", "khong phai anh".getBytes());
            api(400, "DELIVERY_PROOF_INVALID", "Chỉ nhận ảnh JPG hoặc PNG hợp lệ.",
                    () -> service.confirmDelivered(owner, ORDER, List.of(fake), null));
        }

        @Test
        @DisplayName("UTC-ORD-040: Ảnh lớn hơn 5 MB một byte")
        void ord040() {
            var big = new MockMultipartFile("images", "giao.png", "image/png", new byte[5 * 1024 * 1024 + 1]);
            api(400, "DELIVERY_PROOF_SIZE", "Mỗi ảnh tối đa 5 MB.",
                    () -> service.confirmDelivered(owner, ORDER, List.of(big), null));
        }

        @Test
        @DisplayName("UTC-ORD-041: Khách không được xác nhận đã giao")
        void ord041() throws Exception {
            List<MultipartFile> one = List.of(png());
            api(403, "ROLE", "Chỉ chủ shop và người nhà được xử lý đơn hàng online.",
                    () -> service.confirmDelivered(customer, ORDER, one, null));
        }

        @Test
        @DisplayName("UTC-ORD-042: Database chưa có bảng minh chứng")
        void ord042() throws Exception {
            when(proofs.ready()).thenReturn(false);
            List<MultipartFile> one = List.of(png());
            api(409, "DELIVERY_PROOF_UNAVAILABLE",
                    "Database chưa chạy migration 2026-11-13_order_delivery_proof.sql nên chưa lưu được ảnh minh chứng.",
                    () -> service.confirmDelivered(owner, ORDER, one, null));
            verify(uploader, never()).upload(any(), anyMap());
        }

        @Test
        @DisplayName("UTC-ORD-043: Đơn chưa ở trạng thái Đang giao")
        void ord043() throws Exception {
            order("AWAITING_PICKUP", null);
            List<MultipartFile> one = List.of(png());
            api(409, "ORDER_TRANSITION", "Chỉ xác nhận đã giao được khi đơn đang giao.",
                    () -> service.confirmDelivered(owner, ORDER, one, null));
            verify(uploader, never()).upload(any(), anyMap());
        }

        @Test
        @DisplayName("UTC-ORD-044: Đơn đã gửi GHN")
        void ord044() throws Exception {
            order("SHIPPING", "GHN");
            List<MultipartFile> one = List.of(png());
            api(409, "CARRIER_MANAGED", "Đơn đã gửi GHN sẽ tự chuyển trạng thái khi GHN giao thành công.",
                    () -> service.confirmDelivered(owner, ORDER, one, null));
        }

        @Test
        @DisplayName("UTC-ORD-045: Ghi chú dài 256 ký tự")
        void ord045() throws Exception {
            List<MultipartFile> one = List.of(png());
            api(400, "NOTE", "Ghi chú quá dài (tối đa 255 ký tự).",
                    () -> service.confirmDelivered(owner, ORDER, one, "a".repeat(256)));
        }

        @Test
        @DisplayName("UTC-ORD-046: Ghi chú chỉ có khoảng trắng được lưu là null")
        void ord046() throws Exception {
            service.confirmDelivered(owner, ORDER, List.of(png()), "   ");
            verify(proofs).insert(ORDER, List.of(url(1)), null, 2);
        }

        @Test
        @DisplayName("UTC-ORD-047: Đổi trạng thái lỗi thì xóa ảnh vừa tải lên")
        void ord047() throws Exception {
            when(orders.changeStatus(any(), eq(ORDER), eq("DELIVERED"), any(), any(), any(), any(), any()))
                    .thenThrow(new ApiException(409, "ORDER_STATE", "Trạng thái đơn vừa thay đổi, vui lòng tải lại trang."));
            List<MultipartFile> one = List.of(png());
            api(409, "ORDER_STATE", "Trạng thái đơn vừa thay đổi, vui lòng tải lại trang.",
                    () -> service.confirmDelivered(owner, ORDER, one, null));
            verify(uploader).destroy(eq("thors/delivery-proofs/o42_1"), anyMap());
            verify(proofs, never()).insert(anyInt(), anyList(), any(), anyInt());
        }

        @Test
        @DisplayName("UTC-ORD-048: Cloudinary không trả secure_url")
        void ord048() throws Exception {
            when(uploader.upload(any(), anyMap())).thenReturn(Map.of());
            List<MultipartFile> one = List.of(png());
            api(502, "DELIVERY_PROOF_UPLOAD", "Không tải được ảnh lên. Vui lòng thử lại.",
                    () -> service.confirmDelivered(owner, ORDER, one, null));
            verify(orders, never()).changeStatus(any(), anyInt(), anyString(), any(), any(), any(), any(), any());
        }
    }

    // ================================================================== GhnWebhookController.receive

    @Nested
    @DisplayName("GhnWebhookController.receive(String key, JsonNode body)")
    class WebhookTests {
        private final ObjectMapper json = new ObjectMapper();
        private GhnStatusService statuses;

        @BeforeEach
        void setUp() {
            statuses = mock(GhnStatusService.class);
            when(statuses.apply(anyString(), anyString(), any(), any())).thenReturn(Result.APPLIED);
        }

        /** receive() là package-private nên gọi qua reflection. */
        private ResponseEntity<?> receive(String secret, String key, String body) throws Exception {
            var controller = new GhnWebhookController(statuses, secret);
            Method m = GhnWebhookController.class.getDeclaredMethod("receive", String.class, JsonNode.class);
            m.setAccessible(true);
            try {
                return (ResponseEntity<?>) m.invoke(controller, key, body == null ? null : json.readTree(body));
            } catch (InvocationTargetException e) {
                throw (Exception) e.getCause();
            }
        }

        @Test
        @DisplayName("UTC-ORD-049: Đúng khóa bí mật, GHN báo đã lấy hàng")
        void ord049() throws Exception {
            var res = receive("secret-key", "secret-key",
                    "{\"OrderCode\":\"GHN123\",\"Status\":\"picked\",\"Time\":\"" + PICKED_AT + "\"}");
            verify(statuses).apply("GHN123", "picked", PICKED_AT, null);
            assertEquals(200, res.getStatusCode().value());
            assertEquals(Map.of("code", 200, "result", "APPLIED"), res.getBody());
        }

        @Test
        @DisplayName("UTC-ORD-050: Sai khóa bí mật")
        void ord050() throws Exception {
            var res = receive("secret-key", "sai-key", "{\"OrderCode\":\"GHN123\",\"Status\":\"picked\"}");
            assertEquals(404, res.getStatusCode().value());
            verifyNoInteractions(statuses);
        }

        @Test
        @DisplayName("UTC-ORD-051: Chưa cấu hình khóa bí mật thì webhook tắt")
        void ord051() throws Exception {
            var res = receive("", "", "{\"OrderCode\":\"GHN123\",\"Status\":\"picked\"}");
            assertEquals(404, res.getStatusCode().value());
            verifyNoInteractions(statuses);
        }

        @Test
        @DisplayName("UTC-ORD-052: Không có body")
        void ord052() throws Exception {
            var res = receive("secret-key", "secret-key", null);
            assertEquals(400, res.getStatusCode().value());
            assertEquals(Map.of("message", "Thiếu dữ liệu"), res.getBody());
        }

        @Test
        @DisplayName("UTC-ORD-053: Webhook loại khác (không có Status) được bỏ qua")
        void ord053() throws Exception {
            var res = receive("secret-key", "secret-key", "{\"Type\":\"update_weight\",\"OrderCode\":\"GHN123\"}");
            assertEquals(200, res.getStatusCode().value());
            assertEquals(Map.of("code", 200, "result", "IGNORED"), res.getBody());
            verifyNoInteractions(statuses);
        }
    }

    // ================================================================== GhnStatusService.apply

    @Nested
    @DisplayName("GhnStatusService.apply(String orderCode, String ghnStatus, String time, String reason)")
    class ApplyTests {
        private OrderRepository orders;
        private NotificationPublisher notifications;
        private GhnStatusService service;

        @BeforeEach
        void setUp() {
            orders = mock(OrderRepository.class);
            notifications = mock(NotificationPublisher.class);
            service = new GhnStatusService(orders, notifications);
            when(orders.isCustomerAccount(7)).thenReturn(true);
        }

        private void tracked(int userId, String shipmentStatus, String lastEventId, LocalDateTime updatedAt) {
            when(orders.findByTrackingForUpdate("GHN", "GHN123")).thenReturn(Optional.of(
                    new Tracked(100, userId, "ORD-100", "SHIPPING", shipmentStatus, lastEventId, updatedAt)));
        }

        private void verifyCustomer(String title) {
            verify(notifications).toUser(eq(7), eq(NotificationTypes.ORDER_STATUS), eq(title), anyString(),
                    eq(NotificationTypes.ENTITY_ORDER), eq(100));
        }

        private void verifyStore(String title) {
            for (String role : List.of("OWNER", "FAMILY_MEMBER"))
                verify(notifications).toRole(eq(role), eq(NotificationTypes.ORDER_STATUS), eq(title), anyString(),
                        eq(NotificationTypes.ENTITY_ORDER), eq(100));
        }

        private void verifyNoCustomer() {
            verify(notifications, never()).toUser(anyInt(), anyString(), anyString(), anyString(), any(), any());
        }

        @Test
        @DisplayName("UTC-ORD-054: GHN đã lấy hàng, đơn chuyển sang Đang giao")
        void ord054() {
            tracked(7, "AWAITING_PICKUP", null, null);
            assertEquals(Result.APPLIED, service.apply("GHN123", "picked", PICKED_AT, null));

            verify(orders).applyShipmentEvent(100, "IN_TRANSIT", "GHN123|picked|" + PICKED_AT,
                    LocalDateTime.of(2026, 11, 20, 3, 0), true, false);
            verify(orders).markShippingByCarrier(100);
            verifyCustomer("Đơn hàng đang được giao");
            verifyStore("GHN đã lấy hàng");
        }

        @Test
        @DisplayName("UTC-ORD-055: GHN đã giao thành công")
        void ord055() {
            tracked(7, "IN_TRANSIT", null, null);
            when(orders.markDeliveredByCarrier(100)).thenReturn(true);
            assertEquals(Result.APPLIED, service.apply("GHN123", "delivered", "2026-11-21T08:00:00Z", null));

            verify(orders).markDeliveredByCarrier(100);
            verifyCustomer("Đơn hàng đã giao");
            verifyStore("GHN đã giao đơn");
        }

        @Test
        @DisplayName("UTC-ORD-056: Vận đơn bị hủy trên GHN")
        void ord056() {
            tracked(7, "AWAITING_PICKUP", null, null);
            when(orders.markCancelledByCarrier(eq(100), anyString())).thenReturn(true);
            assertEquals(Result.APPLIED, service.apply("GHN123", "cancel", PICKED_AT, "Shop hủy"));

            verify(orders).markCancelledByCarrier(100, "Vận đơn GHN bị hủy: Shop hủy");
            verifyCustomer("Đơn hàng đã bị hủy");
            verifyStore("Vận đơn GHN đã bị hủy");
        }

        @Test
        @DisplayName("UTC-ORD-057: Trạng thái viết hoa và có khoảng trắng")
        void ord057() {
            tracked(7, "IN_TRANSIT", null, null);
            when(orders.markDeliveredByCarrier(100)).thenReturn(true);
            assertEquals(Result.APPLIED, service.apply("GHN123", "  Delivered ", "2026-11-21T08:00:00Z", null));
            verify(orders).markDeliveredByCarrier(100);
        }

        @Test
        @DisplayName("UTC-ORD-058: Trạng thái GHN không xử lý")
        void ord058() {
            assertEquals(Result.IGNORED_STATUS, service.apply("GHN123", "update_weight", null, null));
            verifyNoInteractions(orders);
        }

        @Test
        @DisplayName("UTC-ORD-059: Trạng thái null")
        void ord059() {
            assertEquals(Result.IGNORED_STATUS, service.apply("GHN123", null, null, null));
            verifyNoInteractions(orders);
        }

        @Test
        @DisplayName("UTC-ORD-060: Mã vận đơn không có trong hệ thống")
        void ord060() {
            when(orders.findByTrackingForUpdate("GHN", "GHN999")).thenReturn(Optional.empty());
            assertEquals(Result.UNKNOWN_ORDER, service.apply("GHN999", "picked", PICKED_AT, null));
            verify(orders, never()).applyShipmentEvent(anyInt(), anyString(), anyString(), any(), anyBoolean(), anyBoolean());
        }

        @Test
        @DisplayName("UTC-ORD-061: Sự kiện đã xử lý rồi")
        void ord061() {
            tracked(7, "IN_TRANSIT", "GHN123|picked|" + PICKED_AT, LocalDateTime.of(2026, 11, 20, 3, 0));
            assertEquals(Result.DUPLICATE, service.apply("GHN123", "picked", PICKED_AT, null));
            verify(orders, never()).applyShipmentEvent(anyInt(), anyString(), anyString(), any(), anyBoolean(), anyBoolean());
            verifyNoInteractions(notifications);
        }

        @Test
        @DisplayName("UTC-ORD-062: Sự kiện cũ hơn sự kiện đã ghi")
        void ord062() {
            tracked(7, "IN_TRANSIT", "GHN123|delivering|2026-11-20T05:00:00Z", LocalDateTime.of(2026, 11, 20, 5, 0));
            assertEquals(Result.STALE, service.apply("GHN123", "picked", PICKED_AT, null));
            verify(orders, never()).applyShipmentEvent(anyInt(), anyString(), anyString(), any(), anyBoolean(), anyBoolean());
        }

        @Test
        @DisplayName("UTC-ORD-063: Cùng nhóm IN_TRANSIT thì chỉ ghi sự kiện, không báo lại")
        void ord063() {
            tracked(7, "IN_TRANSIT", "GHN123|picked|" + PICKED_AT, LocalDateTime.of(2026, 11, 20, 3, 0));
            assertEquals(Result.APPLIED, service.apply("GHN123", "transporting", "2026-11-20T06:00:00Z", null));
            verify(orders).applyShipmentEvent(eq(100), eq("IN_TRANSIT"), anyString(), any(), eq(true), eq(false));
            verify(orders, never()).markShippingByCarrier(anyInt());
            verifyNoInteractions(notifications);
        }

        @Test
        @DisplayName("UTC-ORD-064: GHN giao không thành công")
        void ord064() {
            tracked(7, "IN_TRANSIT", null, null);
            assertEquals(Result.APPLIED, service.apply("GHN123", "delivery_fail", "2026-11-21T08:00:00Z", null));
            verifyCustomer("Giao hàng không thành công");
            verifyStore("GHN giao không thành công");
        }

        @Test
        @DisplayName("UTC-ORD-065: Đơn đã ở Đã giao thì không báo khách lần nữa")
        void ord065() {
            tracked(7, "IN_TRANSIT", null, null);
            when(orders.markDeliveredByCarrier(100)).thenReturn(false);
            assertEquals(Result.APPLIED, service.apply("GHN123", "delivered", "2026-11-21T08:00:00Z", null));
            verifyNoCustomer();
            verifyStore("GHN đã giao đơn");
        }

        @Test
        @DisplayName("UTC-ORD-066: Đơn Facebook không có tài khoản khách")
        void ord066() {
            tracked(5, "AWAITING_PICKUP", null, null);
            assertEquals(Result.APPLIED, service.apply("GHN123", "picked", PICKED_AT, null));
            verifyNoCustomer();
            verifyStore("GHN đã lấy hàng");
        }
    }

    // ================================================================== GhnTrackingScheduler.poll

    @Nested
    @DisplayName("GhnTrackingScheduler.poll()")
    class PollTests {
        private GhnClient ghn;
        private GhnStatusService statuses;
        private OrderRepository orders;

        @BeforeEach
        void setUp() {
            ghn = mock(GhnClient.class);
            statuses = mock(GhnStatusService.class);
            orders = mock(OrderRepository.class);
            when(ghn.isConfigured()).thenReturn(true);
            when(orders.activeTrackingNumbers("GHN")).thenReturn(List.of("GHN1", "GHN2"));
            when(ghn.detail(anyString())).thenReturn(new Tracking("picked", PICKED_AT, null));
            when(statuses.apply(anyString(), anyString(), any(), any())).thenReturn(Result.APPLIED);
        }

        private void poll(boolean enabled) {
            new GhnTrackingScheduler(ghn, statuses, orders, enabled).poll();
        }

        @Test
        @DisplayName("UTC-ORD-067: Hỏi GHN từng mã vận đơn đang giao")
        void ord067() {
            poll(true);
            verify(ghn, times(1)).detail("GHN1");
            verify(ghn, times(1)).detail("GHN2");
            verify(statuses, times(2)).apply(anyString(), eq("picked"), eq(PICKED_AT), isNull());
        }

        @Test
        @DisplayName("UTC-ORD-068: Tắt hỏi định kỳ")
        void ord068() {
            poll(false);
            verifyNoInteractions(orders);
            verify(ghn, never()).detail(anyString());
        }

        @Test
        @DisplayName("UTC-ORD-069: Chưa cấu hình GHN")
        void ord069() {
            when(ghn.isConfigured()).thenReturn(false);
            poll(true);
            verifyNoInteractions(orders);
            verify(ghn, never()).detail(anyString());
        }

        @Test
        @DisplayName("UTC-ORD-070: Một mã lỗi thì vẫn xử lý các mã còn lại")
        void ord070() {
            when(ghn.detail("GHN1")).thenThrow(new RuntimeException("timeout"));
            assertDoesNotThrow(() -> poll(true));
            verify(statuses, never()).apply(eq("GHN1"), anyString(), any(), any());
            verify(statuses).apply(eq("GHN2"), anyString(), any(), any());
        }

        @Test
        @DisplayName("UTC-ORD-071: Mỗi lần chạy hỏi tối đa 100 mã")
        void ord071() {
            List<String> codes = IntStream.rangeClosed(1, 105).mapToObj(i -> "GHN" + i).toList();
            when(orders.activeTrackingNumbers("GHN")).thenReturn(codes);
            poll(true);
            verify(ghn, times(100)).detail(anyString());
            verify(ghn, never()).detail("GHN101");
        }
    }

    // ================================================================== GHN provinces / wards

    /**
     * Sheet ghi GhnShippingService.provinces() / wards(int) nhưng code thật đặt hai hàm này ở GhnClient
     * (GhnController chỉ chuyển tiếp). Test gọi GhnClient thật, chỉ giả RestTemplate gọi HTTP.
     */
    @Nested
    @DisplayName("GhnShippingService.provinces() / GhnShippingService.wards(int provinceId)")
    class GhnAreaTests {
        private RestTemplate http;
        private GhnClient client;

        @BeforeEach
        void setUp() {
            http = mock(RestTemplate.class);
            RestTemplateBuilder builder = mock(RestTemplateBuilder.class);
            when(builder.setConnectTimeout(any())).thenReturn(builder);
            when(builder.setReadTimeout(any())).thenReturn(builder);
            when(builder.build()).thenReturn(http);
            client = new GhnClient(builder, "https://ghn.test/api", "token", "12345", 2, "CHOXEMHANGKHONGTHU",
                    20, 15, 10);
        }

        private void ghnReturns(String pathPart, String data) {
            when(http.exchange(contains(pathPart), eq(HttpMethod.GET), any(HttpEntity.class), eq(String.class)))
                    .thenReturn(ResponseEntity.ok("{\"code\":200,\"data\":" + data + "}"));
        }

        @Test
        @DisplayName("UTC-ORD-072: Lấy danh mục tỉnh/thành")
        void ord072() {
            ghnReturns("/v3/master-data/province/all",
                    "[{\"_id\":\"202\",\"name\":\"Hồ Chí Minh\",\"status\":1},"
                            + "{\"_id\":\"201\",\"name\":\"Hà Nội\",\"status\":1}]");

            List<Area> provinces = client.provinces();

            verify(http, times(1)).exchange(contains("/v3/master-data/province/all"), eq(HttpMethod.GET),
                    any(HttpEntity.class), eq(String.class));
            assertEquals(List.of("202", "201"), provinces.stream().map(Area::id).toList());
            assertEquals(List.of("Hồ Chí Minh", "Hà Nội"), provinces.stream().map(Area::name).toList());
        }

        @Test
        @DisplayName("UTC-ORD-073: Lấy danh mục phường/xã của tỉnh 202")
        void ord073() {
            ghnReturns("province_id=202",
                    "[{\"_id\":\"20308\",\"name\":\"Phường Bến Thành\",\"status\":1},"
                            + "{\"_id\":\"20309\",\"name\":\"Phường Sài Gòn\",\"status\":1}]");

            List<Area> wards = client.wards(202);

            verify(http, times(1)).exchange(contains("province_id=202"), eq(HttpMethod.GET),
                    any(HttpEntity.class), eq(String.class));
            assertEquals(List.of("20308", "20309"), wards.stream().map(Area::id).toList());
        }

        @Test
        @DisplayName("UTC-ORD-074: GHN không phản hồi")
        void ord074() {
            when(http.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(String.class)))
                    .thenThrow(new ResourceAccessException("Read timed out"));

            api(502, "GHN_UNREACHABLE", "Không kết nối được GHN, vui lòng thử lại.", () -> client.provinces());
        }

        @Test
        @DisplayName("UTC-ORD-075: Tỉnh không có phường/xã nào")
        void ord075() {
            ghnReturns("province_id=999", "[]");

            List<Area> wards = assertDoesNotThrow(() -> client.wards(999));

            assertTrue(wards.isEmpty());
        }
    }
}
