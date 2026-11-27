package com.thors.module.chat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.chat.ChatRepository.ActiveOrder;
import com.thors.module.chat.ChatRepository.Conversation;
import com.thors.module.chat.ChatViews.ConversationSummary;
import com.thors.module.chat.ChatViews.Message;
import com.thors.module.chat.ChatViews.SendRequest;
import com.thors.module.chat.ChatViews.Status;
import com.thors.module.chat.ChatViews.Thread;
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
import org.mockito.InOrder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Chat khách - cửa hàng (ChatService). Mỗi test ứng với một dòng UTC-CHAT-076..121 trong sheet "Chat" của
 * Report-5.1_Unit Test. DB (ChatRepository), cài đặt tin tự động và trợ lý AI được giả lập.
 */
@DisplayName("Chat khách - cửa hàng (ChatService) - Unit Test")
class ChatServiceUnitTest {
    private static final String GREETING = "Chào bạn, THORS có thể giúp gì?";
    private static final String AWAY = "Cửa hàng đang ngoài giờ làm việc (08:00 – 22:00), nhân viên sẽ trả lời bạn sớm nhất.";
    private static final String CLOUDINARY_IMG = "https://res.cloudinary.com/testcloud/image/upload/v1/thors/chat/a.png";
    /** 10:00 giờ VN = 03:00 UTC, trong giờ 08:00–22:00. */
    private static final ZonedDateTime AT_10 = ZonedDateTime.of(2026, 11, 24, 10, 0, 0, 0, ChatAutoReply.VN);
    private static final LocalDateTime AT_10_UTC = LocalDateTime.of(2026, 11, 24, 3, 0);
    /** 23:30 giờ VN = 16:30 UTC, ngoài giờ. */
    private static final ZonedDateTime AT_2330 = ZonedDateTime.of(2026, 11, 24, 23, 30, 0, 0, ChatAutoReply.VN);
    private static final LocalDateTime AT_2330_UTC = LocalDateTime.of(2026, 11, 24, 16, 30);

    private ChatRepository chats;
    private ChatAutoReply auto;
    private ChatBot bot;
    private ChatService service;

    private final Account customer = account(5, "CUSTOMER", "Nguyễn Văn A");
    private final Account owner = account(2, "OWNER", "User 2");
    private final Account family = account(10, "FAMILY_MEMBER", "User 10");
    private final Conversation conv12 = new Conversation(12, 5, 0, 0);

    private static Account account(int id, String role, String fullName) {
        return new Account(id, role, fullName, "hash", id + "@x.vn", null, null, null, "ACTIVE",
                LocalDateTime.now(), LocalDateTime.now(), null, 1L, null);
    }

    private static Message msg(long id, String side, int senderId, String senderName, String body) {
        return new Message(id, side, senderId, senderName, body, null, null, null, null);
    }

    private static void assertApi(int status, ApiException e) {
        assertEquals(status, e.status);
    }

    @BeforeEach
    void setUp() {
        chats = mock(ChatRepository.class);
        auto = mock(ChatAutoReply.class);
        bot = mock(ChatBot.class);
        when(chats.ready()).thenReturn(true);
        when(auto.greeting()).thenReturn("");
        when(auto.awayMessage(any())).thenReturn(null);
        when(bot.shouldHandle(any(), any())).thenReturn(false);
        service = new ChatService(chats, null, auto, bot);
    }

    // =================================================================== sendAsCustomer

    @Nested
    @DisplayName("ChatService.sendAsCustomer(Account actor, SendRequest r)")
    class SendAsCustomer {
        private final Message saved = msg(500, "CUSTOMER", 5, "Nguyễn Văn A", "Shop ơi, áo này còn size M không?");

        @BeforeEach
        void setUp() {
            when(chats.findOrCreate(5)).thenReturn(conv12);
            when(chats.insertMessage(anyInt(), anyInt(), anyString(), any(), any(), any(), any())).thenReturn(500L);
            when(chats.messages(12, 499, 0, 1)).thenReturn(List.of(saved));
        }

        private void assertNoInsert() {
            verify(chats, never()).insertMessage(anyInt(), anyInt(), anyString(), any(), any(), any(), any());
        }

