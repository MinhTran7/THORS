package com.thors.it;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.thors.module.account.entity.Account;
import com.thors.module.order.delivery.GhnClient;
import com.thors.module.order.delivery.GhnTrackingScheduler;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

/**
 * Integration test tab "Order" của Report-5.2_Integration Test (IT-ORD-01 .. IT-ORD-14): cập nhật trạng
 * thái giao hàng (cửa hàng tự giao, gửi GHN, đã giao kèm ảnh, webhook GHN, hỏi định kỳ GHN). GHN API và
 * Cloudinary là đồ giả; MySQL thay bằng H2. Mỗi test tự tạo tiền điều kiện.
 */
class OrderDeliveryIntegrationTest extends IntegrationTestBase {
    static final int PROVINCE_ID = 201;
    static final int WARD_ID = 20101;
    static final int OTHER_PROVINCE_WARD_ID = 79001;

    @Autowired GhnTrackingScheduler scheduler;

    Account owner;
    Account member;
    Account customer;
    int detailId;

    @BeforeEach
    void seedPeople() {
        owner = account("OWNER", "Chủ Shop", "owner@example.com", null, null);
        member = account("FAMILY_MEMBER", "Người Nhà", "member@example.com", null, owner.id());
        customer = account("CUSTOMER", "Khách Hàng", "customer@example.com", "0912345678", null);
        db.update("INSERT INTO product_detail(product_id, size, color, price, stock_quantity) VALUES (1, 'M', 'Đen', 150000, 10)");
        detailId = db.queryForObject("SELECT MAX(detail_id) FROM product_detail", Integer.class);
    }

    /** Đơn online của khách, 2 áo x 150.000 + ship 50.000 = 350.000. */
    int order(String number, String status, String paymentMethod, String paymentStatus) {
        db.update(
                "INSERT INTO orders(order_number, order_type, user_id, created_by, order_status, total_amount,"
                        + " items_amount, shipping_fee, payment_method, payment_status, delivery_name, delivery_phone,"
                        + " delivery_address) VALUES (?, 'Online', ?, ?, ?, 350000, 300000, 50000, ?, ?,"
                        + " 'Khách Hàng', '0912345678', '12 Lê Lợi, Phường Ba Đình, Hà Nội')",
                number,
                customer.id(),
                customer.id(),
                status,
                paymentMethod,
                paymentStatus);
        int id = db.queryForObject("SELECT order_id FROM orders WHERE order_number=?", Integer.class, number);
        db.update(
                "INSERT INTO order_item(order_id, detail_id, quantity, unit_price, product_name_snapshot, size_snapshot,"
                        + " color_snapshot) VALUES (?, ?, 2, 150000, 'Áo thun', 'M', 'Đen')",
                id,
                detailId);
        return id;
    }

    /** Đơn đã có vận đơn GHN (như sau IT-ORD-05). */
    int ghnOrder(String number, String status, String tracking, String shipmentStatus) {
        int id = order(number, status, "COD", "UNPAID");
        db.update(
                "UPDATE orders SET shipping_carrier='GHN', tracking_number=?, provider_shipment_id=?, shipment_status=?,"
                        + " carrier_shipping_fee=36500, cod_amount=350000, package_weight_g=1200,"
                        + " shipment_created_at=NOW(), shipment_updated_at=NOW() WHERE order_id=?",
                tracking,
                tracking,
                shipmentStatus,
                id);
        return id;
    }

    int selfShippingOrder(String number) {
        int id = order(number, "SHIPPING", "COD", "UNPAID");
        db.update(
                "UPDATE orders SET shipping_carrier='SELF', shipment_status='IN_TRANSIT', shipment_created_at=NOW(),"
                        + " shipment_picked_up_at=NOW(), shipment_updated_at=NOW() WHERE order_id=?",
                id);
        return id;
    }

    String orderStatus(int id) {
        return string("SELECT order_status FROM orders WHERE order_id=?", id);
    }

    int notificationCount() {
        return count("SELECT COUNT(*) FROM user_notification");
    }

    MockHttpServletResponse changeStatus(int id, MockHttpSession session, String... params) throws Exception {
        var request = post("/api/orders/" + id + "/status");
        for (int i = 0; i < params.length; i += 2) request.param(params[i], params[i + 1]);
        return send(request, session);
    }

    MockHttpServletResponse confirmDelivered(int id, MockHttpSession session, int images, String note) throws Exception {
        MockMultipartHttpServletRequestBuilder request = multipart("/api/orders/" + id + "/delivered");
        for (int i = 0; i < images; i++)
            request.file(new MockMultipartFile("images", "proof" + i + ".jpg", "image/jpeg", jpg(64 + i)));
        if (note != null) request.param("note", note);
        return send(request, session);
    }

