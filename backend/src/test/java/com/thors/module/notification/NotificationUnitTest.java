package com.thors.module.notification;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.notification.dto.NotificationViews.Item;
import com.thors.module.notification.dto.NotificationViews.Page;
import com.thors.module.notification.dto.NotificationViews.Preferences;
import com.thors.module.notification.dto.NotificationViews.UpdatePreferences;
import com.thors.module.notification.repository.NotificationMuteSchema;
import com.thors.module.notification.repository.NotificationRepository;
import com.thors.module.notification.repository.NotificationRepository.Slice;
import com.thors.module.notification.service.NotificationPublisher;
import com.thors.module.notification.service.NotificationService;
import com.thors.module.notification.service.NotificationTypes;
import com.thors.module.order.delivery.GhnShippingService;
import com.thors.module.order.repository.OrderRepository;
import com.thors.module.order.service.OrderMailService;
import com.thors.module.order.service.OrderService;
import com.thors.module.promotion.entity.Promotion;
import com.thors.module.promotion.service.PromotionNotifier;
import com.thors.module.sales.service.InStoreSaleCompleter;
import com.thors.module.warehouse.repository.WarehouseStore;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.IntStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Unit test cho chức năng "Thông báo", viết theo sheet "Notification" của Report-5.1_Unit Test
 * (UTC-NTF-001..029). Mỗi test mang đúng mã Test Case ID trong sheet.
 */
@DisplayName("Thông báo - Unit Test")
class NotificationUnitTest {
    private static final LocalDateTime AT = LocalDateTime.of(2026, 11, 15, 9, 0);

    private static Account account(int id, String role) {
        return new Account(id, role, "User " + id, "$2a$10$hash", "user" + id + "@shop.com", null, null, null,
                "ACTIVE", AT, AT, null, 0, null);
    }

    private static ApiException api(int status, String code, Executable call) {
        ApiException e = assertThrows(ApiException.class, call);
        assertEquals(status, e.status);
        assertEquals(code, e.code);
        return e;
    }

    private static Item item(int id, boolean read) {
        return new Item(id, 1000 + id, "Tiêu đề " + id, "Nội dung " + id, NotificationTypes.ORDER_STATUS,
                null, null, read, null, AT);
    }

    private static List<Item> items(int from, int n, boolean read) {
        return IntStream.range(from, from + n).mapToObj(i -> item(i, read)).toList();
    }

    // ================================================================== notifyOrderPlaced

    @Nested
    @DisplayName("NotificationPublisher.notifyOrderPlaced(int orderId, int userId, String orderNumber, String orderStatus)")
    class NotifyOrderPlacedTests {
        private NotificationRepository repo;
        private NotificationMuteSchema muteSchema;
        private OrderRepository orders;
        private OrderService service;

        @BeforeEach
        void setUp() {
            repo = mock(NotificationRepository.class);
            muteSchema = mock(NotificationMuteSchema.class);
            orders = mock(OrderRepository.class);
            when(repo.insert(any(), any(), any(), any(), any())).thenReturn(500, 501, 502);
            // Publisher thật (repository giả) để kiểm cả insert / linkUsers / linkRole
            NotificationPublisher publisher = new NotificationPublisher(repo, muteSchema);
            service = new OrderService(orders, publisher, mock(GhnShippingService.class), mock(WarehouseStore.class),
                    mock(OrderMailService.class), mock(InStoreSaleCompleter.class));
        }

        @Test
        @DisplayName("UTC-NTF-001: Đơn COD chờ xác nhận báo khách và báo OWNER, FAMILY_MEMBER")
        void ntf001() {
            when(orders.isCustomerAccount(7)).thenReturn(true);

            service.notifyOrderPlaced(7, 100, "ORD-100", "PENDING_CONFIRMATION");

            // 1 lần cho khách + 1 lần cho mỗi vai trò OWNER, FAMILY_MEMBER
            verify(repo, times(3)).insert(eq(NotificationTypes.ORDER_STATUS), anyString(), anyString(),
                    eq(NotificationTypes.ENTITY_ORDER), eq(100));
            verify(repo).linkUsers(500, List.of(7));
            verify(repo).linkRole(501, "OWNER", null);
            verify(repo).linkRole(502, "FAMILY_MEMBER", null);
            // ORDER_STATUS không tắt được: không lọc người đã tắt
            verify(repo, never()).mutedAmong(any(), any());
            verify(muteSchema, never()).ready();
        }