        /** Repository thật trên JdbcTemplate giả lập, để thấy findOrCreate có chạy INSERT hay không. */
        private ChatRepository realRepo(JdbcTemplate jdbc) {
            ChatRepository repo = spy(new ChatRepository(jdbc));
            doReturn(true).when(repo).ready();
            doReturn(500L).when(repo).insertMessage(anyInt(), anyInt(), anyString(), any(), any(), any(), any());
            return repo;
        }

        @Test
        @DisplayName("UTC-CHAT-076: Khách đã có cuộc trò chuyện gửi tin chữ, bot không nhận trả lời")
        void existingConversation() {
            JdbcTemplate jdbc = mock(JdbcTemplate.class);
            ChatRepository repo = realRepo(jdbc);
            doReturn(Optional.of(conv12)).when(repo).findByCustomer(5);
            doReturn(List.of(saved)).when(repo).messages(12, 499, 0, 1);
            ChatService s = spy(new ChatService(repo, null, auto, bot));

            Message m = s.sendAsCustomer(customer, new SendRequest("Shop ơi, áo này còn size M không?", null, null, null));

            verify(repo).findOrCreate(5);
            verify(jdbc, never()).update(startsWith("INSERT IGNORE INTO chat_conversation"), eq(5));
            verify(repo).insertMessage(12, 5, "CUSTOMER", "Shop ơi, áo này còn size M không?", null, null, null);
            verify(s).autoReply(eq(conv12), eq(500L), any());
            assertEquals(ChatService.hideStaffName(saved), m);
        }

        @Test
        @DisplayName("UTC-CHAT-077: Khách chưa có cuộc trò chuyện: tạo mới rồi lưu tin")
        void newConversation() {
            JdbcTemplate jdbc = mock(JdbcTemplate.class);
            ChatRepository repo = realRepo(jdbc);
            Conversation fresh = new Conversation(13, 5, 0, 0);
            doReturn(Optional.empty(), Optional.of(fresh)).when(repo).findByCustomer(5);
            doReturn(List.of(msg(500, "CUSTOMER", 5, null, "Xin chào"))).when(repo).messages(13, 499, 0, 1);
            ChatService s = new ChatService(repo, null, auto, bot);

            s.sendAsCustomer(customer, new SendRequest("Xin chào", null, null, null));

            InOrder order = inOrder(repo, jdbc);
            order.verify(repo).findByCustomer(5);
            order.verify(jdbc).update(startsWith("INSERT IGNORE INTO chat_conversation"), eq(5));
            order.verify(repo).findByCustomer(5);
            verify(repo).insertMessage(13, 5, "CUSTOMER", "Xin chào", null, null, null);
        }

        @Test
        @DisplayName("UTC-CHAT-078: Đính kèm đơn của chính khách")
        void ownOrder() {
            when(chats.orderOwner(100)).thenReturn(Optional.of(5));
            service.sendAsCustomer(customer, new SendRequest("Đơn này bao giờ giao?", null, 100, null));
            verify(chats).insertMessage(12, 5, "CUSTOMER", "Đơn này bao giờ giao?", null, 100, null);
        }

        @Test
        @DisplayName("UTC-CHAT-079: Đơn của khách khác bị từ chối")
        void otherCustomersOrder() {
            when(chats.orderOwner(200)).thenReturn(Optional.of(9));
            ApiException e = assertThrows(ApiException.class,
                    () -> service.sendAsCustomer(customer, new SendRequest("Xem giúp đơn", null, 200, null)));
            assertApi(400, e);
            assertNoInsert();
        }

        @Test
        @DisplayName("UTC-CHAT-080: Sản phẩm không tồn tại")
        void unknownProduct() {
            when(chats.productExists(999)).thenReturn(false);
            ApiException e = assertThrows(ApiException.class,
                    () -> service.sendAsCustomer(customer, new SendRequest("Còn hàng không?", null, null, 999)));
            assertApi(400, e);
            assertNoInsert();
        }

        @Test
        @DisplayName("UTC-CHAT-081: Tin chỉ có khoảng trắng")
        void blank() {
            ApiException e = assertThrows(ApiException.class,
                    () -> service.sendAsCustomer(customer, new SendRequest("   ", null, null, null)));
            assertApi(400, e);
            assertNoInsert();
        }

        @Test
        @DisplayName("UTC-CHAT-082: Đúng 2000 ký tự vẫn lưu được")
        void exactly2000() {
            String body = "a".repeat(2000);
            service.sendAsCustomer(customer, new SendRequest(body, null, null, null));
            verify(chats).insertMessage(12, 5, "CUSTOMER", body, null, null, null);
        }

