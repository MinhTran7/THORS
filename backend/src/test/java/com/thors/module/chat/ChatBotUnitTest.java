package com.thors.module.chat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.thors.module.chat.ChatRepository.Conversation;
import com.thors.module.chat.ChatViews.Message;
import com.thors.module.chat.GeminiClient.GeminiException;
import com.thors.module.order.delivery.GhnClient;
import com.thors.module.shop.repository.ShopRepository;
import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * Trợ lý AI (ChatBot): vòng gọi Gemini, khi nào nhận trả lời, đỡ lời khi nhân viên chưa trả lời. Mỗi test ứng với một
 * dòng UTC-CHAT-124..142 trong sheet "Chat" của Report-5.1_Unit Test. Gemini và DB được giả lập, không gọi mạng.
 */
@DisplayName("Trợ lý AI (ChatBot) - Unit Test")
class ChatBotUnitTest {
    private static final long WAIT_MS = 3000;
    /** 10:00 giờ VN = 03:00 UTC. */
    private static final ZonedDateTime AT_10 = ZonedDateTime.of(2026, 11, 24, 10, 0, 0, 0, ChatAutoReply.VN);
    private static final LocalDateTime AT_10_UTC = LocalDateTime.of(2026, 11, 24, 3, 0);
    /** 00:00 ngày 24/11 giờ VN = 17:00 ngày 23/11 UTC. */
    private static final LocalDateTime TODAY_UTC = LocalDateTime.of(2026, 11, 23, 17, 0);
    private static final ZonedDateTime AT_2330 = ZonedDateTime.of(2026, 11, 24, 23, 30, 0, 0, ChatAutoReply.VN);

    private final ObjectMapper json = new ObjectMapper();
    private final Conversation conv12 = new Conversation(12, 5, 0, 0);
    private ChatRepository chats;
    private ChatAutoReply settings;
    private GeminiClient gemini;
    private ShopRepository shop;
    private ChatKnowledge knowledge;
    private ChatBot bot;

    @BeforeEach
    void setUp() {
        chats = mock(ChatRepository.class);
        settings = mock(ChatAutoReply.class);
        gemini = mock(GeminiClient.class);
        shop = mock(ShopRepository.class);
        knowledge = mock(ChatKnowledge.class);
        bot = new ChatBot(chats, settings, gemini, shop, knowledge, mock(GhnClient.class));
        when(gemini.configured()).thenReturn(true);
        when(gemini.json()).thenReturn(json);
        when(settings.workingHoursText()).thenReturn("08:00 – 22:00");
        when(settings.faqs()).thenReturn(List.of());
        when(settings.botDailyLimit()).thenReturn(200);
        when(chats.ready()).thenReturn(true);
        when(chats.storeSenderId()).thenReturn(Optional.of(2));
    }

    @AfterEach
    void tearDown() {
        bot.stop();
    }

    private JsonNode model(String partsJson) throws Exception {
        return json.readTree("{\"role\":\"model\",\"parts\":" + partsJson + "}");
    }

    private static Message msg(long id, String side, String body) {
        return new Message(id, side, "CUSTOMER".equals(side) ? 5 : 2, null, body, null, null, null, null);
    }

    // =================================================================== reply

    @Nested
    @DisplayName("ChatBot.reply(Conversation c)")
    class Reply {
        private Runnable fallback;

        @BeforeEach
        void setUp() {
            fallback = mock(Runnable.class);
            when(chats.messages(12, 0, 0, ChatBot.HISTORY)).thenReturn(List.of(
                    msg(1, "CUSTOMER", "Shop có áo đi biển không?"),
                    msg(2, "BOT", "Bạn muốn áo màu gì ạ?"),
                    msg(3, "CUSTOMER", "Màu trắng nhé")));
        }

        @Test
        @DisplayName("UTC-CHAT-124: Gemini trả lời bằng chữ ngay lượt đầu")
        void textFirstRound() throws Exception {
            String text = "Chào bạn, shop có áo linen đi biển ạ.";
            when(gemini.generate(any(), any(), any())).thenReturn(model("[{\"text\":\"" + text + "\"}]"));

            bot.replyAsync(conv12, fallback);

            verify(chats, timeout(WAIT_MS)).insertMessage(12, 2, ChatBot.BOT, text, null, null, null);
            ArgumentCaptor<String> system = ArgumentCaptor.forClass(String.class);
            ArgumentCaptor<ArrayNode> tools = ArgumentCaptor.forClass(ArrayNode.class);
            verify(gemini, times(1)).generate(system.capture(), any(), tools.capture());
            assertNotNull(system.getValue());
            assertTrue(system.getValue().contains("THORS"));
            assertEquals(ChatBot.toolDeclarations(json), tools.getValue());
            verify(fallback, never()).run();
        }

