package com.thors.module.chat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.thors.module.chat.ChatRepository.Conversation;
import com.thors.module.chat.ChatViews.Message;
import com.thors.module.shop.repository.ShopRepository;
import java.time.LocalDateTime;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Trợ lý AI: khi nào trả lời / im lặng, vòng gọi công cụ, chuyển nhân viên. Gemini được giả lập, không gọi mạng. */
class ChatBotTest {
    private final ObjectMapper json = new ObjectMapper();
    private ChatRepository repo;
    private ChatAutoReply settings;
    private GeminiClient gemini;
    private ShopRepository shop;
    private ChatBot bot;
    private final Conversation conv = new Conversation(9, 5, 0, 0);
    // 23:00 giờ VN = 16:00 UTC, ngoài giờ làm việc mặc định
    private final ZonedDateTime night = ZonedDateTime.of(2026, 11, 20, 23, 0, 0, 0, ChatAutoReply.VN);

    @BeforeEach
    void setUp() {
        repo = mock(ChatRepository.class);
        settings = mock(ChatAutoReply.class);
        gemini = mock(GeminiClient.class);
        shop = mock(ShopRepository.class);
        bot = new ChatBot(repo, settings, gemini, shop, mock(ChatKnowledge.class), mock(com.thors.module.order.delivery.GhnClient.class));
        when(gemini.configured()).thenReturn(true);
        when(gemini.json()).thenReturn(json);
        when(settings.botMode()).thenReturn(ChatAutoReply.BOT_AWAY);
        when(settings.withinWorkingHours(any())).thenReturn(false);
        when(settings.botDailyLimit()).thenReturn(200);
        when(settings.faqs()).thenReturn(List.of());
        when(settings.workingHoursText()).thenReturn("08:00 – 22:00");
        when(repo.storeSenderId()).thenReturn(Optional.of(1));
        when(repo.messages(9, 0, 0, ChatBot.HISTORY))
                .thenReturn(List.of(new Message(50, "CUSTOMER", 5, "Khách", "Áo thun trắng còn size L không?", null, null, null, null)));
    }

    @Test
    @DisplayName("Chế độ Chỉ ngoài giờ: ngoài giờ thì trả lời, trong giờ thì để nhân viên")
    void awayMode() {
        assertTrue(bot.shouldHandle(conv, night));
        when(settings.withinWorkingHours(any())).thenReturn(true);
        assertFalse(bot.shouldHandle(conv, night));
        when(settings.botMode()).thenReturn(ChatAutoReply.BOT_ALWAYS);
        assertTrue(bot.shouldHandle(conv, night));
    }

    @Test
    @DisplayName("Im lặng khi: chưa có key, tắt, nhân viên vừa trả lời, đã chuyển nhân viên, hết hạn mức ngày")
    void staysQuiet() {
        when(gemini.configured()).thenReturn(false);
        assertFalse(bot.shouldHandle(conv, night));
        when(gemini.configured()).thenReturn(true);

        when(settings.botMode()).thenReturn(ChatAutoReply.BOT_OFF);
        assertFalse(bot.shouldHandle(conv, night));
        when(settings.botMode()).thenReturn(ChatAutoReply.BOT_ALWAYS);

        LocalDateTime nowUtc = LocalDateTime.of(2026, 11, 20, 16, 0);
        when(repo.lastSideAt(9, ChatService.STORE)).thenReturn(nowUtc.minusMinutes(10));
        assertFalse(bot.shouldHandle(conv, night));
        when(repo.lastSideAt(9, ChatService.STORE)).thenReturn(nowUtc.minusHours(5));
        when(repo.lastSideAt(9, ChatBot.HANDOFF)).thenReturn(nowUtc.minusHours(1));
        assertFalse(bot.shouldHandle(conv, night));
        when(repo.lastSideAt(9, ChatBot.HANDOFF)).thenReturn(null);
        assertTrue(bot.shouldHandle(conv, night));

        when(repo.countSideSince(eq(ChatBot.BOT), any(), isNull())).thenReturn(200);
        assertFalse(bot.shouldHandle(conv, night));
    }