        @Test
        @DisplayName("UTC-CHAT-083: 2001 ký tự bị từ chối")
        void over2000() {
            ApiException e = assertThrows(ApiException.class,
                    () -> service.sendAsCustomer(customer, new SendRequest("a".repeat(2001), null, null, null)));
            assertApi(400, e);
            assertNoInsert();
        }

        @Test
        @DisplayName("UTC-CHAT-084: Ảnh không nằm trên res.cloudinary.com")
        void foreignImage() {
            ApiException e = assertThrows(ApiException.class,
                    () -> service.sendAsCustomer(customer, new SendRequest(null, "https://evil.example.com/a.png", null, null)));
            assertApi(400, e);
            assertNoInsert();
        }

        @Test
        @DisplayName("UTC-CHAT-085: Tin chỉ có ảnh Cloudinary")
        void imageOnly() {
            service.sendAsCustomer(customer, new SendRequest(null, CLOUDINARY_IMG, null, null));
            verify(chats).insertMessage(12, 5, "CUSTOMER", null, CLOUDINARY_IMG, null, null);
        }

        @Test
        @DisplayName("UTC-CHAT-086: Chủ shop không dùng được khung chat của khách")
        void ownerRejected() {
            ApiException e = assertThrows(ApiException.class, () -> service.sendAsCustomer(owner, new SendRequest("Xin chào", null, null, null)));
            assertApi(403, e);
            verify(chats, never()).findOrCreate(anyInt());
        }

        @Test
        @DisplayName("UTC-CHAT-087: Chưa có bảng chat")
        void notReady() {
            when(chats.ready()).thenReturn(false);
            assertThrows(ApiException.class, () -> service.sendAsCustomer(customer, new SendRequest("Xin chào", null, null, null)));
            verify(chats, never()).findOrCreate(anyInt());
            assertNoInsert();
        }

        @Test
        @DisplayName("UTC-CHAT-088: Bot nhận trả lời: chạy sau khi commit, không gọi autoReply trực tiếp")
        void botAfterCommit() {
            when(bot.shouldHandle(eq(conv12), any())).thenReturn(true);
            when(chats.messages(12, 499, 0, 1)).thenReturn(List.of(msg(500, "CUSTOMER", 5, null, "Có áo đi biển không?")));
            ChatService s = spy(service);
            TransactionSynchronizationManager.initSynchronization();
            try {
                Message m = s.sendAsCustomer(customer, new SendRequest("Có áo đi biển không?", null, null, null));
                assertEquals(500, m.id());
                assertEquals("CUSTOMER", m.side());

                List<TransactionSynchronization> syncs = TransactionSynchronizationManager.getSynchronizations();
                assertEquals(1, syncs.size());
                verify(bot, never()).replyAsync(any(), any());
                syncs.forEach(TransactionSynchronization::afterCommit);
            } finally {
                TransactionSynchronizationManager.clearSynchronization();
            }
            verify(bot).replyAsync(eq(conv12), any(Runnable.class));
            verify(s, never()).autoReply(any(), anyLong(), any());
        }
    }

    // =================================================================== autoReply

    @Nested
    @DisplayName("ChatService.autoReply(Conversation c, long messageId, ZonedDateTime now)")
    class AutoReply {
        @BeforeEach
        void setUp() {
            when(chats.storeSenderId()).thenReturn(Optional.of(2));
            when(auto.greeting()).thenReturn(GREETING);
            when(auto.awayMessage(AT_10)).thenReturn(null); // trong giờ: không có tin ngoài giờ
            when(auto.awayMessage(AT_2330)).thenReturn(AWAY);
        }

        private void assertNoAuto() {
            verify(chats, never()).storeSenderId();
            verify(chats, never()).insertMessage(anyInt(), anyInt(), anyString(), any(), any(), any(), any());
        }

        @Test
        @DisplayName("UTC-CHAT-089: Tin đầu tiên trong giờ: gửi lời chào")
        void firstMessageGreets() {
            when(chats.previousMessageAt(12, 500)).thenReturn(null);
            service.autoReply(conv12, 500, AT_10);
            verify(chats).storeSenderId();
            verify(chats, times(1)).insertMessage(12, 2, "AUTO", GREETING, null, null, null);
            verify(chats, times(1)).insertMessage(anyInt(), anyInt(), anyString(), any(), any(), any(), any());
        }

