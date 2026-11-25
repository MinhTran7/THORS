package com.thors.module.chat;

import java.time.LocalDateTime;
import java.util.List;

/** Dữ liệu trả về cho chat giữa khách và cửa hàng. Thời gian theo giờ UTC (như các API khác). */
public final class ChatViews {
    private ChatViews() {}

    /** Thẻ đơn hàng đính kèm trong tin nhắn. */
    public record OrderCard(int id, String orderNumber, String status, long totalAmount, String imageUrl, int itemCount) {}

    /** Thẻ sản phẩm đính kèm trong tin nhắn. */
    public record ProductCard(int id, String name, String imageUrl, Long minPrice) {}

    /** side: CUSTOMER hoặc STORE. */
    public record Message(
            long id,
            String side,
            int senderId,
            String senderName,
            String body,
            String imageUrl,
            OrderCard order,
            ProductCard product,
            LocalDateTime createdAt) {}

    /**
     * Một khung chat. otherLastReadId: tin cuối cùng phía bên kia đã đọc (để hiện "Đã xem").
     * hasMore: còn tin cũ hơn chưa tải.
     */
    public record Thread(Integer conversationId, String customerName, List<Message> messages, long otherLastReadId, boolean hasMore) {}

    /** Một dòng trong danh sách cuộc trò chuyện của cửa hàng. */
    public record ConversationSummary(
            int id,
            int customerId,
            String customerName,
            String customerEmail,
            String avatarUrl,
            String lastText,
            String lastSide,
            LocalDateTime lastMessageAt,
            int unread) {}

    /** available = false khi DB chưa có bảng chat (chưa chạy migration). */
    public record Status(boolean available, int unread) {}

    /** Nội dung gửi lên: chữ, ảnh (URL đã tải lên), thẻ đơn hàng, thẻ sản phẩm; cần ít nhất một thứ. */
    public record SendRequest(String body, String imageUrl, Integer orderId, Integer productId) {}

    public record ReadRequest(Long upTo) {}
}