    @Test
    @DisplayName("Quá thời gian chờ chưa ai trả lời: trợ lý đỡ lời kể cả trong giờ, mỗi tin chỉ thử một lần")
    void answersWhenNobodyReplies() throws Exception {
        when(repo.ready()).thenReturn(true);
        when(settings.withinWorkingHours(any())).thenReturn(true); // trong giờ, chế độ Chỉ ngoài giờ
        when(settings.botWaitMinutes()).thenReturn(10);
        when(repo.find(9)).thenReturn(Optional.of(conv));
        when(repo.unanswered(any(), any())).thenReturn(List.of(new ChatRepository.Waiting(9, 50)));
        when(gemini.generate(any(), any(), any())).thenReturn(modelContent("[{\"text\":\"Dạ còn ạ.\"}]"));

        bot.answerWaiting(night);
        bot.answerWaiting(night); // lần quét sau, cùng tin chưa trả lời: không gọi lại

        // Tin chưa trả lời gửi trước mốc 16:00 - 10 phút (UTC), xét từ 60 phút trước đó
        verify(repo, org.mockito.Mockito.times(2)).unanswered(LocalDateTime.of(2026, 11, 20, 14, 50), LocalDateTime.of(2026, 11, 20, 15, 50));
        verify(repo, org.mockito.Mockito.timeout(3000)).insertMessage(9, 1, ChatBot.BOT, "Dạ còn ạ.", null, null, null);
        verify(gemini, org.mockito.Mockito.times(1)).generate(any(), any(), any());
    }

    @Test
    @DisplayName("Thời gian chờ = 0 hoặc trợ lý tắt: không đỡ lời")
    void waitingDisabled() {
        when(repo.ready()).thenReturn(true);
        when(settings.botWaitMinutes()).thenReturn(0);
        bot.answerWaiting(night);
        when(settings.botWaitMinutes()).thenReturn(10);
        when(settings.botMode()).thenReturn(ChatAutoReply.BOT_OFF);
        bot.answerWaiting(night);
        verify(repo, never()).unanswered(any(), any());
    }

    @Test
    @DisplayName("Tìm 'giày màu đen' không khớp tên thì bớt dần từ cuối, ra kết quả cho 'giày'")
    void searchFallsBackToShorterQuery() throws Exception {
        when(shop.findProducts("giày", null, null, 0, 12)).thenReturn(List.of(Map.of(
                "productId", 3, "productName", "Giày Da Nam", "categoryName", "Giày", "minPrice", 500000, "maxPrice", 500000, "totalStock", 4)));
        JsonNode result = bot.runTool("search_products", json.readTree("{\"query\":\"giày  màu đen\"}"), 5, json);
        assertEquals(3, result.path("products").get(0).path("product_id").asInt());
        assertTrue(result.path("note").asText().contains("\"giày\""));
    }

    @Test
    @DisplayName("Gọi công cụ quá số lượt: lượt cuối buộc trả lời bằng chữ")
    void forcesTextAfterTooManyRounds() throws Exception {
        when(gemini.generate(any(), any(), any()))
                .thenReturn(modelContent("[{\"functionCall\":{\"name\":\"search_products\",\"args\":{\"query\":\"x\"}}}]"));
        when(gemini.generate(any(), any(), any(), eq(false))).thenReturn(modelContent("[{\"text\":\"Hiện shop chưa có mẫu này ạ.\"}]"));
        bot.reply(conv);
        verify(repo).insertMessage(9, 1, ChatBot.BOT, "Hiện shop chưa có mẫu này ạ.", null, null, null);
    }

    @Test
    @DisplayName("Không lộ ghi chú nội bộ: bỏ [Đính kèm ... product_id=...] và product_id còn sót")
    void cleanHidesInternalNotes() {
        assertEquals("Áo còn hàng. Bạn chọn size nào nhé?",
                ChatBot.clean("Áo còn hàng. Bạn chọn size nào nhé? [Đính kèm sản phẩm \"Áo Sơ Mi\", product_id=86]"));
        assertEquals("Mẫu Áo Sơ Mi giá 250.000 ₫.", ChatBot.clean("Mẫu Áo Sơ Mi (product_id=86) giá 250.000 ₫."));
    }