        @Test
        @DisplayName("UTC-CHAT-090: Im lặng đúng 12 giờ thì chào lại")
        void greetAgainAt12h() {
            when(chats.previousMessageAt(12, 501)).thenReturn(AT_10_UTC.minusHours(12));
            when(chats.lastAutoAt(12)).thenReturn(AT_10_UTC.minusHours(12));
            service.autoReply(conv12, 501, AT_10);
            verify(chats).insertMessage(12, 2, "AUTO", GREETING, null, null, null);
        }

        @Test
        @DisplayName("UTC-CHAT-091: Im lặng 11 giờ 59 phút thì không chào")
        void noGreetAt11h59() {
            when(chats.previousMessageAt(12, 502)).thenReturn(AT_10_UTC.minusHours(11).minusMinutes(59));
            when(chats.lastAutoAt(12)).thenReturn(AT_10_UTC.minusHours(12));
            service.autoReply(conv12, 502, AT_10);
            assertNoAuto();
        }

        @Test
        @DisplayName("UTC-CHAT-092: Ngoài giờ, chưa báo trong 3 giờ: gửi tin ngoài giờ")
        void awayMessage() {
            when(chats.previousMessageAt(12, 503)).thenReturn(AT_2330_UTC.minusMinutes(5));
            when(chats.lastAutoAt(12)).thenReturn(AT_2330_UTC.minusHours(4));
            service.autoReply(conv12, 503, AT_2330);
            verify(auto).awayMessage(AT_2330);
            verify(chats, times(1)).insertMessage(12, 2, "AUTO", AWAY, null, null, null);
            verify(chats, times(1)).insertMessage(anyInt(), anyInt(), anyString(), any(), any(), any(), any());
        }

        @Test
        @DisplayName("UTC-CHAT-093: Đã báo ngoài giờ 2 giờ trước thì không báo lại")
        void awayAlreadySent() {
            when(chats.previousMessageAt(12, 504)).thenReturn(AT_2330_UTC.minusMinutes(5));
            when(chats.lastAutoAt(12)).thenReturn(AT_2330_UTC.minusHours(2));
            service.autoReply(conv12, 504, AT_2330);
            verify(chats, never()).insertMessage(anyInt(), anyInt(), anyString(), any(), any(), any(), any());
        }

        @Test
        @DisplayName("UTC-CHAT-094: Lời chào đã tắt")
        void greetingDisabled() {
            when(auto.greeting()).thenReturn("");
            when(chats.previousMessageAt(12, 505)).thenReturn(null);
            service.autoReply(conv12, 505, AT_10);
            assertNoAuto();
        }

        @Test
        @DisplayName("UTC-CHAT-095: Tin đầu tiên ngoài giờ: chào rồi báo ngoài giờ")
        void greetThenAway() {
            when(chats.previousMessageAt(12, 506)).thenReturn(null);
            when(chats.lastAutoAt(12)).thenReturn(null);
            service.autoReply(conv12, 506, AT_2330);
            InOrder order = inOrder(chats);
            order.verify(chats).insertMessage(12, 2, "AUTO", GREETING, null, null, null);
            order.verify(chats).insertMessage(12, 2, "AUTO", AWAY, null, null, null);
            verify(chats, times(2)).insertMessage(anyInt(), anyInt(), eq("AUTO"), any(), any(), any(), any());
        }

        @Test
        @DisplayName("UTC-CHAT-096: Không có tài khoản Owner thì bỏ qua, không lỗi")
        void noOwner() {
            when(chats.storeSenderId()).thenReturn(Optional.empty());
            when(chats.previousMessageAt(12, 507)).thenReturn(null);
            service.autoReply(conv12, 507, AT_10);
            verify(chats, never()).insertMessage(anyInt(), anyInt(), anyString(), any(), any(), any(), any());
        }
    }

    // =================================================================== status / myThread

    /** 40 tin, xen kẽ khách và nhân viên 'User 2', id 461..500. */
    private static List<Message> page40() {
        List<Message> out = new ArrayList<>();
        for (int i = 0; i < 40; i++) {
            long id = 461 + i;
            out.add(i % 2 == 0 ? msg(id, "CUSTOMER", 5, "Nguyễn Văn A", "Khách " + id) : msg(id, "STORE", 2, "User 2", "Shop " + id));
        }
        return out;
    }

