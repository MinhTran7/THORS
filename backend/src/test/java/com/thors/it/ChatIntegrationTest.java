package com.thors.it;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.thors.module.account.entity.Account;
import com.thors.module.chat.ChatBot;
import com.thors.module.chat.ChatBotAccess;
import com.thors.module.chat.ChatKnowledge;
import com.thors.module.chat.GeminiClient;
import com.thors.module.order.delivery.GhnClient;
import java.text.NumberFormat;
import java.time.Duration;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.BooleanSupplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * Integration test tab "Chat" (IT-CHAT-01..14): CustomerChatWidget / StoreChatPage ↔ ChatController ↔ ChatService,
 * ChatAutoReply, ChatBot, ChatKnowledge ↔ bảng chat_conversation, chat_message, chat_knowledge, website_setting.
 * Gemini API và GHN API là giả lập (@MockitoBean GeminiClient / GhnClient): "mô hình" giả chọn công cụ theo câu khách
 * hỏi rồi trả lời bằng đúng dữ liệu công cụ (DB thật) trả về.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(locations = "classpath:it-notification-chat.properties")
@Import(H2MysqlShim.class)
class ChatIntegrationTest extends ItSupport {
    static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");
    static final Duration WAIT = Duration.ofSeconds(15);

    @MockitoBean GeminiClient gemini;
    @MockitoBean GhnClient ghn;
    @Autowired ChatBot bot;
    @Autowired ChatKnowledge knowledge;

    final ObjectMapper om = new ObjectMapper();
    Account owner;
    Account customer;
    MockHttpSession ownerSession;
    MockHttpSession customerSession;
    int categoryAo;

    @BeforeEach
    void seed() throws Exception {
        cleanAll();
        owner = account("OWNER", "Chủ shop", "owner@example.com", "ACTIVE");
        customer = account("CUSTOMER", "Nguyễn Văn An", "an@example.com", "ACTIVE");
        ownerSession = login(owner);
        customerSession = login(customer);
        categoryAo = category("Áo", null);
        // Mặc định: trợ lý AI tắt, không tin chào, luôn trong giờ làm việc; từng test đặt lại theo tiền điều kiện
        settings(Map.of("chatBotMode", "OFF", "chatGreeting", "", "chatOpenTime", "00:00", "chatCloseTime", "00:00",
                "chatBotWaitMinutes", "10"));
    }

    // ------------------------------------------------------------------ Hàm phụ

    JsonNode settings(Map<String, Object> values) throws Exception {
        var r = send(put("/api/chat/settings"), ownerSession, values);
        assertEquals(200, r.getStatus(), r.getContentAsString());
        return body(r);
    }

    /** Giờ làm việc sao cho lúc này (giờ VN) nằm NGOÀI giờ: mở cửa sau 2 tiếng, đóng sau 3 tiếng. */
    static Map<String, Object> outsideHours() {
        ZonedDateTime now = ZonedDateTime.now(VN);
        DateTimeFormatter f = DateTimeFormatter.ofPattern("HH:mm");
        return Map.of("chatOpenTime", now.plusHours(2).format(f), "chatCloseTime", now.plusHours(3).format(f));
    }

    MockHttpServletResponse say(MockHttpSession s, Object body) throws Exception {
        return send(post("/api/chat/me/messages"), s, body);
    }

    int conversationOf(Account c) {
        return db.queryForObject("SELECT conversation_id FROM chat_conversation WHERE customer_id = ?", Integer.class, c.id());
    }

    int countSide(int conversationId, String side) {
        return count("SELECT COUNT(*) FROM chat_message WHERE conversation_id = ? AND sender_side = ?", conversationId, side);
    }

    List<String> bodies(int conversationId, String side) {
        return db.queryForList("SELECT body FROM chat_message WHERE conversation_id = ? AND sender_side = ? ORDER BY message_id",
                String.class, conversationId, side);
    }

    static void await(String what, BooleanSupplier condition) throws InterruptedException {
        long end = System.nanoTime() + WAIT.toNanos();
        while (System.nanoTime() < end) {
            if (condition.getAsBoolean()) return;
            Thread.sleep(100);
        }
        fail("Hết " + WAIT.toSeconds() + " giây vẫn chưa thấy: " + what);
    }