    MockHttpServletResponse webhook(String key, Map<String, Object> body) throws Exception {
        return sendJson(post("/api/ghn/webhook/" + key), body, null);
    }

    void stubGhnCatalog() {
        when(ghn.provinces())
                .thenReturn(
                        List.of(
                                new GhnClient.Area(String.valueOf(PROVINCE_ID), "Hà Nội", List.of()),
                                new GhnClient.Area("202", "Hồ Chí Minh", List.of())));
        when(ghn.wards(PROVINCE_ID))
                .thenReturn(
                        List.of(
                                new GhnClient.Area(String.valueOf(WARD_ID), "Phường Ba Đình", List.of()),
                                new GhnClient.Area("20102", "Phường Hoàn Kiếm", List.of())));
        when(ghn.wards(202)).thenReturn(List.of(new GhnClient.Area(String.valueOf(OTHER_PROVINCE_WARD_ID), "Phường Bến Nghé", List.of())));
        when(ghn.serviceTypeId()).thenReturn(2);
    }

    // ================================================================== Cửa hàng tự giao

    @Test
    @DisplayName("IT-ORD-01: Owner chuyển đơn sang Đang giao bằng hình thức cửa hàng tự giao")
    void ownerShipsWithSelfDelivery() throws Exception {
        int id = order("ORD-IT-01", "AWAITING_PICKUP", "COD", "UNPAID");

        var r = changeStatus(id, login(owner.email()), "status", "SHIPPING", "carrier", "SELF");

        assertEquals(200, r.getStatus(), r.getContentAsString());
        assertEquals(id, body(r).get("id").asInt());
        assertEquals("SHIPPING", body(r).get("orderStatus").asText());
        assertEquals("SHIPPING", orderStatus(id));
        assertEquals("SELF", string("SELECT shipping_carrier FROM orders WHERE order_id=?", id));
        assertTrue(notificationTitles(customer.id()).contains("Đơn hàng đang được giao"));
        assertTrue(
                notificationMessages(member.id()).stream().anyMatch(m -> m.contains("Chủ Shop chuyển sang đang giao")),
                "Family Member chưa nhận thông báo: " + notificationMessages(member.id()));
        assertEquals(List.of(), notificationTitles(owner.id()), "Owner không tự nhận thông báo của mình");
    }

    @Test
    @DisplayName("IT-ORD-02: Không chuyển Đang giao khi thiếu hình thức giao hoặc sai trạng thái")
    void shippingNeedsCarrierAndRightStatus() throws Exception {
        int first = order("ORD-IT-02A", "AWAITING_PICKUP", "COD", "UNPAID");
        int second = order("ORD-IT-02B", "PENDING_CONFIRMATION", "COD", "UNPAID");
        var session = login(owner.email());

        var step1 = changeStatus(first, session, "status", "SHIPPING");
        var step2 = changeStatus(second, session, "status", "SHIPPING", "carrier", "SELF");

        assertEquals(400, step1.getStatus());
        assertEquals("CARRIER", body(step1).get("code").asText());
        assertEquals(409, step2.getStatus());
        assertEquals("ORDER_TRANSITION", body(step2).get("code").asText());
        assertEquals("AWAITING_PICKUP", orderStatus(first));
        assertEquals("PENDING_CONFIRMATION", orderStatus(second));
        assertEquals(0, notificationCount());
    }

    @Test
    @DisplayName("IT-ORD-03: Khách hàng không được chuyển đơn sang Đang giao")
    void customerCannotShip() throws Exception {
        int id = order("ORD-IT-03", "AWAITING_PICKUP", "COD", "UNPAID");

        var r = changeStatus(id, login(customer.email()), "status", "SHIPPING", "carrier", "SELF");

        assertEquals(409, r.getStatus());
        assertEquals("ORDER_TRANSITION", body(r).get("code").asText());
        assertEquals("AWAITING_PICKUP", orderStatus(id));
    }

    // ================================================================== Giao qua GHN

