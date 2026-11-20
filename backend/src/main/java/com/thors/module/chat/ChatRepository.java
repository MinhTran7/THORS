package com.thors.module.chat;

import com.thors.module.chat.ChatViews.ConversationSummary;
import com.thors.module.chat.ChatViews.Message;
import com.thors.module.chat.ChatViews.OrderCard;
import com.thors.module.chat.ChatViews.ProductCard;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

/**
 * Bảng chat_conversation / chat_message (migration 2026-11-20_chat.sql).
 *
 * <p>Nhóm dùng chung một database và mỗi người tự chạy migration. Chưa có bảng thì {@link #ready()} trả false
 * và web ẩn chat; chạy migration xong, chat tự bật trong vòng {@link #RECHECK_MS} ms, không cần khởi động lại.
 */
@Repository
public class ChatRepository {
    static final long RECHECK_MS = 60_000;

    /** Một cuộc trò chuyện: mốc đọc của hai phía. */
    public record Conversation(int id, int customerId, long customerLastReadId, long storeLastReadId) {}

    private final JdbcTemplate db;
    private volatile boolean ready;
    private volatile long checkedAt;

    public ChatRepository(JdbcTemplate db) {
        this.db = db;
    }

    /** true nếu DB đã có đủ 2 bảng chat. Có rồi thì nhớ luôn; chưa thì kiểm tra lại sau mỗi phút. */
    public boolean ready() {
        if (ready) return true;
        long now = System.currentTimeMillis();
        if (now - checkedAt < RECHECK_MS) return false;
        synchronized (this) {
            if (ready) return true;
            checkedAt = now;
            try {
                Integer n =
                        db.queryForObject(
                                "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()"
                                        + " AND LOWER(table_name) IN ('chat_conversation', 'chat_message')",
                                Integer.class);
                ready = n != null && n == 2;
            } catch (RuntimeException e) {
                ready = false;
            }
            return ready;
        }
    }

    // ------------------------------------------------------------------ Cuộc trò chuyện

    private static Conversation conversation(ResultSet rs) throws SQLException {
        return new Conversation(
                rs.getInt("conversation_id"),
                rs.getInt("customer_id"),
                rs.getLong("customer_last_read_id"),
                rs.getLong("store_last_read_id"));
    }

    public Optional<Conversation> findByCustomer(int customerId) {
        return db.query(
                        "SELECT * FROM chat_conversation WHERE customer_id = ?",
                        (rs, i) -> conversation(rs),
                        customerId)
                .stream()
                .findFirst();
    }

    public Optional<Conversation> find(int conversationId) {
        return db.query(
                        "SELECT * FROM chat_conversation WHERE conversation_id = ?",
                        (rs, i) -> conversation(rs),
                        conversationId)
                .stream()
                .findFirst();
    }

    /** Lấy cuộc trò chuyện của khách, chưa có thì tạo (an toàn khi hai yêu cầu cùng lúc nhờ khóa duy nhất). */
    public Conversation findOrCreate(int customerId) {
        return findByCustomer(customerId)
                .orElseGet(
                        () -> {
                            db.update(
                                    "INSERT IGNORE INTO chat_conversation (customer_id, created_at) VALUES (?, UTC_TIMESTAMP())",
                                    customerId);
                            return findByCustomer(customerId).orElseThrow();
                        });
    }