        @Test
        @DisplayName("UTC-NTF-002: Đơn chờ thanh toán online chỉ báo khách, chưa báo cửa hàng")
        void ntf002() {
            when(orders.isCustomerAccount(7)).thenReturn(true);

            service.notifyOrderPlaced(7, 101, "ORD-101", "AWAITING_PAYMENT");

            verify(repo).insert(eq(NotificationTypes.ORDER_STATUS), anyString(), anyString(),
                    eq(NotificationTypes.ENTITY_ORDER), eq(101));
            verify(repo).linkUsers(500, List.of(7));
            verify(repo, never()).linkRole(anyInt(), anyString(), any());
        }

        @Test
        @DisplayName("UTC-NTF-003: Tài khoản nội bộ không nhận thông báo khách, cửa hàng vẫn được báo")
        void ntf003() {
            when(orders.isCustomerAccount(5)).thenReturn(false);

            service.notifyOrderPlaced(5, 102, "ORD-102", "PENDING_CONFIRMATION");

            verify(repo, never()).linkUsers(anyInt(), any());
            verify(repo).linkRole(500, "OWNER", null);
            verify(repo).linkRole(501, "FAMILY_MEMBER", null);
        }

        @Test
        @DisplayName("UTC-NTF-004: Khách đã tắt khuyến mãi vẫn nhận thông báo đơn hàng")
        void ntf004() {
            when(orders.isCustomerAccount(7)).thenReturn(true);
            when(muteSchema.ready()).thenReturn(true);
            when(repo.mutedAmong(eq(NotificationTypes.PROMOTION), any())).thenReturn(List.of(7));
            when(repo.isMuted(7, NotificationTypes.PROMOTION)).thenReturn(true);

            service.notifyOrderPlaced(7, 100, "ORD-100", "PENDING_CONFIRMATION");

            verify(repo).linkUsers(500, List.of(7));
            verify(repo, never()).mutedAmong(any(), any());
        }
    }

    // ================================================================== PromotionNotifier

    @Nested
    @DisplayName("PromotionNotifier.created(int promotionId, Promotion p) / afterCommit()")
    class PromotionNotifierTests {
        private NotificationPublisher publisher;
        private PromotionNotifier notifier;
        // "Sale cuối tuần", giảm 20%, 28/11–30/11/2026
        private final Promotion sale = new Promotion(15, Promotion.ORDER_VOUCHER, "Sale cuối tuần", null, "PERCENT",
                new BigDecimal("20"), new BigDecimal("200000"), null, null, 0, "ALL", List.of(),
                LocalDateTime.of(2026, 11, 28, 0, 0), LocalDateTime.of(2026, 11, 30, 23, 59), "ACTIVE");

        @BeforeEach
        void setUp() {
            publisher = mock(NotificationPublisher.class);
            notifier = new PromotionNotifier(publisher);
            TransactionSynchronizationManager.initSynchronization();
        }

        @AfterEach
        void tearDown() {
            if (TransactionSynchronizationManager.isSynchronizationActive())
                TransactionSynchronizationManager.clearSynchronization();
        }

        @Test
        @DisplayName("UTC-NTF-005: Đăng ký gửi sau commit, chưa gửi trong transaction")
        void ntf005() {
            notifier.created(15, sale);

            assertEquals(1, TransactionSynchronizationManager.getSynchronizations().size());
            verify(publisher, never()).toRole(any(), any(), any(), any(), any(), any());
        }

        @Test
        @DisplayName("UTC-NTF-006: Sau commit gửi toRole CUSTOMER kèm mức giảm, đối tượng, thời gian")
        void ntf006() {
            notifier.created(15, sale);

            TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);

            ArgumentCaptor<String> title = ArgumentCaptor.forClass(String.class);
            ArgumentCaptor<String> message = ArgumentCaptor.forClass(String.class);
            verify(publisher).toRole(eq("CUSTOMER"), eq("PROMOTION"), title.capture(), message.capture(),
                    eq("PROMOTION"), eq(15));
            assertFalse(title.getValue().isBlank());
            String m = message.getValue();
            assertTrue(m.contains("Sale cuối tuần"), m);
            assertTrue(m.contains("giảm 20%"), m);
            assertTrue(m.contains("cho đơn từ"), m);
            assertTrue(m.contains("30/11/2026"), m);
        }

