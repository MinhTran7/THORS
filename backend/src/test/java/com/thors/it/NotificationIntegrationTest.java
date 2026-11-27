package com.thors.it;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.thors.module.account.entity.Account;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

/**
 * Integration test tab "Notification" (IT-NTF-01..11) của Report-5.2_Integration Test: CheckoutService /
 * PromotionService phát sinh sự kiện → NotificationPublisher, PromotionNotifier, NotificationMuteSchema → bảng
 * notification, user_notification, notification_mute; NotificationController ↔ NotificationService.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(locations = "classpath:it-notification-chat.properties")
@Import(H2MysqlShim.class)
class NotificationIntegrationTest extends ItSupport {

    Account customer;
    Account owner;
    Account family;
    Account lockedFamily;
    int detailId;

    @BeforeEach
    void seed() {
        cleanAll();
        customer = account("CUSTOMER", "Khách A", "customer@example.com", "ACTIVE");
        owner = account("OWNER", "Chủ shop", "owner@example.com", "ACTIVE");
        family = account("FAMILY_MEMBER", "Người nhà", "family@example.com", "ACTIVE");
        lockedFamily = account("FAMILY_MEMBER", "Người nhà bị khóa", "locked@example.com", "LOCKED");
        int cat = category("Áo", null);
        int p = product(cat, "Áo thun basic", "Áo thun cotton");
        detailId = variant(p, "M", "Trắng", 200_000, 10);
    }

    // ------------------------------------------------------------------ Hàm phụ

    /** Giỏ hàng của khách có 1 sản phẩm; trả cart_item_id. */
    int cartItem(Account a) {
        db.update("INSERT INTO cart (user_id) VALUES (?)", a.id());
        int cartId = db.queryForObject("SELECT cart_id FROM cart WHERE user_id = ?", Integer.class, a.id());
        db.update("INSERT INTO cart_item (cart_id, detail_id, quantity) VALUES (?, ?, 1)", cartId, detailId);
        return db.queryForObject("SELECT MAX(cart_item_id) FROM cart_item", Integer.class);
    }

    MockHttpServletResponse checkout(MockHttpSession s, int cartItemId, String paymentMethod) throws Exception {
        Map<String, Object> address = Map.of(
                "recipientName", "Khách A", "phone", "0912345678", "provinceName", "Hà Nội",
                "wardName", "Phường Láng", "addressDetail", "12 Láng Hạ");
        Map<String, Object> body = new HashMap<>();
        body.put("shippingAddress", address);
        body.put("paymentMethod", paymentMethod);
        body.put("cartItemIds", List.of(cartItemId));
        return send(post("/api/checkout"), s, body);
    }

    JsonNode notifications(MockHttpSession s) throws Exception {
        var r = get("/api/notifications?page=0&size=10", s);
        assertEquals(200, r.getStatus());
        return body(r);
    }

    static List<JsonNode> itemsAbout(JsonNode page, String entityType, int entityId) {
        List<JsonNode> out = new ArrayList<>();
        for (JsonNode n : page.path("items"))
            if (entityType.equals(n.path("relatedEntityType").asText()) && n.path("relatedEntityId").asInt() == entityId)
                out.add(n);
        return out;
    }

    Map<String, Object> promotion(String name, LocalDateTime start, LocalDateTime end) {
        Map<String, Object> body = new HashMap<>();
        body.put("type", "PRODUCT_DISCOUNT");
        body.put("name", name);
        body.put("description", "Giảm giá cuối tuần");
        body.put("discountType", "PERCENT");
        body.put("discountValue", 10);
        body.put("startDate", start.toString());
        body.put("endDate", end.toString());
        body.put("applyScope", "ALL");
        return body;
    }

    int insertNotification(Account a, String type, boolean read) {
        db.update("INSERT INTO notification (title, message, type, created_at) VALUES ('T', 'M', ?, NOW())", type);
        int id = db.queryForObject("SELECT MAX(notification_id) FROM notification", Integer.class);
        db.update("INSERT INTO user_notification (user_id, notification_id, is_read, read_at) VALUES (?, ?, ?, ?)",
                a.id(), id, read ? 1 : 0, read ? LocalDateTime.now() : null);
        return db.queryForObject("SELECT user_notification_id FROM user_notification WHERE notification_id = ?", Integer.class, id);
    }

    // ------------------------------------------------------------------ Thông báo phát sinh từ đơn hàng và khuyến mãi

    @Test
    @DisplayName("IT-NTF-01: Đặt đơn COD báo cho khách, Owner và Family Member")
    void codOrderNotifiesCustomerOwnerAndFamily() throws Exception {
        var s = login(customer);
        var r = checkout(s, cartItem(customer), "COD");
        assertEquals(201, r.getStatus(), r.getContentAsString());
        int orderId = body(r).path("id").asInt();
        assertEquals("PENDING_CONFIRMATION",
                db.queryForObject("SELECT order_status FROM orders WHERE order_id = ?", String.class, orderId));

        var mine = itemsAbout(notifications(s), "ORDER", orderId);
        assertEquals(1, mine.size(), "Customer có thông báo gắn ORDER/{id}");
        assertEquals("ORDER_STATUS", mine.get(0).path("type").asText());

        for (Account store : List.of(owner, family)) {
            var page = notifications(login(store));
            var about = itemsAbout(page, "ORDER", orderId);
            assertEquals(1, about.size(), store.role() + " có thông báo đơn hàng mới");
            assertEquals("ORDER_STATUS", about.get(0).path("type").asText());
        }
        assertEquals(0, count("SELECT COUNT(*) FROM user_notification WHERE user_id = ?", lockedFamily.id()),
                "Tài khoản nội bộ bị khóa không có dòng user_notification");
        // Bảng notification: 1 dòng cho khách + 1 dòng cho mỗi vai trò cửa hàng (OWNER, FAMILY_MEMBER)
        assertTrue(count("SELECT COUNT(*) FROM notification WHERE type = 'ORDER_STATUS' AND related_entity_type = 'ORDER'"
                + " AND related_entity_id = ?", orderId) >= 2);
    }

    @Test
    @DisplayName("IT-NTF-02: Đặt đơn thanh toán online chỉ báo khách, chưa báo cửa hàng")
    void onlineOrderNotifiesOnlyCustomer() throws Exception {
        var s = login(customer);
        var r = checkout(s, cartItem(customer), "ONLINE");
        assertEquals(201, r.getStatus(), r.getContentAsString());
        int orderId = body(r).path("id").asInt();
        assertNotEquals("PENDING_CONFIRMATION",
                db.queryForObject("SELECT order_status FROM orders WHERE order_id = ?", String.class, orderId));

        var mine = itemsAbout(notifications(s), "ORDER", orderId);
        assertEquals(1, mine.size());
        assertEquals("ORDER_STATUS", mine.get(0).path("type").asText());
        for (Account store : List.of(owner, family)) {
            assertTrue(itemsAbout(notifications(login(store)), "ORDER", orderId).isEmpty(),
                    store.role() + " không có thông báo đơn mới cho đơn này");
        }
    }

    @Test
    @DisplayName("IT-NTF-03: Tạo khuyến mãi báo cho khách, bỏ qua khách đã tắt")
    void promotionNotifiesCustomersExceptMuted() throws Exception {
        Account customerB = account("CUSTOMER", "Khách B", "customer-b@example.com", "ACTIVE");
        // Bước 1: Customer B tắt công tắc Thông báo khuyến mãi
        var muted = send(put("/api/notifications/preferences"), login(customerB), Map.of("promotion", false));
        assertEquals(200, muted.getStatus(), muted.getContentAsString());

        // Bước 2: Owner lưu khuyến mãi
        LocalDateTime start = LocalDateTime.now().plusHours(1).truncatedTo(ChronoUnit.MINUTES);
        LocalDateTime end = start.plusDays(3);
        var created = send(post("/api/promotions"), login(owner), promotion("Sale cuối tuần", start, end));
        assertEquals(201, created.getStatus(), created.getContentAsString());

        // Bước 3
        var promoA = new ArrayList<JsonNode>();
        for (JsonNode n : notifications(login(customer)).path("items"))
            if ("PROMOTION".equals(n.path("type").asText())) promoA.add(n);
        assertEquals(1, promoA.size(), "Customer A có thông báo PROMOTION");
        String message = promoA.get(0).path("message").asText();
        DateTimeFormatter f = DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy");
        assertTrue(message.contains("10%"), "Nội dung có mức giảm: " + message);
        assertTrue(message.contains(f.format(end)), "Nội dung có thời gian áp dụng: " + message);

        int notificationId = promoA.get(0).path("notificationId").asInt();
        assertEquals(0, count("SELECT COUNT(*) FROM user_notification WHERE user_id = ? AND notification_id = ?",
                customerB.id(), notificationId), "Customer B không có dòng user_notification cho thông báo này");
    }

    @Test
    @DisplayName("IT-NTF-04: Khuyến mãi tạo thất bại không sinh thông báo")
    void invalidPromotionCreatesNothing() throws Exception {
        LocalDateTime start = LocalDateTime.now().plusDays(2).truncatedTo(ChronoUnit.MINUTES);
        var r = send(post("/api/promotions"), login(owner), promotion("Sai ngày", start, start.minusDays(1)));
        assertEquals(400, r.getStatus(), r.getContentAsString());
        assertEquals(0, count("SELECT COUNT(*) FROM promotion"), "Không có dòng promotion mới");
        assertEquals(0, count("SELECT COUNT(*) FROM notification WHERE type = 'PROMOTION'"), "Không có thông báo PROMOTION mới");
    }

    // ------------------------------------------------------------------ Xem và đọc thông báo

    @Test
    @DisplayName("IT-NTF-05: Đếm chưa đọc, phân trang và giới hạn kích thước trang")
    void unreadCountPagingAndSizeLimit() throws Exception {
        for (int i = 0; i < 55; i++) insertNotification(customer, "ORDER_STATUS", false);
        for (int i = 0; i < 5; i++) insertNotification(customer, "ORDER_STATUS", true);
        insertNotification(owner, "ORDER_STATUS", false); // của người khác, không được tính
        var s = login(customer);

        var count = get("/api/notifications/unread-count", s);
        assertEquals(200, count.getStatus());
        int unreadRows = count("SELECT COUNT(*) FROM user_notification WHERE user_id = ? AND is_read = 0", customer.id());
        assertEquals(unreadRows, body(count).path("count").asInt());

        var page = get("/api/notifications?unreadOnly=true&page=0&size=500", s);
        assertEquals(200, page.getStatus());
        JsonNode p = body(page);
        assertEquals(50, p.path("size").asInt());
        assertEquals((int) Math.ceil(unreadRows / 50.0), p.path("totalPages").asInt());
        assertEquals(50, p.path("items").size());
        for (JsonNode n : p.path("items")) assertFalse(n.path("read").asBoolean(), "Chỉ gồm thông báo chưa đọc");
    }

    @Test
    @DisplayName("IT-NTF-06: Đánh dấu tất cả đã đọc")
    void markAllRead() throws Exception {
        insertNotification(customer, "ORDER_STATUS", false);
        insertNotification(customer, "PROMOTION", false);
        insertNotification(customer, "PROMOTION", false);
        var s = login(customer);
        var r = send(post("/api/notifications/read-all"), s, null);
        assertEquals(200, r.getStatus());
        assertEquals(3, body(r).path("updated").asInt());
        assertEquals(0, body(get("/api/notifications/unread-count", s)).path("count").asInt());
    }

    @Test
    @DisplayName("IT-NTF-07: Bấm thông báo gắn đơn hàng: đánh dấu đã đọc và mở chi tiết đơn")
    void clickOrderNotificationMarksRead() throws Exception {
        var s = login(customer);
        var order = checkout(s, cartItem(customer), "COD"); // tiền điều kiện: như IT-NTF-01
        assertEquals(201, order.getStatus(), order.getContentAsString());
        int orderId = body(order).path("id").asInt();
        JsonNode n = itemsAbout(notifications(s), "ORDER", orderId).get(0);
        assertFalse(n.path("read").asBoolean());
        int before = body(get("/api/notifications/unread-count", s)).path("count").asInt();

        var r = send(patch("/api/notifications/" + n.path("id").asInt() + "/read"), s, null);
        assertEquals(200, r.getStatus());
        Map<String, Object> row = db.queryForMap(
                "SELECT is_read, read_at FROM user_notification WHERE user_notification_id = ?", n.path("id").asInt());
        assertEquals(1, ((Number) row.get("is_read")).intValue());
        assertNotNull(row.get("read_at"));
        assertEquals(before - 1, body(get("/api/notifications/unread-count", s)).path("count").asInt());
        // Mở chi tiết đơn: thông báo gắn ORDER/{id} để giao diện mở trang đơn hàng
        assertEquals("ORDER", n.path("relatedEntityType").asText());
        assertEquals(orderId, n.path("relatedEntityId").asInt());
    }

    @Test
    @DisplayName("IT-NTF-08: Bấm thông báo không gắn thực thể: mở trang chi tiết thông báo")
    void promotionNotificationDetailPage() throws Exception {
        // Tiền điều kiện như IT-NTF-03: Customer có thông báo khuyến mãi
        LocalDateTime start = LocalDateTime.now().plusHours(2).truncatedTo(ChronoUnit.MINUTES);
        assertEquals(201, send(post("/api/promotions"), login(owner), promotion("Sale", start, start.plusDays(1))).getStatus());
        var s = login(customer);
        JsonNode item = null;
        for (JsonNode n : notifications(s).path("items")) if ("PROMOTION".equals(n.path("type").asText())) item = n;
        assertNotNull(item, "Customer có thông báo khuyến mãi");
        int id = item.path("id").asInt();

        // Trang /notifications/{id}: GET chi tiết rồi đánh dấu đã đọc (NotificationDetailPage.jsx)
        var detail = get("/api/notifications/" + id, s);
        assertEquals(200, detail.getStatus());
        JsonNode d = body(detail);
        assertFalse(d.path("title").asText().isBlank());
        assertFalse(d.path("message").asText().isBlank());
        assertFalse(d.path("createdAt").isNull() || d.path("createdAt").isMissingNode());
        assertEquals(200, send(patch("/api/notifications/" + id + "/read"), s, null).getStatus());
        assertEquals(1, count("SELECT is_read FROM user_notification WHERE user_notification_id = ?", id));
        assertTrue(body(get("/api/notifications/" + id, s)).path("read").asBoolean());
    }

    @Test
    @DisplayName("IT-NTF-09: Không đọc được thông báo của người khác")
    void cannotReadSomeoneElsesNotification() throws Exception {
        int ofA = insertNotification(customer, "ORDER_STATUS", false);
        Account b = account("CUSTOMER", "Khách B", "customer-b@example.com", "ACTIVE");
        var s = login(b);

        var detail = get("/api/notifications/" + ofA, s);
        assertEquals(404, detail.getStatus());
        assertEquals("NOTIFICATION_NOT_FOUND", body(detail).path("code").asText());
        var read = send(patch("/api/notifications/" + ofA + "/read"), s, null);
        assertEquals(404, read.getStatus());
        assertEquals("NOTIFICATION_NOT_FOUND", body(read).path("code").asText());

        Map<String, Object> row = db.queryForMap("SELECT is_read, read_at FROM user_notification WHERE user_notification_id = ?", ofA);
        assertEquals(0, ((Number) row.get("is_read")).intValue());
        assertNull(row.get("read_at"));
    }

    // ------------------------------------------------------------------ Cài đặt nhận thông báo và bảo vệ API

    @Test
    @DisplayName("IT-NTF-10: Bật / tắt nhận thông báo khuyến mãi")
    void togglePromotionNotifications() throws Exception {
        var s = login(customer);
        var off = send(put("/api/notifications/preferences"), s, Map.of("promotion", false));
        assertEquals(200, off.getStatus(), off.getContentAsString());
        assertFalse(body(off).path("promotion").asBoolean());
        assertEquals(1, count("SELECT COUNT(*) FROM notification_mute WHERE user_id = ? AND type = 'PROMOTION'", customer.id()));

        // Bước 2: tải lại trang -> công tắc vẫn tắt
        var reload = get("/api/notifications/preferences", s);
        assertEquals(200, reload.getStatus());
        assertFalse(body(reload).path("promotion").asBoolean());

        // Bước 3: gạt bật lại
        var on = send(put("/api/notifications/preferences"), s, Map.of("promotion", true));
        assertEquals(200, on.getStatus());
        assertTrue(body(on).path("promotion").asBoolean());
        assertEquals(0, count("SELECT COUNT(*) FROM notification_mute WHERE user_id = ? AND type = 'PROMOTION'", customer.id()));
    }

    @Test
    @DisplayName("IT-NTF-11: Chưa đăng nhập không gọi được API thông báo")
    void anonymousGets401() throws Exception {
        var r = get("/api/notifications", null);
        assertEquals(401, r.getStatus());
        JsonNode b = body(r);
        assertEquals("UNAUTHENTICATED", b.path("code").asText());
        assertEquals("Vui lòng đăng nhập.", b.path("message").asText());
    }
}