    @Nested
    @DisplayName("ChatService.status(Account actor) / ChatService.myThread(Account actor, long before, long after)")
    class StatusAndMyThread {
        @Test
        @DisplayName("UTC-CHAT-097: Số tin cửa hàng chưa đọc của khách")
        void unread() {
            when(chats.unreadForCustomer(5)).thenReturn(3);
            Status st = service.status(customer);
            verify(chats).unreadForCustomer(5);
            assertEquals(3, st.unread());
        }

        @Test
        @DisplayName("UTC-CHAT-098: Tải lần đầu: trang tin mới nhất, ẩn tên nhân viên")
        void firstLoad() {
            when(chats.findByCustomer(5)).thenReturn(Optional.of(conv12));
            when(chats.messages(12, 0, 0, ChatService.PAGE)).thenReturn(page40());
            when(chats.hasOlder(12, 461)).thenReturn(true);
            when(chats.customerName(5)).thenReturn("Nguyễn Văn A");

            Thread t = service.myThread(customer, 0, 0);

            verify(chats).messages(12, 0, 0, ChatService.PAGE);
            verify(chats).hasOlder(12, 461);
            verify(chats).customerName(5);
            assertEquals(12, t.conversationId());
            assertEquals("Nguyễn Văn A", t.customerName());
            assertEquals(40, t.messages().size());
            assertTrue(t.hasMore());
            t.messages().stream().filter(m -> "STORE".equals(m.side())).forEach(m -> {
                assertNull(m.senderName());
                assertEquals(0, m.senderId());
            });
        }

        @Test
        @DisplayName("UTC-CHAT-099: Chưa có cuộc trò chuyện: trả khung rỗng")
        void noConversation() {
            when(chats.findByCustomer(5)).thenReturn(Optional.empty());
            Thread t = service.myThread(customer, 0, 0);
            assertEquals(new Thread(null, "Nguyễn Văn A", List.of(), 0, false), t);
            verify(chats, never()).messages(anyInt(), anyLong(), anyLong(), anyInt());
        }

        @Test
        @DisplayName("UTC-CHAT-100: Tự cập nhật sau tin 500: chỉ lấy tin mới")
        void onlyNewer() {
            Conversation c = new Conversation(12, 5, 0, 501);
            when(chats.findByCustomer(5)).thenReturn(Optional.of(c));
            when(chats.messages(12, 500, 0, ChatService.PAGE)).thenReturn(List.of(msg(501, "STORE", 2, "User 2", "Dạ còn ạ")));

            // after = 500, before = 0 (ChatService.myThread(actor, afterId, beforeId))
            Thread t = service.myThread(customer, 500, 0);

            verify(chats).messages(12, 500, 0, ChatService.PAGE);
            assertEquals(List.of(501L), t.messages().stream().map(Message::id).toList());
            assertEquals(501, t.otherLastReadId());
        }

        @Test
        @DisplayName("UTC-CHAT-101: Chủ shop không xem được khung chat của khách")
        void ownerRejected() {
            ApiException e = assertThrows(ApiException.class, () -> service.myThread(owner, 0, 0));
            assertApi(403, e);
            verify(chats, never()).findByCustomer(anyInt());
        }
    }

    // =================================================================== readAsCustomer

    @Nested
    @DisplayName("ChatService.readAsCustomer(Account actor, long lastId)")
    class ReadAsCustomer {
        @Test
        @DisplayName("UTC-CHAT-102: Đánh dấu đã đọc tới tin 501")
        void markRead() {
            when(chats.findByCustomer(5)).thenReturn(Optional.of(conv12));
            service.readAsCustomer(customer, 501);
            verify(chats, times(1)).markRead(12, "CUSTOMER", 501);
        }

        @Test
        @DisplayName("UTC-CHAT-103: Chưa có cuộc trò chuyện thì không làm gì")
        void noConversation() {
            when(chats.findByCustomer(5)).thenReturn(Optional.empty());
            service.readAsCustomer(customer, 501);
            verify(chats, never()).markRead(anyInt(), anyString(), anyLong());
        }
    }

    // =================================================================== faqs / askFaq