        @Test
        @DisplayName("UTC-NTF-007: Transaction rollback thì không gửi thông báo")
        void ntf007() {
            notifier.created(15, sale);

            TransactionSynchronizationManager.getSynchronizations()
                    .forEach(s -> s.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));

            verify(publisher, never()).toRole(any(), any(), any(), any(), any(), any());
        }
    }

    // ================================================================== toRole / NotificationMuteSchema.ready

    @Nested
    @DisplayName("NotificationPublisher.toRole(\"CUSTOMER\", \"PROMOTION\", ...) / NotificationMuteSchema.ready()")
    class ToRoleAndSchemaTests {
        private NotificationRepository repo;
        private NotificationMuteSchema muteSchema;
        private NotificationPublisher publisher;

        @BeforeEach
        void setUp() {
            repo = mock(NotificationRepository.class);
            muteSchema = mock(NotificationMuteSchema.class);
            when(repo.insert(any(), any(), any(), any(), any())).thenReturn(99);
            publisher = new NotificationPublisher(repo, muteSchema);
        }

        @Test
        @DisplayName("UTC-NTF-008: Đã có bảng notification_mute: chỉ gắn khách chưa tắt")
        void ntf008() {
            when(muteSchema.ready()).thenReturn(true);

            publisher.toRole("CUSTOMER", "PROMOTION", "Sale cuối tuần", "Giảm 20%", "PROMOTION", 15);

            verify(repo, times(1)).insert("PROMOTION", "Sale cuối tuần", "Giảm 20%", "PROMOTION", 15);
            verify(repo).linkRole(99, "CUSTOMER", "PROMOTION");
        }

        @Test
        @DisplayName("UTC-NTF-009: Chưa có bảng notification_mute: gửi cho mọi khách ACTIVE")
        void ntf009() {
            when(muteSchema.ready()).thenReturn(false);

            publisher.toRole("CUSTOMER", "PROMOTION", "Sale cuối tuần", "Giảm 20%", "PROMOTION", 15);

            verify(repo).linkRole(99, "CUSTOMER", null);
        }

        private void setSchemaState(NotificationMuteSchema schema, boolean ready, long checkedAt) throws Exception {
            Field r = NotificationMuteSchema.class.getDeclaredField("ready");
            r.setAccessible(true);
            r.setBoolean(schema, ready);
            Field c = NotificationMuteSchema.class.getDeclaredField("checkedAt");
            c.setAccessible(true);
            c.setLong(schema, checkedAt);
        }

        @Test
        @DisplayName("UTC-NTF-010: Đã kiểm tra true cách đây 30 giây: trả true từ bộ nhớ")
        void ntf010() throws Exception {
            JdbcTemplate db = mock(JdbcTemplate.class);
            NotificationMuteSchema schema = new NotificationMuteSchema(db);
            setSchemaState(schema, true, System.currentTimeMillis() - 30_000);

            assertTrue(schema.ready());
            verifyNoInteractions(db);
        }

        @Test
        @DisplayName("UTC-NTF-011: Lần trước false cách đây 61 giây: query lại information_schema")
        void ntf011() throws Exception {
            JdbcTemplate db = mock(JdbcTemplate.class);
            when(db.queryForObject(anyString(), eq(Integer.class))).thenReturn(0);
            NotificationMuteSchema schema = new NotificationMuteSchema(db);
            setSchemaState(schema, false, System.currentTimeMillis() - 61_000);

            schema.ready();

            verify(db).queryForObject(contains("SELECT COUNT(*) FROM information_schema.tables"), eq(Integer.class));
        }
    }

    // ================================================================== unreadCount / list

    @Nested
    @DisplayName("NotificationService.unreadCount(Account actor) / list(Account actor, boolean unreadOnly, int page, int size)")
    class ListTests {
        private NotificationRepository repo;
        private NotificationService service;

        @BeforeEach
        void setUp() {
            repo = mock(NotificationRepository.class);
            service = new NotificationService(repo, mock(NotificationMuteSchema.class));
        }

        @Test
        @DisplayName("UTC-NTF-012: Đếm số thông báo chưa đọc")
        void ntf012() {
            when(repo.countUnread(7)).thenReturn(4L);

            assertEquals(4L, service.unreadCount(account(7, "CUSTOMER")));
            verify(repo).countUnread(7);
        }

        @Test
        @DisplayName("UTC-NTF-013: Trang đầu 10 thông báo, tổng 25, 3 trang")
        void ntf013() {
            when(repo.findByUser(7, false, 0, 10)).thenReturn(new Slice(items(1, 10, false), 25));

            Page p = service.list(account(7, "CUSTOMER"), false, 0, 10);

            verify(repo).findByUser(7, false, 0, 10);
            assertEquals(10, p.items().size());
            assertEquals(25, p.total());
            assertEquals(3, p.totalPages());
        }

        @Test
        @DisplayName("UTC-NTF-014: Chỉ lấy thông báo chưa đọc")
        void ntf014() {
            when(repo.findByUser(7, true, 0, 10)).thenReturn(new Slice(items(1, 4, false), 4));

            Page p = service.list(account(7, "CUSTOMER"), true, 0, 10);

            assertEquals(4, p.items().size());
            assertTrue(p.items().stream().noneMatch(Item::read));
            assertEquals(1, p.totalPages());
        }

        @Test
        @DisplayName("UTC-NTF-015: size = 500 bị giới hạn còn 50")
        void ntf015() {
            when(repo.findByUser(anyInt(), anyBoolean(), anyInt(), anyInt())).thenReturn(new Slice(items(1, 25, false), 25));

            service.list(account(7, "CUSTOMER"), false, 0, 500);

            verify(repo).findByUser(7, false, 0, 50);
        }

        @Test
        @DisplayName("UTC-NTF-016: page = -3, size = 0 được đưa về page 0, size 1")
        void ntf016() {
            when(repo.findByUser(anyInt(), anyBoolean(), anyInt(), anyInt())).thenReturn(new Slice(items(1, 1, false), 25));

            service.list(account(7, "CUSTOMER"), false, -3, 0);

            verify(repo).findByUser(7, false, 0, 1);
        }

        @Test
        @DisplayName("UTC-NTF-017: Chưa có thông báo: trang rỗng")
        void ntf017() {
            when(repo.findByUser(8, false, 0, 10)).thenReturn(new Slice(List.of(), 0));

            Page p = service.list(account(8, "CUSTOMER"), false, 0, 10);

            assertTrue(p.items().isEmpty());
            assertEquals(0, p.total());
            assertEquals(0, p.totalPages());
        }
    }

    // ================================================================== markAllRead

    @Nested
    @DisplayName("NotificationService.markAllRead(Account actor)")
    class MarkAllReadTests {
        private NotificationRepository repo;
        private NotificationService service;

        @BeforeEach
        void setUp() {
            repo = mock(NotificationRepository.class);
            service = new NotificationService(repo, mock(NotificationMuteSchema.class));
        }

        @Test
        @DisplayName("UTC-NTF-018: Đánh dấu đã đọc 4 thông báo")
        void ntf018() {
            when(repo.markAllRead(7)).thenReturn(4);

            assertEquals(4, service.markAllRead(account(7, "CUSTOMER")));
            verify(repo).markAllRead(7);
        }

        @Test
        @DisplayName("UTC-NTF-019: Đã đọc hết thì trả 0, không lỗi")
        void ntf019() {
            when(repo.markAllRead(7)).thenReturn(0);

            assertEquals(0, assertDoesNotThrow(() -> service.markAllRead(account(7, "CUSTOMER"))));
        }
    }

    // ================================================================== markRead / detail

    @Nested
    @DisplayName("NotificationService.markRead(Account actor, int id) / detail(Account actor, int id)")
    class MarkReadAndDetailTests {
        private NotificationRepository repo;
        private NotificationService service;

        @BeforeEach
        void setUp() {
            repo = mock(NotificationRepository.class);
            service = new NotificationService(repo, mock(NotificationMuteSchema.class));
        }

        @Test
        @DisplayName("UTC-NTF-020: Đánh dấu đã đọc thông báo của chính mình")
        void ntf020() {
            when(repo.exists(7, 55)).thenReturn(true);

            service.markRead(account(7, "CUSTOMER"), 55);

            verify(repo).exists(7, 55);
            verify(repo, times(1)).markRead(7, 55);
        }

        @Test
        @DisplayName("UTC-NTF-021: Thông báo của người khác: 404 NOTIFICATION_NOT_FOUND")
        void ntf021() {
            when(repo.exists(9, 55)).thenReturn(false);

            api(404, "NOTIFICATION_NOT_FOUND", () -> service.markRead(account(9, "CUSTOMER"), 55));
            verify(repo, never()).markRead(anyInt(), anyInt());
        }

        @Test
        @DisplayName("UTC-NTF-022: Xem chi tiết thông báo khuyến mãi")
        void ntf022() {
            Item promo = new Item(60, 1060, "Sale cuối tuần", "Giảm 20%", NotificationTypes.PROMOTION, null, null,
                    false, null, AT);
            when(repo.findOne(7, 60)).thenReturn(Optional.of(promo));

            Item r = service.detail(account(7, "CUSTOMER"), 60);

            verify(repo).findOne(7, 60);
            assertEquals("Sale cuối tuần", r.title());
            assertEquals("Giảm 20%", r.message());
            assertEquals(AT, r.createdAt());
        }

        @Test
        @DisplayName("UTC-NTF-023: Xem thông báo của người khác: 404 NOTIFICATION_NOT_FOUND")
        void ntf023() {
            when(repo.findOne(9, 60)).thenReturn(Optional.empty());

            api(404, "NOTIFICATION_NOT_FOUND", () -> service.detail(account(9, "CUSTOMER"), 60));
        }
    }

    // ================================================================== preferences / updatePreferences

    @Nested
    @DisplayName("NotificationService.preferences(Account actor) / updatePreferences(Account actor, UpdatePreferences r)")
    class PreferencesTests {
        private NotificationRepository repo;
        private NotificationMuteSchema muteSchema;
        private NotificationService service;
        private final Account customer = account(7, "CUSTOMER");

        @BeforeEach
        void setUp() {
            repo = mock(NotificationRepository.class);
            muteSchema = mock(NotificationMuteSchema.class);
            when(muteSchema.ready()).thenReturn(true);
            service = new NotificationService(repo, muteSchema);
        }

        @Test
        @DisplayName("UTC-NTF-024: Chưa tắt: promotion = true")
        void ntf024() {
            when(repo.isMuted(7, "PROMOTION")).thenReturn(false);

            Preferences p = service.preferences(customer);

            assertTrue(p.promotion());
        }

        @Test
        @DisplayName("UTC-NTF-025: Đã tắt: promotion = false")
        void ntf025() {
            when(repo.isMuted(7, "PROMOTION")).thenReturn(true);

            Preferences p = service.preferences(customer);

            assertFalse(p.promotion());
        }

        @Test
        @DisplayName("UTC-NTF-026: Tắt thông báo khuyến mãi")
        void ntf026() {
            when(repo.isMuted(7, "PROMOTION")).thenReturn(true);

            Preferences p = service.updatePreferences(customer, new UpdatePreferences(false));

            verify(repo).setMuted(7, "PROMOTION", true);
            assertFalse(p.promotion());
        }

        @Test
        @DisplayName("UTC-NTF-027: Bật lại thông báo khuyến mãi")
        void ntf027() {
            when(repo.isMuted(7, "PROMOTION")).thenReturn(false);

            Preferences p = service.updatePreferences(customer, new UpdatePreferences(true));

            verify(repo).setMuted(7, "PROMOTION", false);
            assertTrue(p.promotion());
        }

        @Test
        @DisplayName("UTC-NTF-028: Tắt lần nữa khi đã tắt: không lỗi trùng khóa")
        void ntf028() {
            when(repo.isMuted(7, "PROMOTION")).thenReturn(true);

            Preferences p = assertDoesNotThrow(() -> service.updatePreferences(customer, new UpdatePreferences(false)));

            verify(repo).setMuted(7, "PROMOTION", true);
            assertFalse(p.promotion());
        }

        @Test
        @DisplayName("UTC-NTF-029: Thiếu giá trị promotion: 400")
        void ntf029() {
            ApiException e = assertThrows(ApiException.class,
                    () -> service.updatePreferences(customer, new UpdatePreferences(null)));
            assertEquals(400, e.status);
            verify(repo, never()).setMuted(anyInt(), any(), anyBoolean());
        }
    }
}