        @Test
        @DisplayName("UTC-CHAT-125: Gọi search_products rồi trả lời")
        void toolThenText() throws Exception {
            ChatBot s = spy(bot);
            List<ArrayNode> sent = new ArrayList<>();
            when(gemini.generate(any(), any(), any())).thenAnswer(inv -> {
                sent.add(((ArrayNode) inv.getArgument(1)).deepCopy());
                return sent.size() == 1
                        ? model("[{\"functionCall\":{\"name\":\"search_products\",\"args\":{\"query\":\"áo đi biển\"}}}]")
                        : model("[{\"text\":\"Shop có áo linen đi biển ạ.\"}]");
            });

            s.reply(conv12);

            verify(s).runTool(eq("search_products"), argThat(a -> "áo đi biển".equals(a.path("query").asText())), eq(5), any());
            verify(gemini, times(2)).generate(any(), any(), any());
            JsonNode last = sent.get(1).get(sent.get(1).size() - 1);
            assertEquals("search_products", last.path("parts").get(0).path("functionResponse").path("name").asText());
            verify(chats, times(1)).insertMessage(eq(12), eq(2), eq(ChatBot.BOT), any(), any(), any(), any());
        }

        @Test
        @DisplayName("UTC-CHAT-126: Gemini chuyển cho nhân viên")
        void handoff() throws Exception {
            when(gemini.generate(any(), any(), any()))
                    .thenReturn(model("[{\"functionCall\":{\"name\":\"handoff_to_staff\",\"args\":{\"reason\":\"khiếu nại\"}}}]"));

            bot.replyAsync(conv12, fallback);

            verify(chats, timeout(WAIT_MS)).insertMessage(eq(12), eq(2), eq(ChatBot.HANDOFF), any(), any(), any(), any());
            verify(gemini, times(1)).generate(any(), any(), any());
            verify(chats, never()).insertMessage(anyInt(), anyInt(), eq(ChatBot.BOT), any(), any(), any(), any());
            verify(fallback, never()).run();
        }

        @Test
        @DisplayName("UTC-CHAT-127: Chỉ lấy 12 tin gần nhất, gộp lượt user / model")
        void historyLimit() throws Exception {
            String[] sides = {"CUSTOMER", "CUSTOMER", "STORE", "STORE", "CUSTOMER", "CUSTOMER", "BOT", "BOT", "CUSTOMER", "CUSTOMER", "STORE", "CUSTOMER"};
            List<Message> last12 = new ArrayList<>();
            for (int i = 0; i < sides.length; i++) last12.add(msg(19 + i, sides[i], "Tin " + (19 + i)));
            when(chats.messages(12, 0, 0, ChatBot.HISTORY)).thenReturn(last12);
            List<ArrayNode> sent = new ArrayList<>();
            when(gemini.generate(any(), any(), any())).thenAnswer(inv -> {
                sent.add(((ArrayNode) inv.getArgument(1)).deepCopy());
                return model("[{\"text\":\"Dạ ạ.\"}]");
            });

            bot.reply(conv12);

            assertEquals(12, ChatBot.HISTORY);
            verify(chats).messages(12, 0, 0, 12);
            verify(chats, never()).messages(anyInt(), anyLong(), anyLong(), eq(30));
            ArrayNode contents = sent.get(0);
            assertEquals(7, contents.size());
            int parts = 0;
            for (int i = 0; i < contents.size(); i++) {
                assertEquals(i % 2 == 0 ? "user" : "model", contents.get(i).path("role").asText());
                parts += contents.get(i).path("parts").size();
            }
            assertEquals(12, parts);
        }

        @Test
        @DisplayName("UTC-CHAT-128: Gemini gọi công cụ cả 7 lượt: lượt cuối tắt công cụ, rồi gửi tin tự động")
        void tooManyRounds() throws Exception {
            JsonNode call = model("[{\"functionCall\":{\"name\":\"search_products\",\"args\":{\"query\":\"x\"}}}]");
            when(gemini.generate(any(), any(), any())).thenReturn(call);
            when(gemini.generate(any(), any(), any(), eq(false))).thenReturn(call);

            bot.replyAsync(conv12, fallback);

            verify(fallback, timeout(WAIT_MS).times(1)).run();
            verify(gemini, times(6)).generate(any(), any(), any());
            verify(gemini, times(1)).generate(any(), any(), any(), eq(false));
            verify(chats, never()).insertMessage(anyInt(), anyInt(), eq(ChatBot.BOT), any(), any(), any(), any());
            assertTrue(bot.lastEvent() != null && bot.lastEvent().contains("Cuộc chat 12: lỗi"), bot.lastEvent());
        }