    /** Tên khách của một cuộc trò chuyện. */
    public String customerName(int customerId) {
        List<String> rows = db.queryForList("SELECT full_name FROM `user` WHERE user_id = ?", String.class, customerId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    // ------------------------------------------------------------------ Tin nhắn

    public long insertMessage(
            int conversationId, int senderId, String side, String body, String imageUrl, Integer orderId, Integer productId) {
        var key = new GeneratedKeyHolder();
        db.update(
                con -> {
                    var ps =
                            con.prepareStatement(
                                    "INSERT INTO chat_message (conversation_id, sender_id, sender_side, body, image_url,"
                                            + " order_id, product_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())",
                                    Statement.RETURN_GENERATED_KEYS);
                    ps.setInt(1, conversationId);
                    ps.setInt(2, senderId);
                    ps.setString(3, side);
                    ps.setString(4, body);
                    ps.setString(5, imageUrl);
                    ps.setObject(6, orderId);
                    ps.setObject(7, productId);
                    return ps;
                },
                key);
        long id = key.getKey().longValue();
        // Người gửi coi như đã đọc tới tin của chính mình; tin tự động thì không đổi mốc đọc của ai
        if (ChatService.AUTO.equals(side)) {
            db.update("UPDATE chat_conversation SET last_message_at = UTC_TIMESTAMP() WHERE conversation_id = ?", conversationId);
            return id;
        }
        String readColumn = ChatService.CUSTOMER.equals(side) ? "customer_last_read_id" : "store_last_read_id";
        db.update(
                "UPDATE chat_conversation SET last_message_at = UTC_TIMESTAMP(), " + readColumn + " = GREATEST(" + readColumn
                        + ", ?) WHERE conversation_id = ?",
                id,
                conversationId);
        return id;
    }

    private record Row(
            long id, String side, int senderId, String senderName, String body, String imageUrl, Integer orderId,
            Integer productId, LocalDateTime createdAt) {}

    /**
     * Tin nhắn của cuộc trò chuyện. afterId > 0: các tin mới hơn afterId (để tự cập nhật). beforeId > 0: tối đa
     * limit tin cũ hơn beforeId (xem tin cũ). Cả hai bằng 0: limit tin mới nhất. Trả về theo thứ tự cũ → mới.
     */
    public List<Message> messages(int conversationId, long afterId, long beforeId, int limit) {
        String where;
        List<Object> args = new ArrayList<>(List.of(conversationId));
        if (afterId > 0) {
            where = " AND m.message_id > ? ORDER BY m.message_id ASC LIMIT ?";
            args.add(afterId);
        } else if (beforeId > 0) {
            where = " AND m.message_id < ? ORDER BY m.message_id DESC LIMIT ?";
            args.add(beforeId);
        } else {
            where = " ORDER BY m.message_id DESC LIMIT ?";
        }
        args.add(limit);
        List<Row> rows =
                db.query(
                        "SELECT m.message_id, m.sender_side, m.sender_id, u.full_name, m.body, m.image_url, m.order_id,"
                                + " m.product_id, m.created_at FROM chat_message m JOIN `user` u ON u.user_id = m.sender_id"
                                + " WHERE m.conversation_id = ?"
                                + where,
                        (rs, i) ->
                                new Row(
                                        rs.getLong("message_id"),
                                        rs.getString("sender_side"),
                                        rs.getInt("sender_id"),
                                        rs.getString("full_name"),
                                        rs.getString("body"),
                                        rs.getString("image_url"),
                                        (Integer) rs.getObject("order_id", Integer.class),
                                        (Integer) rs.getObject("product_id", Integer.class),
                                        time(rs, "created_at")),
                        args.toArray());
        if (afterId <= 0) rows = reversed(rows);

        Map<Integer, OrderCard> orders = orderCards(rows.stream().map(Row::orderId).filter(id -> id != null).toList());
        Map<Integer, ProductCard> products =
                productCards(rows.stream().map(Row::productId).filter(id -> id != null).toList());
        return rows.stream()
                .map(r -> new Message(
                        r.id(), r.side(), r.senderId(), r.senderName(), r.body(), r.imageUrl(),
                        r.orderId() == null ? null : orders.get(r.orderId()),
                        r.productId() == null ? null : products.get(r.productId()),
                        r.createdAt()))
                .toList();
    }

    /** Còn tin cũ hơn messageId không. */
    public boolean hasOlder(int conversationId, long messageId) {
        Integer n =
                db.queryForObject(
                        "SELECT COUNT(*) FROM chat_message WHERE conversation_id = ? AND message_id < ?",
                        Integer.class,
                        conversationId,
                        messageId);
        return n != null && n > 0;
    }

    /** Đánh dấu một phía đã đọc tới tin upTo (không lùi lại, không vượt quá tin mới nhất). */
    public void markRead(int conversationId, String side, long upTo) {
        String column = ChatService.CUSTOMER.equals(side) ? "customer_last_read_id" : "store_last_read_id";
        db.update(
                "UPDATE chat_conversation SET " + column + " = GREATEST(" + column + ", LEAST(?, (SELECT COALESCE(MAX(message_id), 0)"
                        + " FROM chat_message WHERE conversation_id = ?))) WHERE conversation_id = ?",
                upTo,
                conversationId,
                conversationId);
    }

    // ------------------------------------------------------------------ Danh sách và số tin chưa đọc

    /** Danh sách cuộc trò chuyện cho cửa hàng, mới nhất trước; q lọc theo tên / email khách. */
    public List<ConversationSummary> conversations(String q, int limit) {
        List<Object> args = new ArrayList<>();
        String filter = "";
        if (q != null && !q.isBlank()) {
            String like = "%" + q.trim().toLowerCase().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
            filter = " AND (LOWER(u.full_name) LIKE ? OR LOWER(u.email) LIKE ?)";
            args.add(like);
            args.add(like);
        }
        args.add(limit);
        return db.query(
                """
                SELECT c.conversation_id, c.customer_id, c.last_message_at, u.full_name, u.email, u.avatar_url,
                       (SELECT COUNT(*) FROM chat_message m WHERE m.conversation_id = c.conversation_id
                          AND m.sender_side = 'CUSTOMER' AND m.message_id > c.store_last_read_id) AS unread,
                       lm.body AS last_body, lm.image_url AS last_image, lm.order_id AS last_order,
                       lm.product_id AS last_product, lm.sender_side AS last_side
                FROM chat_conversation c
                JOIN `user` u ON u.user_id = c.customer_id
                LEFT JOIN chat_message lm ON lm.message_id =
                     (SELECT MAX(m2.message_id) FROM chat_message m2 WHERE m2.conversation_id = c.conversation_id)
                WHERE c.last_message_at IS NOT NULL
                """
                        + filter
                        + " ORDER BY c.last_message_at DESC, c.conversation_id DESC LIMIT ?",
                (rs, i) ->
                        new ConversationSummary(
                                rs.getInt("conversation_id"),
                                rs.getInt("customer_id"),
                                rs.getString("full_name"),
                                rs.getString("email"),
                                rs.getString("avatar_url"),
                                preview(rs.getString("last_body"), rs.getString("last_image"),
                                        rs.getObject("last_order") != null, rs.getObject("last_product") != null),
                                rs.getString("last_side"),
                                time(rs, "last_message_at"),
                                rs.getInt("unread")),
                args.toArray());
    }

    /** Dòng xem trước của tin cuối cùng trong danh sách. */
    static String preview(String body, String image, boolean order, boolean product) {
        if (body != null && !body.isBlank()) return body.length() > 80 ? body.substring(0, 80) + "…" : body;
        if (image != null) return "[Hình ảnh]";
        if (order) return "[Đơn hàng]";
        if (product) return "[Sản phẩm]";
        return "";
    }

    /** Số tin cửa hàng gửi mà khách chưa đọc. */
    public int unreadForCustomer(int customerId) {
        Integer n =
                db.queryForObject(
                        "SELECT COUNT(*) FROM chat_message m JOIN chat_conversation c ON c.conversation_id = m.conversation_id"
                                + " WHERE c.customer_id = ? AND m.sender_side <> 'CUSTOMER' AND m.message_id > c.customer_last_read_id",
                        Integer.class,
                        customerId);
        return n == null ? 0 : n;
    }

    /** Số cuộc trò chuyện có tin khách gửi mà cửa hàng chưa đọc. */
    public int unreadConversationsForStore() {
        Integer n =
                db.queryForObject(
                        "SELECT COUNT(*) FROM chat_conversation c WHERE EXISTS (SELECT 1 FROM chat_message m"
                                + " WHERE m.conversation_id = c.conversation_id AND m.sender_side = 'CUSTOMER'"
                                + " AND m.message_id > c.store_last_read_id)",
                        Integer.class);
        return n == null ? 0 : n;
    }

    // ------------------------------------------------------------------ Tự trả lời

    /** Thời điểm (UTC) của tin nhắn ngay trước tin messageId trong cuộc trò chuyện; null nếu đây là tin đầu tiên. */
    public LocalDateTime previousMessageAt(int conversationId, long messageId) {
        List<LocalDateTime> rows =
                db.query(
                        "SELECT created_at FROM chat_message WHERE conversation_id = ? AND message_id < ?"
                                + " ORDER BY message_id DESC LIMIT 1",
                        (rs, i) -> time(rs, "created_at"),
                        conversationId,
                        messageId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** Thời điểm (UTC) tin tự động gần nhất của cuộc trò chuyện; null nếu chưa có. */
    public LocalDateTime lastAutoAt(int conversationId) {
        List<LocalDateTime> rows =
                db.query(
                        "SELECT created_at FROM chat_message WHERE conversation_id = ? AND sender_side = ?"
                                + " ORDER BY message_id DESC LIMIT 1",
                        (rs, i) -> time(rs, "created_at"),
                        conversationId,
                        ChatService.AUTO);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** Tài khoản đứng tên tin tự động (chat_message.sender_id bắt buộc): chủ cửa hàng đầu tiên còn hoạt động. */
    public Optional<Integer> storeSenderId() {
        return db.queryForList(
                        "SELECT u.user_id FROM `user` u JOIN `role` r ON r.role_id = u.role_id"
                                + " WHERE r.role_name = 'OWNER' ORDER BY (u.account_status = 'ACTIVE') DESC, u.user_id LIMIT 1",
                        Integer.class)
                .stream()
                .findFirst();
    }

    /** Một đơn online đang xử lý của khách (để trả lời "Đơn của tôi tới đâu rồi?"). */
    public record ActiveOrder(String orderNumber, String status, LocalDateTime orderDate, String carrier, String trackingNumber) {}

    public List<ActiveOrder> activeOrders(int customerId, int limit) {
        return db.query(
                "SELECT order_number, order_status, order_date, shipping_carrier, tracking_number FROM orders"
                        + " WHERE user_id = ? AND order_type = 'Online'"
                        + " AND order_status IN ('AWAITING_PAYMENT', 'PENDING_CONFIRMATION', 'AWAITING_PICKUP', 'SHIPPING', 'DELIVERED')"
                        + " ORDER BY order_date DESC LIMIT ?",
                (rs, i) ->
                        new ActiveOrder(
                                rs.getString("order_number"),
                                rs.getString("order_status"),
                                time(rs, "order_date"),
                                rs.getString("shipping_carrier"),
                                rs.getString("tracking_number")),
                customerId,
                limit);
    }

    // ------------------------------------------------------------------ Kiểm tra và thẻ đính kèm

    /** Chủ đơn hàng (orders.user_id); empty nếu không có đơn online này. */
    public Optional<Integer> orderOwner(int orderId) {
        return db.queryForList(
                        "SELECT user_id FROM orders WHERE order_id = ? AND order_type = 'Online'", Integer.class, orderId)
                .stream()
                .findFirst();
    }

    public boolean productExists(int productId) {
        Integer n = db.queryForObject("SELECT COUNT(*) FROM product WHERE product_id = ?", Integer.class, productId);
        return n != null && n > 0;
    }

    private Map<Integer, OrderCard> orderCards(Collection<Integer> ids) {
        Map<Integer, OrderCard> out = new HashMap<>();
        if (ids.isEmpty()) return out;
        List<Integer> distinct = ids.stream().distinct().toList();
        String in = String.join(",", Collections.nCopies(distinct.size(), "?"));
        db.query(
                "SELECT o.order_id, o.order_number, o.order_status, o.total_amount,"
                        + " (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_item oi WHERE oi.order_id = o.order_id) AS item_count,"
                        + " (SELECT pi.image_url FROM order_item oi2 JOIN product_detail pd ON pd.detail_id = oi2.detail_id"
                        + "   JOIN product_image pi ON pi.product_id = pd.product_id AND pi.deleted_at IS NULL"
                        + "   WHERE oi2.order_id = o.order_id ORDER BY oi2.order_item_id, pi.is_primary DESC, pi.image_id LIMIT 1) AS image_url"
                        + " FROM orders o WHERE o.order_id IN (" + in + ")",
                rs -> {
                    out.put(
                            rs.getInt("order_id"),
                            new OrderCard(
                                    rs.getInt("order_id"),
                                    rs.getString("order_number"),
                                    rs.getString("order_status"),
                                    rs.getLong("total_amount"),
                                    rs.getString("image_url"),
                                    rs.getInt("item_count")));
                },
                distinct.toArray());
        return out;
    }

    private Map<Integer, ProductCard> productCards(Collection<Integer> ids) {
        Map<Integer, ProductCard> out = new HashMap<>();
        if (ids.isEmpty()) return out;
        List<Integer> distinct = ids.stream().distinct().toList();
        String in = String.join(",", Collections.nCopies(distinct.size(), "?"));
        db.query(
                "SELECT p.product_id, p.product_name,"
                        + " (SELECT MIN(pd.price) FROM product_detail pd WHERE pd.product_id = p.product_id) AS min_price,"
                        + " (SELECT pi.image_url FROM product_image pi WHERE pi.product_id = p.product_id AND pi.deleted_at IS NULL"
                        + "   ORDER BY pi.is_primary DESC, pi.image_id LIMIT 1) AS image_url"
                        + " FROM product p WHERE p.product_id IN (" + in + ")",
                rs -> {
                    Object price = rs.getObject("min_price");
                    out.put(
                            rs.getInt("product_id"),
                            new ProductCard(
                                    rs.getInt("product_id"),
                                    rs.getString("product_name"),
                                    rs.getString("image_url"),
                                    price == null ? null : ((Number) price).longValue()));
                },
                distinct.toArray());
        return out;
    }

    private static LocalDateTime time(ResultSet rs, String column) throws SQLException {
        Timestamp ts = rs.getTimestamp(column);
        return ts == null ? null : ts.toLocalDateTime();
    }

    private static <T> List<T> reversed(List<T> list) {
        List<T> copy = new ArrayList<>(list);
        Collections.reverse(copy);
        return copy;
    }
}