    @Nested
    @DisplayName("ChatService.faqs(Account actor) / ChatService.askFaq(Account actor, String id)")
    class Faqs {
        private static final String FREESHIP = "Đơn từ 500.000 ₫ được miễn phí giao hàng.";

        @BeforeEach
        void setUp() {
            when(auto.faqs()).thenReturn(List.of(
                    new ChatAutoReply.Faq("orders", "Đơn hàng của tôi tới đâu rồi?", null),
                    new ChatAutoReply.Faq("faq-0", "Có freeship không?", FREESHIP)));
            when(chats.storeSenderId()).thenReturn(Optional.of(2));
            when(chats.findOrCreate(5)).thenReturn(conv12);
            when(chats.insertMessage(eq(12), eq(5), eq("CUSTOMER"), any(), any(), any(), any())).thenReturn(600L);
            when(chats.insertMessage(eq(12), eq(2), eq("AUTO"), any(), any(), any(), any())).thenReturn(601L);
        }

        @Test
        @DisplayName("UTC-CHAT-104: Danh sách câu hỏi, không kèm đáp án")
        void list() {
            List<Map<String, String>> out = service.faqs(customer);
            assertEquals(List.of(
                    Map.of("id", "orders", "question", "Đơn hàng của tôi tới đâu rồi?"),
                    Map.of("id", "faq-0", "question", "Có freeship không?")), out);
            assertTrue(out.stream().noneMatch(m -> m.containsKey("answer")));
        }

        @Test
        @DisplayName("UTC-CHAT-105: Bấm câu hỏi freeship: lưu câu hỏi và câu trả lời tự động")
        void askFreeship() {
            Message q = msg(600, "CUSTOMER", 5, "Nguyễn Văn A", "Có freeship không?");
            Message a = msg(601, "AUTO", 2, "User 2", FREESHIP);
            when(chats.messages(12, 599, 0, ChatService.PAGE)).thenReturn(List.of(q, a));

            List<Message> out = service.askFaq(customer, "faq-0");

            verify(chats).insertMessage(12, 5, "CUSTOMER", "Có freeship không?", null, null, null);
            verify(chats).insertMessage(12, 2, "AUTO", FREESHIP, null, null, null);
            assertEquals(2, out.size());
            assertEquals(600, out.get(0).id());
            assertEquals("Có freeship không?", out.get(0).body());
            assertEquals(601, out.get(1).id());
            assertEquals(FREESHIP, out.get(1).body());
        }

        @Test
        @DisplayName("UTC-CHAT-106: Hỏi đơn hàng: trả lời theo đơn đang giao")
        void askOrders() {
            when(chats.activeOrders(5, 5)).thenReturn(List.of(new ActiveOrder("ORD-100", "SHIPPING", null, "GHN", "GHN123")));
            service.askFaq(customer, "orders");
            verify(chats).activeOrders(5, 5);
            ArgumentCaptor<String> answer = ArgumentCaptor.forClass(String.class);
            verify(chats).insertMessage(eq(12), eq(2), eq("AUTO"), answer.capture(), any(), any(), any());
            assertTrue(answer.getValue().contains("ORD-100"), answer.getValue());
            assertTrue(answer.getValue().contains("đang được giao đến bạn"), answer.getValue());
            assertTrue(answer.getValue().contains("GHN123"), answer.getValue());
        }

        @Test
        @DisplayName("UTC-CHAT-107: Hỏi đơn hàng khi không có đơn đang xử lý")
        void askOrdersNone() {
            when(chats.activeOrders(5, 5)).thenReturn(List.of());
            service.askFaq(customer, "orders");
            verify(chats).insertMessage(12, 5, "CUSTOMER", "Đơn hàng của tôi tới đâu rồi?", null, null, null);
            ArgumentCaptor<String> answer = ArgumentCaptor.forClass(String.class);
            verify(chats, times(1)).insertMessage(eq(12), eq(2), eq("AUTO"), answer.capture(), any(), any(), any());
            assertTrue(answer.getValue().contains("không có đơn hàng nào đang xử lý"), answer.getValue());
        }

        @Test
        @DisplayName("UTC-CHAT-108: Câu hỏi không còn")
        void unknownFaq() {
            ApiException e = assertThrows(ApiException.class, () -> service.askFaq(customer, "faq-99"));
            assertEquals(404, e.status);
            assertEquals("FAQ_NOT_FOUND", e.code);
            verify(chats, never()).insertMessage(anyInt(), anyInt(), anyString(), any(), any(), any(), any());
        }
    }