    @Test
    @DisplayName("Lịch sử: tin cửa hàng chỉ đưa phần chữ, không kèm ghi chú thẻ sản phẩm")
    void historyStoreTurnsTextOnly() {
        var card = new ChatViews.ProductCard(86, "Áo Sơ Mi", null, null);
        when(repo.messages(9, 0, 0, ChatBot.HISTORY)).thenReturn(List.of(
                new Message(1, "CUSTOMER", 5, null, "Có áo sơ mi không", null, null, null, null),
                new Message(2, "BOT", 1, null, "Có ạ", null, null, card, null),
                new Message(3, "CUSTOMER", 5, null, "Size L?", null, null, null, null)));
        ArrayNode contents = bot.history(conv, json);
        assertEquals("Có ạ", contents.get(1).path("parts").get(0).path("text").asText());
    }

    private JsonNode modelContent(String partsJson) throws Exception {
        return json.readTree("{\"role\":\"model\",\"parts\":" + partsJson + "}");
    }

    @Test
    @DisplayName("Gọi công cụ get_product rồi trả lời; tin trả lời kèm thẻ sản phẩm")
    void toolRoundThenAnswer() throws Exception {
        List<ArrayNode> sent = new ArrayList<>();
        when(shop.findProduct(7)).thenReturn(Map.of("productName", "Áo Thun Basic", "categoryName", "Áo", "description", "Cotton"));
        when(shop.findVariants(7)).thenReturn(List.of(Map.of("size", "L", "color", "Trắng", "price", 180000, "stock", 3)));
        when(gemini.generate(any(), any(), any()))
                .thenAnswer(inv -> {
                    sent.add(((ArrayNode) inv.getArgument(1)).deepCopy());
                    return sent.size() == 1
                            ? modelContent("[{\"functionCall\":{\"name\":\"get_product\",\"args\":{\"product_id\":7}},\"thoughtSignature\":\"sig\"}]")
                            : modelContent("[{\"text\":\"Dạ áo **trắng size L** còn 3 cái ạ.\"}]");
                });

        bot.reply(conv);

        verify(repo).insertMessage(9, 1, ChatBot.BOT, "Dạ áo trắng size L còn 3 cái ạ.", null, null, 7);
        // Lượt 2 gửi lại nguyên lượt của mô hình (kèm thoughtSignature) và kết quả công cụ
        ArrayNode second = sent.get(1);
        assertEquals("sig", second.get(1).path("parts").get(0).path("thoughtSignature").asText());
        JsonNode result = second.get(2).path("parts").get(0).path("functionResponse");
        assertEquals("get_product", result.path("name").asText());
        assertEquals(3, result.path("response").path("result").path("variants").get(0).path("available").asInt());
    }

    @Test
    @DisplayName("Mô hình gọi handoff_to_staff: gửi tin chuyển nhân viên và dừng")
    void handoff() throws Exception {
        when(gemini.generate(any(), any(), any()))
                .thenReturn(modelContent("[{\"functionCall\":{\"name\":\"handoff_to_staff\",\"args\":{\"reason\":\"khiếu nại\"}}}]"));
        bot.reply(conv);
        verify(repo).insertMessage(9, 1, ChatBot.HANDOFF, ChatBot.HANDOFF_TEXT, null, null, null);
        verify(repo, never()).insertMessage(anyInt(), anyInt(), eq(ChatBot.BOT), any(), any(), any(), any());
    }

    @Test
    @DisplayName("Lịch sử: gộp tin liền nhau cùng phía, bỏ lượt cửa hàng ở đầu, ảnh / thẻ ghi thành chữ")
    void history() {
        when(repo.messages(9, 0, 0, ChatBot.HISTORY)).thenReturn(List.of(
                new Message(1, "AUTO", 1, null, "Xin chào", null, null, null, null),
                new Message(2, "CUSTOMER", 5, null, "Cho mình hỏi", null, null, null, null),
                new Message(3, "CUSTOMER", 5, null, null, "https://res.cloudinary.com/a.png", null, null, null)));
        ArrayNode contents = bot.history(conv, json);
        assertEquals(1, contents.size());
        assertEquals("user", contents.get(0).path("role").asText());
        assertEquals("[Khách gửi một ảnh]", contents.get(0).path("parts").get(1).path("text").asText());
    }
}