    @Test
    @DisplayName("IT-ORD-04: Tải danh mục Tỉnh / Phường từ GHN để chọn địa chỉ")
    void loadsGhnProvincesAndWards() throws Exception {
        stubGhnCatalog();
        var session = login(owner.email());

        var provinces = get("/api/ghn/provinces", session);
        assertEquals(200, provinces.getStatus(), provinces.getContentAsString());
        List<String> provinceNames = new ArrayList<>();
        body(provinces).forEach(p -> provinceNames.add(p.get("name").asText()));
        assertEquals(List.of("Hà Nội", "Hồ Chí Minh"), provinceNames);

        var wards = get("/api/ghn/wards?provinceId=" + PROVINCE_ID, session);
        assertEquals(200, wards.getStatus(), wards.getContentAsString());
        List<String> wardIds = new ArrayList<>();
        body(wards).forEach(w -> wardIds.add(w.get("id").asText()));
        assertEquals(List.of(String.valueOf(WARD_ID), "20102"), wardIds);
        verify(ghn).wards(PROVINCE_ID);
    }

    @Test
    @DisplayName("IT-ORD-05: Gửi đơn cho GHN tạo vận đơn và báo khách")
    void sendsOrderToGhn() throws Exception {
        stubGhnCatalog();
        when(ghn.create(any())).thenReturn(new GhnClient.Created("GHN-IT-0005", 36500, "2026-11-30T10:00:00Z"));
        int id = order("ORD-IT-05", "AWAITING_PICKUP", "COD", "UNPAID");

        var r =
                changeStatus(
                        id,
                        login(owner.email()),
                        "status", "SHIPPING",
                        "carrier", "GHN",
                        "weightG", "1200",
                        "ghnProvinceId", String.valueOf(PROVINCE_ID),
                        "ghnWardId", String.valueOf(WARD_ID));

        assertEquals(200, r.getStatus(), r.getContentAsString());
        assertEquals("GHN-IT-0005", body(r).path("shipment").path("trackingNumber").asText());
        var row = db.queryForMap("SELECT * FROM orders WHERE order_id=?", id);
        var request = ArgumentCaptor.forClass(GhnClient.CreateRequest.class);
        verify(ghn, times(1)).create(request.capture());
        assertAll(
                () -> assertEquals("GHN", row.get("shipping_carrier")),
                () -> assertEquals("GHN-IT-0005", row.get("tracking_number")),
                () -> assertEquals(36500L, ((Number) row.get("carrier_shipping_fee")).longValue()),
                () -> assertEquals(350000L, ((Number) row.get("cod_amount")).longValue(), "COD = tổng đơn"),
                () -> assertEquals(350000L, request.getValue().codAmount()),
                () -> assertEquals(1200, request.getValue().weightG()),
                () -> assertEquals("Hà Nội", request.getValue().toProvinceName()),
                () -> assertEquals("Phường Ba Đình", request.getValue().toWardName()),
                () -> assertTrue(notificationTitles(customer.id()).contains("Đơn hàng đã được gửi GHN")),
                () -> assertEquals("AWAITING_PICKUP", row.get("shipment_status"), "shipment_status"));
    }

    @Test
    @DisplayName("IT-ORD-06: Gửi GHN với địa chỉ hoặc cân nặng không hợp lệ")
    void ghnRejectsInvalidAddressOrWeight() throws Exception {
        stubGhnCatalog();
        int id = order("ORD-IT-06", "AWAITING_PICKUP", "COD", "UNPAID");
        var session = login(owner.email());

        var step1 =
                changeStatus(
                        id, session,
                        "status", "SHIPPING", "carrier", "GHN", "weightG", "1200",
                        "ghnProvinceId", String.valueOf(PROVINCE_ID),
                        "ghnWardId", String.valueOf(OTHER_PROVINCE_WARD_ID));
        var step2 =
                changeStatus(
                        id, session,
                        "status", "SHIPPING", "carrier", "GHN", "weightG", "50001",
                        "ghnProvinceId", String.valueOf(PROVINCE_ID),
                        "ghnWardId", String.valueOf(WARD_ID));

        assertEquals(400, step1.getStatus());
        assertEquals("GHN_ADDRESS", body(step1).get("code").asText());
        assertEquals(400, step2.getStatus());
        assertEquals("GHN_WEIGHT", body(step2).get("code").asText());
        verify(ghn, never()).create(any());
        assertEquals("AWAITING_PICKUP", orderStatus(id));
    }

    // ================================================================== Đã giao kèm ảnh minh chứng