    // =================================================================== conversations

    private static ConversationSummary summary(int id, String name, int unread) {
        return new ConversationSummary(id, id + 100, name, id + "@x.vn", null, "Xin chào", "CUSTOMER", AT_10_UTC, unread);
    }

    @Nested
    @DisplayName("ChatService.conversations(Account actor, String q)")
    class Conversations {
        @Test
        @DisplayName("UTC-CHAT-109: Chủ shop xem danh sách cuộc trò chuyện")
        void list() {
            when(chats.conversations(null, 200)).thenReturn(List.of(
                    summary(12, "Nguyễn Văn A", 2), summary(13, "Trần Thị B", 0), summary(14, "Lê Văn C", 0)));
            List<ConversationSummary> out = service.conversations(owner, null);
            verify(chats).conversations(null, 200);
            assertEquals(3, out.size());
            assertEquals(2, out.stream().filter(c -> c.id() == 12).findFirst().orElseThrow().unread());
        }

        @Test
        @DisplayName("UTC-CHAT-110: Người nhà tìm theo tên khách")
        void search() {
            when(chats.conversations("Nguyễn", 200)).thenReturn(List.of(summary(12, "Nguyễn Văn A", 2)));
            List<ConversationSummary> out = service.conversations(family, "Nguyễn");
            verify(chats).conversations("Nguyễn", 200);
            assertFalse(out.isEmpty());
            assertTrue(out.stream().allMatch(c -> c.customerName().contains("Nguyễn")));
        }

        @Test
        @DisplayName("UTC-CHAT-111: Từ khóa đúng 100 ký tự")
        void query100() {
            String q = "a".repeat(100);
            service.conversations(owner, q);
            verify(chats).conversations(eq(q), anyInt());
        }

        @Test
        @DisplayName("UTC-CHAT-112: Từ khóa 101 ký tự bị từ chối")
        void query101() {
            ApiException e = assertThrows(ApiException.class, () -> service.conversations(owner, "a".repeat(101)));
            assertApi(400, e);
            verify(chats, never()).conversations(any(), anyInt());
        }

        @Test
        @DisplayName("UTC-CHAT-113: Khách không xem được danh sách")
        void customerRejected() {
            ApiException e = assertThrows(ApiException.class, () -> service.conversations(customer, null));
            assertApi(403, e);
            verify(chats, never()).conversations(any(), anyInt());
        }
    }

    // =================================================================== storeThread / readAsStore

    @Nested
    @DisplayName("ChatService.storeThread(Account actor, int conversationId, long before, long after) / readAsStore(Account actor, int conversationId, long lastId)")
    class StoreThread {
        @Test
        @DisplayName("UTC-CHAT-114: Cửa hàng xem cuộc trò chuyện, thấy tên nhân viên")
        void firstLoad() {
            when(chats.find(12)).thenReturn(Optional.of(conv12));
            when(chats.messages(12, 0, 0, ChatService.PAGE)).thenReturn(page40());
            when(chats.hasOlder(12, 461)).thenReturn(true);
            when(chats.customerName(5)).thenReturn("Nguyễn Văn A");

            Thread t = service.storeThread(owner, 12, 0, 0);

            verify(chats).find(12);
            verify(chats).messages(12, 0, 0, ChatService.PAGE);
            verify(chats).hasOlder(12, 461);
            verify(chats).customerName(5);
            assertEquals(page40(), t.messages());
            assertEquals("Nguyễn Văn A", t.customerName());
            assertTrue(t.messages().stream().filter(m -> "STORE".equals(m.side())).allMatch(m -> "User 2".equals(m.senderName())));
        }

        @Test
        @DisplayName("UTC-CHAT-115: Không có cuộc trò chuyện 999")
        void notFound() {
            when(chats.find(999)).thenReturn(Optional.empty());
            ApiException e = assertThrows(ApiException.class, () -> service.storeThread(owner, 999, 0, 0));
            assertApi(404, e);
        }