        @Test
        @DisplayName("UTC-CHAT-129: Gemini hết hạn mức (429): ghi lỗi và gửi tin tự động")
        void quota() {
            when(gemini.generate(any(), any(), any())).thenThrow(new GeminiException("Gemini trả lỗi HTTP 429: quota", true));

            bot.replyAsync(conv12, fallback);

            verify(fallback, timeout(WAIT_MS).times(1)).run();
            assertTrue(bot.lastEvent().contains("Gemini trả lỗi HTTP 429: quota"), bot.lastEvent());
            verify(chats, never()).insertMessage(anyInt(), anyInt(), eq(ChatBot.BOT), any(), any(), any(), any());
        }

        @Test
        @DisplayName("UTC-CHAT-130: Gemini trả chữ rỗng")
        void blankText() throws Exception {
            when(gemini.generate(any(), any(), any())).thenReturn(model("[{\"text\":\"   \"}]"));

            bot.replyAsync(conv12, fallback);

            verify(fallback, timeout(WAIT_MS)).run();
            verify(chats, never()).insertMessage(anyInt(), anyInt(), eq(ChatBot.BOT), any(), any(), any(), any());
        }
    }

    // =================================================================== shouldHandle

    @Nested
    @DisplayName("ChatBot.shouldHandle(Conversation c, ZonedDateTime now)")
    class ShouldHandle {
        @BeforeEach
        void setUp() {
            when(settings.botMode()).thenReturn(ChatAutoReply.BOT_ALWAYS);
            when(settings.withinWorkingHours(any())).thenReturn(true);
        }

        @Test
        @DisplayName("UTC-CHAT-131: Chưa có Gemini API key")
        void noKey() {
            when(gemini.configured()).thenReturn(false);
            assertFalse(bot.shouldHandle(conv12, AT_10));
            assertTrue(bot.lastEvent().contains("chưa có Gemini API key"), bot.lastEvent());
            verifyNoInteractions(chats);
        }

        @Test
        @DisplayName("UTC-CHAT-132: Trợ lý đang tắt")
        void off() {
            when(settings.botMode()).thenReturn(ChatAutoReply.BOT_OFF);
            assertFalse(bot.shouldHandle(conv12, AT_10));
        }

        @Test
        @DisplayName("UTC-CHAT-133: Chế độ Chỉ ngoài giờ, đang trong giờ")
        void awayWithinHours() {
            when(settings.botMode()).thenReturn(ChatAutoReply.BOT_AWAY);
            when(settings.withinWorkingHours(AT_10)).thenReturn(true);
            assertFalse(bot.shouldHandle(conv12, AT_10));
        }

        @Test
        @DisplayName("UTC-CHAT-134: Chế độ Chỉ ngoài giờ, đang ngoài giờ")
        void awayOutsideHours() {
            when(settings.botMode()).thenReturn(ChatAutoReply.BOT_AWAY);
            when(settings.withinWorkingHours(AT_2330)).thenReturn(false);
            when(chats.lastSideAt(12, ChatService.STORE)).thenReturn(null);
            when(chats.lastSideAt(12, ChatBot.HANDOFF)).thenReturn(null);
            when(chats.countSideSince(eq(ChatBot.BOT), any(), any())).thenReturn(0);
            assertTrue(bot.shouldHandle(conv12, AT_2330));
        }

        @Test
        @DisplayName("UTC-CHAT-135: Nhân viên trả lời 29 phút trước")
        void staff29() {
            when(chats.lastSideAt(12, ChatService.STORE)).thenReturn(AT_10_UTC.minusMinutes(29));
            assertFalse(bot.shouldHandle(conv12, AT_10));
        }

        @Test
        @DisplayName("UTC-CHAT-136: Nhân viên trả lời 31 phút trước")
        void staff31() {
            when(chats.lastSideAt(12, ChatService.STORE)).thenReturn(AT_10_UTC.minusMinutes(31));
            assertTrue(bot.shouldHandle(conv12, AT_10));
        }