    @Test
    @DisplayName("IT-ORD-07: Xác nhận đã giao kèm 2 ảnh minh chứng")
    void confirmDeliveredWithTwoPhotos() throws Exception {
        int id = selfShippingOrder("ORD-IT-07");
        var session = login(owner.email());

        var required = get("/api/orders/delivery-proof/required", session);
        assertEquals(200, required.getStatus());
        assertTrue(body(required).get("required").asBoolean());

        var r = confirmDelivered(id, session, 2, "Giao tận tay");

        assertEquals(200, r.getStatus(), r.getContentAsString());
        JsonNode result = body(r);
        assertEquals("DELIVERED", result.get("order").get("orderStatus").asText());
        assertEquals(2, result.get("proof").get("imageUrls").size());
        assertEquals("Giao tận tay", result.get("proof").get("note").asText());
        assertEquals("DELIVERED", orderStatus(id));
        assertEquals(1, count("SELECT COUNT(*) FROM order_delivery_proof WHERE order_id=?", id));
        var proof = db.queryForMap("SELECT image_urls, note FROM order_delivery_proof WHERE order_id=?", id);
        String[] urls = ((String) proof.get("image_urls")).split("\n");
        assertEquals(2, urls.length);
        for (String url : urls) assertTrue(url.contains("/thors/delivery-proofs/"), url);
        assertEquals("Giao tận tay", proof.get("note"));
        verify(uploader, times(2)).upload(any(), argThat(o -> "thors/delivery-proofs".equals(o.get("folder"))));
        assertTrue(notificationTitles(customer.id()).contains("Đơn hàng đã giao"));
    }

    @Test
    @DisplayName("IT-ORD-08: Ảnh minh chứng vượt giới hạn hoặc thiếu ảnh thì không đổi trạng thái")
    void tooManyOrMissingProofPhotosKeepShipping() throws Exception {
        int id = selfShippingOrder("ORD-IT-08");
        var session = login(owner.email());

        var step1 = confirmDelivered(id, session, 4, null);
        var step2 = changeStatus(id, session, "status", "DELIVERED");

        assertEquals(400, step1.getStatus());
        assertEquals("DELIVERY_PROOF_COUNT", body(step1).get("code").asText());
        verify(uploader, never()).upload(any(), anyMap());
        assertEquals(400, step2.getStatus());
        assertEquals("DELIVERY_PROOF_REQUIRED", body(step2).get("code").asText());
        assertEquals("SHIPPING", orderStatus(id));
    }

    @Test
    @DisplayName("IT-ORD-09: Đơn đã gửi GHN không được xác nhận đã giao thủ công")
    void ghnOrderCannotBeConfirmedManually() throws Exception {
        int id = ghnOrder("ORD-IT-09", "SHIPPING", "GHN-IT-0009", "IN_TRANSIT");

        var r = confirmDelivered(id, login(owner.email()), 1, null);

        assertEquals(409, r.getStatus());
        assertEquals("CARRIER_MANAGED", body(r).get("code").asText());
        verify(uploader, never()).upload(any(), anyMap());
        assertEquals("SHIPPING", orderStatus(id));
    }

    // ================================================================== Webhook và hỏi định kỳ GHN

    static String minutesAgo(int minutes) {
        return Instant.now().minus(minutes, ChronoUnit.MINUTES).truncatedTo(ChronoUnit.SECONDS).toString();
    }

    @Test
    @DisplayName("IT-ORD-10: Webhook GHN \"picked\" chuyển đơn sang Đang giao")
    void ghnPickedWebhookStartsShipping() throws Exception {
        int id = ghnOrder("ORD-IT-10", "AWAITING_PICKUP", "GHN-IT-0010", "CREATED");

        var r = webhook(GHN_WEBHOOK_KEY, Map.of("OrderCode", "GHN-IT-0010", "Status", "picked", "Time", minutesAgo(10)));

        assertEquals(200, r.getStatus(), r.getContentAsString());
        assertEquals("APPLIED", body(r).get("result").asText());
        assertEquals("IN_TRANSIT", string("SELECT shipment_status FROM orders WHERE order_id=?", id));
        assertEquals("SHIPPING", orderStatus(id));
        assertTrue(notificationTitles(customer.id()).contains("Đơn hàng đang được giao"));
        assertTrue(notificationTitles(owner.id()).contains("GHN đã lấy hàng"));
        assertTrue(notificationTitles(member.id()).contains("GHN đã lấy hàng"));
    }

