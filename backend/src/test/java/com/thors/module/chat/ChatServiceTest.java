package com.thors.module.chat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.chat.ChatRepository.Conversation;
import com.thors.module.chat.ChatViews.Message;
import com.thors.module.chat.ChatViews.SendRequest;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ChatServiceTest {
    private ChatRepository repo;
    private ChatAutoReply auto;
    private ChatService service;
    private final Account customer = account(5, "CUSTOMER");
    private final Account owner = account(1, "OWNER");

    private static Account account(int id, String role) {
        return new Account(id, role, "Tên " + id, "hash", id + "@x.vn", null, null, null, "ACTIVE",
                LocalDateTime.now(), LocalDateTime.now(), null, 1L, null);
    }

    @BeforeEach
    void setUp() {
        repo = mock(ChatRepository.class);
        auto = mock(ChatAutoReply.class);
        when(auto.greeting()).thenReturn("");
        service = new ChatService(repo, null, auto);
        when(repo.ready()).thenReturn(true);
        when(repo.findOrCreate(5)).thenReturn(new Conversation(9, 5, 0, 0));
        when(repo.find(9)).thenReturn(Optional.of(new Conversation(9, 5, 0, 0)));
        when(repo.insertMessage(anyInt(), anyInt(), anyString(), any(), any(), any(), any())).thenReturn(100L);
        when(repo.messages(9, 99, 0, 1))
                .thenReturn(List.of(new Message(100, "CUSTOMER", 5, "Tên 5", "Xin chào", null, null, null, null)));
    }

    @Test
    @DisplayName("Khách gửi tin chữ: tạo cuộc trò chuyện nếu chưa có rồi lưu tin")
    void customerSendsText() {
        Message m = service.sendAsCustomer(customer, new SendRequest("  Xin chào  ", null, null, null));
        assertEquals(100, m.id());
        verify(repo).insertMessage(9, 5, "CUSTOMER", "Xin chào", null, null, null);
    }

    @Test
    @DisplayName("Tin trống, quá dài hoặc ảnh không phải Cloudinary bị từ chối")
    void invalidMessages() {
        assertEquals("EMPTY_MESSAGE",
                assertThrows(ApiException.class, () -> service.sendAsCustomer(customer, new SendRequest("   ", null, null, null))).code);
        assertEquals("MESSAGE_TOO_LONG",
                assertThrows(ApiException.class,
                        () -> service.sendAsCustomer(customer, new SendRequest("a".repeat(ChatService.MAX_BODY + 1), null, null, null))).code);
        assertEquals("IMAGE_URL",
                assertThrows(ApiException.class,
                        () -> service.sendAsCustomer(customer, new SendRequest(null, "https://evil.example/a.png", null, null))).code);
        verify(repo, never()).insertMessage(anyInt(), anyInt(), anyString(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("Chỉ đính kèm được đơn của chính khách trong cuộc trò chuyện")
    void orderMustBelongToCustomer() {
        when(repo.orderOwner(77)).thenReturn(Optional.of(6)); // đơn của khách khác
        assertEquals("ORDER_NOT_FOUND",
                assertThrows(ApiException.class, () -> service.sendAsCustomer(customer, new SendRequest(null, null, 77, null))).code);
        when(repo.orderOwner(78)).thenReturn(Optional.of(5));
        service.sendAsCustomer(customer, new SendRequest(null, null, 78, null));
        verify(repo).insertMessage(9, 5, "CUSTOMER", null, null, 78, null);
    }

    @Test
    @DisplayName("Cửa hàng trả lời vào cuộc trò chuyện của khách; khách không dùng được API của cửa hàng")
    void roles() {
        service.sendAsStore(owner, 9, new SendRequest("Chào bạn", null, null, null));
        verify(repo).insertMessage(9, 1, "STORE", "Chào bạn", null, null, null);
        assertEquals(403, assertThrows(ApiException.class, () -> service.conversations(customer, null)).status);
        assertEquals(403, assertThrows(ApiException.class, () -> service.sendAsCustomer(owner, new SendRequest("x", null, null, null))).status);
    }

    @Test
    @DisplayName("Chưa chạy migration: status báo chưa bật, các API khác trả 503")
    void notReady() {
        when(repo.ready()).thenReturn(false);
        assertFalse(service.status(customer).available());
        assertEquals(503, assertThrows(ApiException.class, () -> service.myThread(customer, 0, 0)).status);
        verify(repo, never()).unreadForCustomer(eq(5));
        verify(repo, never()).markRead(anyInt(), anyString(), anyLong());
    }

    private static final java.time.ZonedDateTime NOON_VN =
            java.time.ZonedDateTime.of(2026, 11, 20, 12, 0, 0, 0, ChatAutoReply.VN); // 05:00 UTC

    @Test
    @DisplayName("Tin đầu tiên của khách: gửi tin chào tự động (AUTO, đứng tên chủ shop)")
    void greetsFirstMessage() {
        when(auto.greeting()).thenReturn("Xin chào!");
        when(repo.storeSenderId()).thenReturn(Optional.of(1));
        when(repo.previousMessageAt(9, 100)).thenReturn(null);
        service.autoReply(new Conversation(9, 5, 0, 0), 100, NOON_VN);
        verify(repo).insertMessage(9, 1, ChatService.AUTO, "Xin chào!", null, null, null);
    }

    @Test
    @DisplayName("Vừa nhắn cách đây ít phút thì không chào lại; ngoài giờ chỉ báo một lần mỗi 3 giờ")
    void noRepeat() {
        when(auto.greeting()).thenReturn("Xin chào!");
        when(auto.awayMessage(any())).thenReturn("Ngoài giờ");
        when(repo.storeSenderId()).thenReturn(Optional.of(1));
        LocalDateTime nowUtc = LocalDateTime.of(2026, 11, 20, 5, 0);
        when(repo.previousMessageAt(9, 100)).thenReturn(nowUtc.minusMinutes(5));
        when(repo.lastAutoAt(9)).thenReturn(nowUtc.minusMinutes(30));
        service.autoReply(new Conversation(9, 5, 0, 0), 100, NOON_VN);
        verify(repo, never()).insertMessage(anyInt(), anyInt(), eq(ChatService.AUTO), any(), any(), any(), any());

        when(repo.lastAutoAt(9)).thenReturn(nowUtc.minusHours(4));
        service.autoReply(new Conversation(9, 5, 0, 0), 100, NOON_VN);
        verify(repo).insertMessage(9, 1, ChatService.AUTO, "Ngoài giờ", null, null, null);
    }

    @Test
    @DisplayName("Giờ làm việc, kể cả làm qua đêm")
    void withinHours() {
        assertEquals(true, ChatAutoReply.withinHours(java.time.LocalTime.of(9, 0), java.time.LocalTime.of(8, 0), java.time.LocalTime.of(22, 0)));
        assertEquals(false, ChatAutoReply.withinHours(java.time.LocalTime.of(22, 0), java.time.LocalTime.of(8, 0), java.time.LocalTime.of(22, 0)));
        assertEquals(true, ChatAutoReply.withinHours(java.time.LocalTime.of(1, 0), java.time.LocalTime.of(18, 0), java.time.LocalTime.of(2, 0)));
        assertEquals(false, ChatAutoReply.withinHours(java.time.LocalTime.of(3, 0), java.time.LocalTime.of(18, 0), java.time.LocalTime.of(2, 0)));
    }

    @Test
    @DisplayName("Câu hỏi trạng thái đơn trả lời theo các đơn đang xử lý của khách")
    void orderStatusAnswer() {
        when(repo.activeOrders(5, 5)).thenReturn(List.of(
                new ChatRepository.ActiveOrder("ORD-1", "SHIPPING", null, "GHN", "GHN123"),
                new ChatRepository.ActiveOrder("ORD-2", "PENDING_CONFIRMATION", null, null, null)));
        String answer = service.orderStatusAnswer(5);
        org.junit.jupiter.api.Assertions.assertTrue(answer.contains("ORD-1: đang được giao đến bạn (Giao Hàng Nhanh, mã vận đơn GHN123)"), answer);
        org.junit.jupiter.api.Assertions.assertTrue(answer.contains("ORD-2: đang chờ cửa hàng xác nhận"), answer);
        when(repo.activeOrders(6, 5)).thenReturn(List.of());
        org.junit.jupiter.api.Assertions.assertTrue(service.orderStatusAnswer(6).startsWith("Hiện bạn không có đơn hàng nào"));
    }

    @Test
    @DisplayName("Dòng xem trước trong danh sách cuộc trò chuyện")
    void preview() {
        assertEquals("[Hình ảnh]", ChatRepository.preview(null, "https://res.cloudinary.com/a.png", false, false));
        assertEquals("[Đơn hàng]", ChatRepository.preview("  ", null, true, false));
        assertEquals("a".repeat(80) + "…", ChatRepository.preview("a".repeat(90), null, false, false));
    }
}