        @Test
        @DisplayName("UTC-CHAT-137: Hết hạn mức cả cửa hàng trong ngày")
        void shopDailyLimit() {
            when(chats.countSideSince(eq(ChatBot.BOT), eq(TODAY_UTC), isNull())).thenReturn(200);
            assertFalse(bot.shouldHandle(conv12, AT_10));
            assertTrue(bot.lastEvent().contains("hết giới hạn tin trong ngày của cửa hàng"), bot.lastEvent());
        }

        @Test
        @DisplayName("UTC-CHAT-138: Cuộc chat đã đủ 30 tin trợ lý")
        void conversationLimit30() {
            when(chats.countSideSince(eq(ChatBot.BOT), eq(TODAY_UTC), isNull())).thenReturn(0);
            when(chats.countSideSince(ChatBot.BOT, TODAY_UTC, 12)).thenReturn(30);
            assertFalse(bot.shouldHandle(conv12, AT_10));
        }

        @Test
        @DisplayName("UTC-CHAT-139: Cuộc chat mới có 29 tin trợ lý")
        void conversationLimit29() {
            when(chats.countSideSince(eq(ChatBot.BOT), eq(TODAY_UTC), isNull())).thenReturn(0);
            when(chats.countSideSince(ChatBot.BOT, TODAY_UTC, 12)).thenReturn(29);
            assertTrue(bot.shouldHandle(conv12, AT_10));
        }

        @Test
        @DisplayName("UTC-CHAT-140: Đã chuyển cho nhân viên")
        void handedOff() {
            when(chats.lastSideAt(12, ChatBot.HANDOFF)).thenReturn(AT_10_UTC.minusHours(1));
            assertFalse(bot.shouldHandle(conv12, AT_10));
            assertTrue(bot.lastEvent().contains("đã chuyển cho nhân viên"), bot.lastEvent());
        }
    }

    // =================================================================== answerWaiting

    @Nested
    @DisplayName("ChatBot.answerWaiting(ZonedDateTime now)")
    class AnswerWaiting {
        private ChatBot s;

        @BeforeEach
        void setUp() {
            when(settings.botMode()).thenReturn(ChatAutoReply.BOT_ALWAYS);
            when(settings.botWaitMinutes()).thenReturn(10);
            when(chats.unanswered(any(), any())).thenReturn(List.of(new ChatRepository.Waiting(12, 600)));
            when(chats.find(12)).thenReturn(Optional.of(conv12));
            s = spy(bot);
            doNothing().when(s).reply(any());
        }

        @SuppressWarnings("unchecked")
        private Map<Integer, Long> tried() throws Exception {
            Field f = ChatBot.class.getDeclaredField("tried");
            f.setAccessible(true);
            return (Map<Integer, Long>) f.get(s);
        }

        @Test
        @DisplayName("UTC-CHAT-141: Khách chờ quá 10 phút: trợ lý trả lời thay")
        void answers() throws Exception {
            s.answerWaiting(AT_10);
            verify(chats).find(12);
            verify(chats).lastSideAt(12, ChatService.STORE);
            verify(s, timeout(WAIT_MS).times(1)).reply(conv12);
            assertEquals(600L, tried().get(12));
        }

        @Test
        @DisplayName("UTC-CHAT-142: Tin 600 đã thử ở lần chạy trước")
        void alreadyTried() throws Exception {
            tried().put(12, 600L);
            s.answerWaiting(AT_10.plusMinutes(1));
            verify(chats, never()).find(anyInt());
            Thread.sleep(200);
            verify(s, never()).reply(any());
        }

        @Test
        @DisplayName("UTC-CHAT-143: Đã chuyển cho nhân viên: không trả lời thay")
        void blocked() throws Exception {
            when(chats.lastSideAt(12, ChatBot.HANDOFF)).thenReturn(AT_10_UTC.minusMinutes(20));
            s.answerWaiting(AT_10);
            assertTrue(s.lastEvent() != null && s.lastEvent().contains("đã chuyển cho nhân viên"), s.lastEvent());
            Thread.sleep(200);
            verify(s, never()).reply(any());
        }

        @Test
        @DisplayName("UTC-CHAT-144: Chưa có Gemini API key: thoát ngay")
        void noKey() throws Exception {
            when(gemini.configured()).thenReturn(false);
            s.answerWaiting(AT_10);
            verify(chats, never()).unanswered(any(), any());
            Thread.sleep(200);
            verify(s, never()).reply(any());
        }
    }
}