    @Test
    @DisplayName("IT-ORD-11: Webhook GHN \"delivered\" chuyển đơn sang Đã giao")
    void ghnDeliveredWebhookCompletesDelivery() throws Exception {
        int id = ghnOrder("ORD-IT-11", "AWAITING_PICKUP", "GHN-IT-0011", "CREATED");
        // tiền điều kiện (IT-ORD-10): GHN đã lấy hàng
        assertEquals(
                "APPLIED",
                body(webhook(GHN_WEBHOOK_KEY, Map.of("OrderCode", "GHN-IT-0011", "Status", "picked", "Time", minutesAgo(10))))
                        .get("result").asText());

        var r = webhook(GHN_WEBHOOK_KEY, Map.of("OrderCode", "GHN-IT-0011", "Status", "delivered", "Time", minutesAgo(2)));

        assertEquals(200, r.getStatus(), r.getContentAsString());
        assertEquals("APPLIED", body(r).get("result").asText());
        assertEquals("DELIVERED", orderStatus(id));
        assertTrue(notificationTitles(customer.id()).contains("Đơn hàng đã giao"));
        assertTrue(notificationTitles(owner.id()).contains("GHN đã giao đơn"));
        assertTrue(notificationTitles(member.id()).contains("GHN đã giao đơn"));
    }

    @Test
    @DisplayName("IT-ORD-12: Webhook GHN \"cancel\" hủy đơn")
    void ghnCancelWebhookCancelsOrder() throws Exception {
        int id = ghnOrder("ORD-IT-12", "AWAITING_PICKUP", "GHN-IT-0012", "CREATED");

        var r =
                webhook(
                        GHN_WEBHOOK_KEY,
                        Map.of("OrderCode", "GHN-IT-0012", "Status", "cancel", "Reason", "Shop hủy", "Time", minutesAgo(1)));

        assertEquals(200, r.getStatus(), r.getContentAsString());
        assertEquals("APPLIED", body(r).get("result").asText());
        assertEquals("CANCELLED", orderStatus(id));
        assertEquals("Vận đơn GHN bị hủy: Shop hủy", string("SELECT cancel_reason FROM orders WHERE order_id=?", id));
        assertTrue(notificationTitles(customer.id()).contains("Đơn hàng đã bị hủy"));
        assertTrue(notificationTitles(owner.id()).contains("Vận đơn GHN đã bị hủy"));
        assertTrue(notificationTitles(member.id()).contains("Vận đơn GHN đã bị hủy"));
    }

    @Test
    @DisplayName("IT-ORD-13: Webhook sai khóa hoặc gửi trùng bị bỏ qua")
    void wrongKeyOrDuplicateWebhookIgnored() throws Exception {
        int id = ghnOrder("ORD-IT-13", "AWAITING_PICKUP", "GHN-IT-0013", "CREATED");
        Map<String, Object> picked = Map.of("OrderCode", "GHN-IT-0013", "Status", "picked", "Time", minutesAgo(10));

        var step1 = webhook("sai-key", Map.of("OrderCode", "GHN-IT-0013", "Status", "picked"));
        assertEquals(404, step1.getStatus());
        assertEquals("AWAITING_PICKUP", orderStatus(id));
        assertEquals("CREATED", string("SELECT shipment_status FROM orders WHERE order_id=?", id));

        // tiền điều kiện (IT-ORD-10) rồi gửi lại đúng request đó
        assertEquals("APPLIED", body(webhook(GHN_WEBHOOK_KEY, picked)).get("result").asText());
        int notices = notificationCount();
        var step2 = webhook(GHN_WEBHOOK_KEY, picked);
        assertEquals(200, step2.getStatus());
        assertEquals("DUPLICATE", body(step2).get("result").asText());
        assertEquals(notices, notificationCount());
    }

    @Test
    @DisplayName("IT-ORD-14: GhnTrackingScheduler tự cập nhật trạng thái khi không có webhook")
    void schedulerPollsGhnWithoutWebhook() throws Exception {
        int id = ghnOrder("ORD-IT-14", "AWAITING_PICKUP", "GHN-IT-0014", "CREATED");
        // Bước 1-2: poll-enabled bật (thuộc tính test), không gọi webhook; GHN (giả) báo vận đơn đã lấy hàng
        when(ghn.isConfigured()).thenReturn(true);
        when(ghn.detail("GHN-IT-0014")).thenReturn(new GhnClient.Tracking("picked", minutesAgo(1), null));

        // Bước 3: một lượt hỏi định kỳ (thay cho việc chờ tối đa 30 giây)
        long started = System.currentTimeMillis();
        scheduler.poll();
        assertTrue(System.currentTimeMillis() - started < 30_000);

        assertEquals("IN_TRANSIT", string("SELECT shipment_status FROM orders WHERE order_id=?", id));
        assertEquals("SHIPPING", orderStatus(id));
        assertTrue(notificationTitles(customer.id()).contains("Đơn hàng đang được giao"));
        assertTrue(notificationTitles(owner.id()).contains("GHN đã lấy hàng"));
        assertTrue(notificationTitles(member.id()).contains("GHN đã lấy hàng"));
    }
}