    int order(Account c, String number, String status, String carrier, String tracking) {
        db.update("INSERT INTO orders (order_number, order_type, user_id, order_date, order_status, total_amount, created_by,"
                        + " payment_method, payment_status, items_amount, shipping_carrier, tracking_number, shipment_status)"
                        + " VALUES (?, 'Online', ?, NOW(), ?, 300000, ?, 'COD', 'UNPAID', 300000, ?, ?, ?)",
                number, c.id(), status, c.id(), carrier, tracking, "SHIPPING".equals(status) ? "IN_TRANSIT" : null);
        return db.queryForObject("SELECT order_id FROM orders WHERE order_number = ?", Integer.class, number);
    }

    static String vnd(long amount) {
        return NumberFormat.getNumberInstance(Locale.forLanguageTag("vi-VN")).format(amount) + " ₫";
    }

    // ------------------------------------------------------------------ Gemini giả lập

    /** Vector giả cho một đoạn chữ: đếm từ theo hash (cùng chữ thì cùng vector, khác chữ thì khác vector). */
    static float[] vector(String text) {
        float[] v = new float[32];
        v[0] = 0.1f;
        for (String w : text.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+"))
            if (!w.isBlank()) v[1 + Math.floorMod(w.hashCode(), 31)] += 1;
        return v;
    }

    @SuppressWarnings("unchecked")
    void geminiOn() {
        when(gemini.configured()).thenReturn(true);
        when(gemini.json()).thenReturn(om);
        when(gemini.model()).thenReturn("fake-gemini");
        when(gemini.embeddingModel()).thenReturn("fake-embedding");
        when(gemini.embed(anyList(), anyString()))
                .thenAnswer(inv -> ((List<String>) inv.getArgument(0)).stream().map(ChatIntegrationTest::vector).toList());
        when(gemini.generate(anyString(), any(ArrayNode.class), any(ArrayNode.class)))
                .thenAnswer(inv -> fakeModel(inv.getArgument(1)));
        when(gemini.generate(anyString(), any(ArrayNode.class), any(ArrayNode.class), anyBoolean()))
                .thenAnswer(inv -> fakeModel(inv.getArgument(1)));
    }

    static final Pattern ORDER_NO = Pattern.compile("ORD-[A-Za-z0-9-]+");

    /**
     * "Mô hình" giả: lượt của khách thì gọi công cụ (gặp nhân viên → handoff_to_staff, có mã ORD-... → track_order,
     * còn lại → search_products); lượt kết quả công cụ thì trả lời bằng chữ dựng từ đúng kết quả đó.
     */
    ObjectNode fakeModel(ArrayNode contents) {
        JsonNode last = contents.get(contents.size() - 1);
        ObjectNode out = om.createObjectNode().put("role", "model");
        ArrayNode parts = out.putArray("parts");
        JsonNode fr = last.path("parts").path(0).path("functionResponse");
        if (!fr.isMissingNode()) {
            parts.addObject().put("text", answerFrom(fr.path("name").asText(), fr.path("response").path("result")));
            return out;
        }
        StringBuilder text = new StringBuilder();
        for (JsonNode p : last.path("parts")) text.append(p.path("text").asText()).append(' ');
        String q = text.toString().trim();
        ObjectNode call = parts.addObject().putObject("functionCall");
        Matcher m = ORDER_NO.matcher(q);
        if (q.toLowerCase(Locale.ROOT).contains("nhân viên")) {
            call.put("name", "handoff_to_staff").putObject("args").put("reason", "Khách muốn gặp nhân viên");
        } else if (m.find()) {
            call.put("name", "track_order").putObject("args").put("order_number", m.group());
        } else {
            // Như mô hình thật: rút từ khóa sản phẩm khỏi câu hỏi ("Shop có áo đi biển không?" -> "áo đi biển")
            String keywords = q.replaceAll("[?!.,]", " ")
                    .replaceAll("(?iu)(^|\\s)(shop|có|không|ạ|ơi|bán)(?=\\s|$)", " ")
                    .replaceAll("\\s+", " ").trim();
            call.put("name", "search_products").putObject("args").put("query", keywords);
        }
        return out;
    }

    static String answerFrom(String tool, JsonNode result) {
        if (result.has("error")) return result.path("error").asText();
        if ("search_products".equals(tool)) {
            JsonNode p = result.path("products").path(0);
            if (p.isMissingNode()) return "Hiện shop chưa có sản phẩm phù hợp.";
            return "Shop có " + p.path("name").asText() + " giá " + p.path("price_from").asText() + " bạn nhé.";
        }
        if ("track_order".equals(tool)) {
            List<String> steps = new ArrayList<>();
            for (JsonNode s : result.path("journey")) steps.add(s.path("time").asText() + " " + s.path("event").asText());
            return "Đơn " + result.path("order_number").asText() + ": " + result.path("status").asText()
                    + (steps.isEmpty() ? "" : ". Hành trình: " + String.join("; ", steps)) + ".";
        }
        return result.toString();
    }

    // ------------------------------------------------------------------ Khách nhắn tin và tin tự động

    @Test
    @DisplayName("IT-CHAT-01: Tin đầu tiên của khách tạo cuộc trò chuyện và nhận lời chào")
    void firstMessageCreatesConversationAndGreets() throws Exception {
        String greeting = "Cảm ơn bạn đã nhắn tin cho THORS!";
        settings(Map.of("chatBotMode", "OFF", "chatGreeting", greeting));
        assertEquals(0, count("SELECT COUNT(*) FROM chat_conversation"));

        var r = say(customerSession, Map.of("body", "Xin chào"));
        assertEquals(200, r.getStatus());
        assertEquals("Xin chào", body(r).path("body").asText(), "Tin hiển thị ngay trong khung chat");

        assertEquals(1, count("SELECT COUNT(*) FROM chat_conversation WHERE customer_id = ?", customer.id()));
        int c = conversationOf(customer);
        assertEquals(List.of("Xin chào"), bodies(c, "CUSTOMER"));
        assertEquals(List.of(greeting), bodies(c, "AUTO"));

        // Owner mở trang Tin nhắn (trang tự hỏi lại vài giây một lần)
        var list = get("/api/chat/conversations", ownerSession);
        assertEquals(200, list.getStatus());
        JsonNode row = null;
        for (JsonNode n : body(list)) if (n.path("id").asInt() == c) row = n;
        assertNotNull(row, "Owner thấy cuộc trò chuyện mới");
        assertEquals(1, row.path("unread").asInt());
        assertEquals(1, body(get("/api/chat/status", ownerSession)).path("unread").asInt());
    }

    @Test
    @DisplayName("IT-CHAT-02: Ngoài giờ làm việc khách nhận tin báo ngoài giờ tối đa 1 lần trong 3 giờ")
    void awayMessageAtMostOncePerThreeHours() throws Exception {
        Map<String, Object> s = new HashMap<>(outsideHours());
        s.put("chatBotMode", "OFF");
        s.put("chatAwayMessage", "Cửa hàng đang ngoài giờ làm việc ({open} – {close}).");
        settings(s);
        String away = "Cửa hàng đang ngoài giờ làm việc (" + s.get("chatOpenTime") + " – " + s.get("chatCloseTime") + ").";

        assertEquals(200, say(customerSession, Map.of("body", "Shop ơi")).getStatus());
        int c = conversationOf(customer);
        assertEquals(List.of(away), bodies(c, "AUTO"), "Tin AUTO ngoài giờ sau tin thứ nhất");
        assertEquals(200, say(customerSession, Map.of("body", "Còn hàng không ạ?")).getStatus());
        assertEquals(List.of(away), bodies(c, "AUTO"), "Tin thứ hai không sinh thêm tin ngoài giờ");
    }

    @Test
    @DisplayName("IT-CHAT-03: Tin nhắn không hợp lệ bị từ chối")
    void invalidMessagesRejected() throws Exception {
        assertEquals(200, say(customerSession, Map.of("body", "Tin đầu tiên")).getStatus()); // Customer A có cuộc trò chuyện
        Account b = account("CUSTOMER", "Khách B", "b@example.com", "ACTIVE");
        int orderOfB = order(b, "ORD-B-001", "PENDING_CONFIRMATION", null, null);
        int before = count("SELECT COUNT(*) FROM chat_message");

        assertEquals(400, say(customerSession, Map.of("body", "a".repeat(2001))).getStatus());
        assertEquals(400, say(customerSession, Map.of("imageUrl", "https://example.com/anh.jpg")).getStatus());
        assertEquals(400, say(customerSession, Map.of("body", "Đơn này", "orderId", orderOfB)).getStatus());
        assertEquals(before, count("SELECT COUNT(*) FROM chat_message"), "Không có dòng chat_message mới");
    }

    @Test
    @DisplayName("IT-CHAT-04: Khách hỏi câu thường gặp và nhận câu trả lời ngay")
    void faqAnsweredImmediately() throws Exception {
        String answer = "Đơn từ 500.000đ được miễn phí giao hàng toàn quốc.";
        settings(Map.of("chatFaq", "Có freeship không? | " + answer));
        order(customer, "ORD-GHN-001", "SHIPPING", "GHN", "GHNTRACK001");
        order(customer, "ORD-NEW-002", "PENDING_CONFIRMATION", null, null);
        order(customer, "ORD-OLD-003", "COMPLETED", "GHN", "GHNOLD003");

        // Bước 1: bấm nút câu hỏi "Có freeship không?"
        String faqId = null;
        for (JsonNode f : body(get("/api/chat/me/faq", customerSession)))
            if ("Có freeship không?".equals(f.path("question").asText())) faqId = f.path("id").asText();
        assertNotNull(faqId);
        var r1 = send(post("/api/chat/me/faq"), customerSession, Map.of("id", faqId));
        assertEquals(200, r1.getStatus());
        JsonNode m1 = body(r1);
        assertEquals(2, m1.size());
        assertEquals("CUSTOMER", m1.get(0).path("side").asText());
        assertEquals("Có freeship không?", m1.get(0).path("body").asText());
        assertEquals("AUTO", m1.get(1).path("side").asText());
        assertEquals(answer, m1.get(1).path("body").asText());

        // Bước 2: "Đơn hàng của tôi tới đâu rồi?"
        var r2 = send(post("/api/chat/me/faq"), customerSession, Map.of("id", "orders"));
        assertEquals(200, r2.getStatus());
        String a2 = body(r2).get(1).path("body").asText();
        assertTrue(a2.contains("ORD-GHN-001") && a2.contains("đang được giao đến bạn") && a2.contains("GHNTRACK001"), a2);
        assertTrue(a2.contains("ORD-NEW-002") && a2.contains("đang chờ cửa hàng xác nhận"), a2);
        assertFalse(a2.contains("ORD-OLD-003"), "Chỉ liệt kê đơn đang xử lý: " + a2);

        // Bước 3: id không tồn tại
        var r3 = send(post("/api/chat/me/faq"), customerSession, Map.of("id", "khong-co"));
        assertEquals(404, r3.getStatus());
        assertEquals("FAQ_NOT_FOUND", body(r3).path("code").asText());
    }

    // ------------------------------------------------------------------ Cửa hàng trả lời và trạng thái đã đọc

    @Test
    @DisplayName("IT-CHAT-05: Cửa hàng trả lời bằng mẫu câu, khách nhận tin và hai bên thấy \"Đã xem\"")
    void storeReplyWithQuickReplyAndSeen() throws Exception {
        assertEquals(200, say(customerSession, Map.of("body", "Áo này còn size M không?")).getStatus());
        int c = conversationOf(customer);
        long lastSeenByCustomer = db.queryForObject("SELECT MAX(message_id) FROM chat_message WHERE conversation_id = ?", Long.class, c);
        int productId = product(categoryAo, "Áo thun basic", "Cotton");
        variant(productId, "M", "Trắng", 200_000, 5);

        // Bước 1
        String quick = body(get("/api/chat/quick-replies", ownerSession)).get(0).asText();
        var r = send(post("/api/chat/conversations/" + c + "/messages"), ownerSession, Map.of("body", quick, "productId", productId));
        assertEquals(200, r.getStatus());
        long storeMsg = body(r).path("id").asLong();
        assertEquals(1, count("SELECT COUNT(*) FROM chat_message WHERE message_id = ? AND sender_side = 'STORE' AND product_id = ?",
                storeMsg, productId));

        // Bước 2: khung chat của khách tự hỏi tin mới (after = tin cuối khách đã có)
        var poll = get("/api/chat/me?after=" + lastSeenByCustomer, customerSession);
        assertEquals(200, poll.getStatus());
        JsonNode got = null;
        for (JsonNode m : body(poll).path("messages")) if (m.path("id").asLong() == storeMsg) got = m;
        assertNotNull(got, "Khách thấy tin mới");
        assertEquals(quick, got.path("body").asText());
        assertTrue(got.path("senderName").isNull(), "Tên nhân viên bị ẩn với khách");
        assertEquals(0, got.path("senderId").asInt());
        assertEquals(productId, got.path("product").path("id").asInt());

        // Bước 3: khách đọc tin
        assertEquals(200, send(post("/api/chat/me/read"), customerSession, Map.of("upTo", storeMsg)).getStatus());
        assertEquals(storeMsg, db.queryForObject("SELECT customer_last_read_id FROM chat_conversation WHERE conversation_id = ?", Long.class, c));
        var store = get("/api/chat/conversations/" + c, ownerSession);
        assertTrue(body(store).path("otherLastReadId").asLong() >= storeMsg, "Phía cửa hàng hiện \"Đã xem\"");
    }

    @Test
    @DisplayName("IT-CHAT-06: Badge số tin chưa đọc của khách và cửa hàng")
    void unreadBadges() throws Exception {
        assertEquals(200, say(customerSession, Map.of("body", "Chào shop")).getStatus()); // có cuộc trò chuyện
        int c = conversationOf(customer);
        long mine = db.queryForObject("SELECT MAX(message_id) FROM chat_message WHERE conversation_id = ?", Long.class, c);
        send(post("/api/chat/me/read"), customerSession, Map.of("upTo", mine));
        send(post("/api/chat/conversations/" + c + "/read"), ownerSession, Map.of("upTo", mine));

        // Bước 1, 2: khách đóng khung chat, Owner gửi 2 tin; nút chat của khách hỏi /status
        send(post("/api/chat/conversations/" + c + "/messages"), ownerSession, Map.of("body", "Dạ còn ạ"));
        send(post("/api/chat/conversations/" + c + "/messages"), ownerSession, Map.of("body", "Bạn cần size nào ạ?"));
        assertEquals(2, body(get("/api/chat/status", customerSession)).path("unread").asInt());
        // Mở khung chat: tải tin rồi đánh dấu đã đọc tới tin mới nhất
        JsonNode thread = body(get("/api/chat/me", customerSession));
        JsonNode msgs = thread.path("messages");
        long latest = msgs.get(msgs.size() - 1).path("id").asLong();
        send(post("/api/chat/me/read"), customerSession, Map.of("upTo", latest));
        assertEquals(0, body(get("/api/chat/status", customerSession)).path("unread").asInt());

        // Bước 3
        var sent = say(customerSession, Map.of("body", "Size M ạ"));
        JsonNode row = null;
        for (JsonNode n : body(get("/api/chat/conversations", ownerSession))) if (n.path("id").asInt() == c) row = n;
        assertNotNull(row);
        assertEquals(1, row.path("unread").asInt());
        send(post("/api/chat/conversations/" + c + "/read"), ownerSession, Map.of("upTo", body(sent).path("id").asLong()));
        for (JsonNode n : body(get("/api/chat/conversations", ownerSession))) if (n.path("id").asInt() == c) row = n;
        assertEquals(0, row.path("unread").asInt());
    }

    @Test
    @DisplayName("IT-CHAT-07: Tìm hội thoại theo tên khách và phân quyền trang cửa hàng")
    void searchConversationsAndRoleChecks() throws Exception {
        Account binh = account("CUSTOMER", "Trần Thị Bình", "binh@example.com", "ACTIVE");
        var binhSession = login(binh);
        say(customerSession, Map.of("body", "Hỏi về áo"));
        say(binhSession, Map.of("body", "Hỏi về quần"));

        // Bước 1
        var found = body(send(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/chat/conversations")
                .param("q", "Trần Thị Bình"), ownerSession, null));
        assertEquals(1, found.size(), "Chỉ gồm cuộc trò chuyện khớp tên");
        assertEquals(binh.id(), found.get(0).path("customerId").asInt());

        // Bước 2: Family Member xem và trả lời được
        Account family = account("FAMILY_MEMBER", "Người nhà", "family@example.com", "ACTIVE");
        var fs = login(family);
        var list = get("/api/chat/conversations", fs);
        assertEquals(200, list.getStatus());
        assertEquals(2, body(list).size());
        int c = conversationOf(binh);
        assertEquals(200, get("/api/chat/conversations/" + c, fs).getStatus());
        assertEquals(200, send(post("/api/chat/conversations/" + c + "/messages"), fs, Map.of("body", "Dạ shop đây ạ")).getStatus());

        // Bước 3
        assertEquals(403, get("/api/chat/conversations", customerSession).getStatus());
    }

    // ------------------------------------------------------------------ Trợ lý AI

    @Test
    @DisplayName("IT-CHAT-08: Trợ lý AI tìm sản phẩm thật trong cửa hàng để trả lời")
    void botAnswersWithRealProducts() throws Exception {
        geminiOn();
        int beach = product(categoryAo, "Áo sơ mi đi biển họa tiết", "Áo sơ mi mặc đi biển, chất liệu thoáng mát");
        variant(beach, "M", "Xanh", 250_000, 8);
        variant(beach, "L", "Xanh", 270_000, 3);
        int old = product(categoryAo, "Áo tắm đi biển ngừng bán", "Đồ đi biển");
        variant(old, "M", "Đỏ", 99_000, 5);
        db.update("UPDATE product SET status = 'INACTIVE' WHERE product_id = ?", old);
        assertNull(knowledge.sync().skipped(), "Kho tri thức đã đồng bộ");

        settings(Map.of("chatBotMode", "ALWAYS"));
        assertEquals(200, say(customerSession, Map.of("body", "Shop có áo đi biển không?")).getStatus());
        int c = conversationOf(customer);
        await("tin BOT trả lời", () -> countSide(c, "BOT") == 1);

        String reply = bodies(c, "BOT").get(0);
        List<Map<String, Object>> mentioned = new ArrayList<>();
        for (Map<String, Object> p : db.queryForList("SELECT product_id, product_name, status FROM product"))
            if (reply.contains(String.valueOf(p.get("product_name")))) mentioned.add(p);
        assertFalse(mentioned.isEmpty(), "Sản phẩm được nhắc đến có trong bảng product: " + reply);
        for (Map<String, Object> p : mentioned) assertEquals("ACTIVE", p.get("status"), "Sản phẩm còn bán: " + reply);
        int id = ((Number) mentioned.get(0).get("product_id")).intValue();
        long minPrice = db.queryForObject("SELECT MIN(price) FROM product_detail WHERE product_id = ? AND status = 'ACTIVE'"
                + " AND online_sales_enabled = 1", Long.class, id);
        assertTrue(reply.contains(vnd(minPrice)), "Giá đúng (" + vnd(minPrice) + "): " + reply);
        assertEquals(0, countSide(c, "AUTO"), "Không có tin AUTO cho tin này");
    }

    @Test
    @DisplayName("IT-CHAT-09: Trợ lý AI tra cứu hành trình đơn GHN của khách")
    void botTracksOwnGhnOrderOnly() throws Exception {
        geminiOn();
        when(ghn.isConfigured()).thenReturn(true);
        when(ghn.journey("GHNTRACK001")).thenReturn(List.of(
                new GhnClient.Step("picked", "2026-11-25T02:00:00Z"),
                new GhnClient.Step("delivering", "2026-11-26T01:30:00Z")));
        order(customer, "ORD-MINE-001", "SHIPPING", "GHN", "GHNTRACK001");
        Account other = account("CUSTOMER", "Khách khác", "other@example.com", "ACTIVE");
        order(other, "ORD-OTHER-009", "SHIPPING", "GHN", "GHNOTHER009");
        settings(Map.of("chatBotMode", "ALWAYS"));

        // Bước 1
        say(customerSession, Map.of("body", "Đơn ORD-MINE-001 tới đâu rồi?"));
        int c = conversationOf(customer);
        await("tin BOT về đơn của khách", () -> countSide(c, "BOT") == 1);
        String r1 = bodies(c, "BOT").get(0);
        assertTrue(r1.contains("Đang giao"), r1);
        assertTrue(r1.contains("GHN đã lấy hàng") && r1.contains("Nhân viên GHN đang giao đến bạn"), "Các mốc hành trình GHN bằng tiếng Việt: " + r1);

        // Bước 2
        say(customerSession, Map.of("body", "Còn đơn ORD-OTHER-009 thì sao?"));
        await("tin BOT về đơn của khách khác", () -> countSide(c, "BOT") == 2);
        String r2 = bodies(c, "BOT").get(1);
        assertTrue(r2.contains("Không tìm thấy đơn ORD-OTHER-009 trong các đơn của bạn"), r2);
        assertFalse(r2.contains("GHNOTHER009") || r2.contains("Đang giao"), "Không lộ thông tin đơn kia: " + r2);
        verify(ghn, never()).journey("GHNOTHER009");
    }

    @Test
    @DisplayName("IT-CHAT-10: Khách muốn gặp nhân viên, trợ lý AI chuyển giao và ngừng trả lời")
    void handoffStopsBot() throws Exception {
        geminiOn();
        settings(Map.of("chatBotMode", "ALWAYS"));
        say(customerSession, Map.of("body", "Cho tôi nói chuyện với nhân viên"));
        int c = conversationOf(customer);
        await("tin HANDOFF", () -> countSide(c, "HANDOFF") == 1);
        JsonNode row = null;
        for (JsonNode n : body(get("/api/chat/conversations", ownerSession))) if (n.path("id").asInt() == c) row = n;
        assertNotNull(row, "Cửa hàng thấy cuộc trò chuyện");
        assertTrue(row.path("unread").asInt() > 0, "Cuộc trò chuyện cần xử lý (có tin khách chưa đọc)");

        say(customerSession, Map.of("body", "Mình chờ nhé"));
        Thread.sleep(500); // nếu trợ lý (sai) nhận tin thì nó chạy ở luồng riêng; chờ ngắn để bắt được
        assertEquals(0, countSide(c, "BOT"), "Không có tin BOT mới (đã HANDOFF)");
        verify(gemini, times(1)).generate(anyString(), any(ArrayNode.class), any(ArrayNode.class));
    }

    @Test
    @DisplayName("IT-CHAT-11: Trợ lý AI không trả lời khi nhân viên vừa trả lời hoặc đang trong giờ (chế độ AWAY)")
    void botSilentWhenStaffActiveOrWithinHoursInAwayMode() throws Exception {
        geminiOn();
        // 1. ALWAYS; Owner trả lời; khách gửi tiếp trong 30 phút
        settings(Map.of("chatBotMode", "ALWAYS"));
        db.update("INSERT INTO chat_conversation (customer_id, created_at) VALUES (?, UTC_TIMESTAMP())", customer.id());
        int c = conversationOf(customer);
        assertEquals(200, send(post("/api/chat/conversations/" + c + "/messages"), ownerSession, Map.of("body", "Shop chào bạn")).getStatus());
        say(customerSession, Map.of("body", "Áo này giặt máy được không?"));
        Thread.sleep(500);
        assertEquals(0, countSide(c, "BOT"));
        String reason1 = body(get("/api/chat/settings", ownerSession)).path("botLastEvent").asText();
        assertTrue(reason1.contains("nhân viên vừa trả lời"), "Trang Cài đặt hiện lý do bỏ qua: " + reason1);

        // 2. AWAY; trong giờ làm việc khách gửi tin
        settings(Map.of("chatBotMode", "AWAY", "chatOpenTime", "00:00", "chatCloseTime", "00:00"));
        Account b = account("CUSTOMER", "Khách B", "b@example.com", "ACTIVE");
        var bs = login(b);
        say(bs, Map.of("body", "Shop ơi"));
        Thread.sleep(500);
        assertEquals(0, countSide(conversationOf(b), "BOT"));
        String reason2 = body(get("/api/chat/settings", ownerSession)).path("botLastEvent").asText();
        assertTrue(reason2.contains("đang trong giờ làm việc"), "Trang Cài đặt hiện lý do bỏ qua: " + reason2);
        verify(gemini, never()).generate(anyString(), any(ArrayNode.class), any(ArrayNode.class));
    }

    @Test
    @DisplayName("IT-CHAT-12: Gemini lỗi thì khách vẫn nhận tin tự động")
    void geminiErrorFallsBackToAutoReply() throws Exception {
        geminiOn();
        when(gemini.generate(anyString(), any(ArrayNode.class), any(ArrayNode.class)))
                .thenThrow(new RuntimeException("Gemini trả lỗi HTTP 400: API key not valid. Please pass a valid API key."));
        Map<String, Object> s = new HashMap<>(outsideHours());
        s.put("chatBotMode", "ALWAYS");
        s.put("chatAwayMessage", "Hiện cửa hàng đang ngoài giờ làm việc.");
        settings(s);

        say(customerSession, Map.of("body", "Shop ơi còn hàng không?"));
        int c = conversationOf(customer);
        await("tin AUTO ngoài giờ (fallback)", () -> bodies(c, "AUTO").contains("Hiện cửa hàng đang ngoài giờ làm việc."));
        assertEquals(0, countSide(c, "BOT"));
        String note = body(get("/api/chat/settings", ownerSession)).path("botLastEvent").asText();
        assertTrue(note.contains("lỗi") && note.contains("Gemini"), "Trang Cài đặt hiện ghi chú lỗi Gemini: " + note);
    }

    @Test
    @DisplayName("IT-CHAT-13: Trợ lý AI trả lời thay khi quá thời gian chờ nhân viên")
    void botAnswersAfterWaitTime() throws Exception {
        geminiOn();
        // Chế độ "Chỉ ngoài giờ" trong giờ làm việc: không trả lời ngay, chỉ đỡ lời khi quá botWaitMinutes
        settings(Map.of("chatBotMode", "AWAY", "chatBotWaitMinutes", "10"));
        ZonedDateTime sentAt = ZonedDateTime.now(VN);
        say(customerSession, Map.of("body", "Shop có áo khoác không?"));
        int c = conversationOf(customer);
        assertEquals(0, countSide(c, "BOT"));

        ChatBotAccess.answerWaiting(bot, sentAt.plusMinutes(9)); // chưa tới mốc 10 phút
        Thread.sleep(300);
        assertEquals(0, countSide(c, "BOT"));

        ChatBotAccess.answerWaiting(bot, sentAt.plusMinutes(11)); // lượt kiểm tra mỗi phút sau mốc 10 phút
        await("tin BOT trả lời thay", () -> countSide(c, "BOT") == 1);

        ChatBotAccess.answerWaiting(bot, sentAt.plusMinutes(12));
        Thread.sleep(500);
        assertEquals(1, countSide(c, "BOT"), "Tin đó chỉ được trả lời 1 lần");
    }

    @Test
    @DisplayName("IT-CHAT-14: Đồng bộ kho tri thức sau khi đổi và ngừng bán sản phẩm")
    void knowledgeSyncAfterProductChanges() throws Exception {
        geminiOn();
        int a = product(categoryAo, "Áo thun A", "Áo thun cotton co giãn");
        variant(a, "M", "Trắng", 150_000, 5);
        int b = product(categoryAo, "Áo khoác B", "Áo khoác gió");
        variant(b, "L", "Đen", 350_000, 5);
        int other = product(categoryAo, "Áo polo C", "Áo polo");
        variant(other, "M", "Xanh", 200_000, 5);
        assertNull(knowledge.sync().skipped());
        Map<String, Map<String, Object>> before = knowledgeRows();
        assertTrue(before.containsKey("PRODUCT:" + a) && before.containsKey("PRODUCT:" + b));

        // Bước 1
        db.update("UPDATE product SET description = 'Áo thun cotton 100%, thấm hút mồ hôi' WHERE product_id = ?", a);
        db.update("UPDATE product SET status = 'INACTIVE' WHERE product_id = ?", b);
        // Bước 2: chạy đồng bộ (thay cho chờ lịch 30 phút)
        ChatKnowledge.SyncResult r = knowledge.sync();
        // Bước 3
        Map<String, Map<String, Object>> after = knowledgeRows();
        assertNotEquals(before.get("PRODUCT:" + a).get("content_hash"), after.get("PRODUCT:" + a).get("content_hash"));
        assertFalse(java.util.Arrays.equals((byte[]) before.get("PRODUCT:" + a).get("embedding"),
                (byte[]) after.get("PRODUCT:" + a).get("embedding")), "Embedding mới");
        assertFalse(after.containsKey("PRODUCT:" + b), "Dòng PRODUCT của B bị xóa");
        for (String key : after.keySet()) {
            if (key.equals("PRODUCT:" + a)) continue;
            assertEquals(before.get(key).get("content_hash"), after.get(key).get("content_hash"), key + " không đổi");
            assertArrayEquals((byte[]) before.get(key).get("embedding"), (byte[]) after.get(key).get("embedding"), key + " không đổi");
        }
        assertEquals(1, r.embedded());
        assertEquals(1, r.removed());
    }

    Map<String, Map<String, Object>> knowledgeRows() {
        Map<String, Map<String, Object>> out = new HashMap<>();
        for (Map<String, Object> row : db.queryForList("SELECT source_type, source_key, content_hash, embedding FROM chat_knowledge"))
            out.put(row.get("source_type") + ":" + row.get("source_key"), row);
        return out;
    }
}