        @Test
        @DisplayName("UTC-CHAT-116: Tự cập nhật sau tin 500: chỉ lấy tin mới")
        void onlyNewer() {
            Conversation c = new Conversation(12, 5, 502, 0);
            when(chats.find(12)).thenReturn(Optional.of(c));
            when(chats.messages(12, 500, 0, ChatService.PAGE)).thenReturn(List.of(msg(502, "CUSTOMER", 5, "Nguyễn Văn A", "Còn size M không?")));

            // after = 500, before = 0 (ChatService.storeThread(actor, id, afterId, beforeId))
            Thread t = service.storeThread(owner, 12, 500, 0);

            verify(chats).messages(12, 500, 0, ChatService.PAGE);
            assertEquals(List.of(502L), t.messages().stream().map(Message::id).toList());
            assertEquals(502, t.otherLastReadId());
        }

        @Test
        @DisplayName("UTC-CHAT-117: Cửa hàng đánh dấu đã đọc tới tin 502")
        void readAsStore() {
            when(chats.find(12)).thenReturn(Optional.of(conv12));
            service.readAsStore(owner, 12, 502);
            verify(chats, times(1)).markRead(12, "STORE", 502);
        }
    }

    // =================================================================== quickReplies / sendAsStore

    @Nested
    @DisplayName("ChatService.quickReplies(Account actor) / ChatService.sendAsStore(Account actor, int conversationId, SendRequest r)")
    class StoreSend {
        @BeforeEach
        void setUp() {
            when(chats.find(12)).thenReturn(Optional.of(conv12));
            when(chats.insertMessage(anyInt(), anyInt(), anyString(), any(), any(), any(), any())).thenReturn(500L);
        }

        @Test
        @DisplayName("UTC-CHAT-118: Mẫu câu trả lời nhanh")
        void quickReplies() {
            List<String> replies = List.of("Dạ shop chào bạn ạ", "Dạ sản phẩm còn hàng ạ");
            when(auto.quickReplies()).thenReturn(replies);
            assertEquals(replies, service.quickReplies(owner));
        }

        @Test
        @DisplayName("UTC-CHAT-119: Khách không lấy được mẫu câu")
        void quickRepliesCustomer() {
            ApiException e = assertThrows(ApiException.class, () -> service.quickReplies(customer));
            assertApi(403, e);
        }

        @Test
        @DisplayName("UTC-CHAT-120: Chủ shop gửi tin kèm thẻ sản phẩm")
        void ownerSendsProduct() {
            Message saved = new Message(500, "STORE", 2, "User 2", "Mẫu này còn size M ạ", null, null, null, null);
            when(chats.productExists(3)).thenReturn(true);
            when(chats.messages(12, 499, 0, 1)).thenReturn(List.of(saved));
            Message m = service.sendAsStore(owner, 12, new SendRequest("Mẫu này còn size M ạ", null, null, 3));
            verify(chats).insertMessage(12, 2, "STORE", "Mẫu này còn size M ạ", null, null, 3);
            assertSame(saved, m);
        }

        @Test
        @DisplayName("UTC-CHAT-121: Người nhà gửi được")
        void familySends() {
            when(chats.messages(12, 499, 0, 1)).thenReturn(List.of(msg(500, "STORE", 10, "User 10", "Dạ còn ạ")));
            service.sendAsStore(family, 12, new SendRequest("Dạ còn ạ", null, null, null));
            verify(chats).insertMessage(12, 10, "STORE", "Dạ còn ạ", null, null, null);
        }

        @Test
        @DisplayName("UTC-CHAT-122: Đơn không thuộc khách trong cuộc chat")
        void otherCustomersOrder() {
            when(chats.orderOwner(200)).thenReturn(Optional.of(9));
            ApiException e = assertThrows(ApiException.class,
                    () -> service.sendAsStore(owner, 12, new SendRequest("Đơn của bạn", null, 200, null)));
            assertApi(400, e);
            verify(chats, never()).insertMessage(anyInt(), anyInt(), anyString(), any(), any(), any(), any());
        }

        @Test
        @DisplayName("UTC-CHAT-123: Không có cuộc trò chuyện 999")
        void notFound() {
            when(chats.find(999)).thenReturn(Optional.empty());
            ApiException e = assertThrows(ApiException.class,
                    () -> service.sendAsStore(owner, 999, new SendRequest("Xin chào", null, null, null)));
            assertApi(404, e);
        }
    }

    @AfterEach
    void cleanSync() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) TransactionSynchronizationManager.clearSynchronization();
    }
}
