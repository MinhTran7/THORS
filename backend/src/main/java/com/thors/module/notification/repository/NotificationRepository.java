package com.thors.module.notification.repository;

import com.thors.module.notification.dto.NotificationViews.Item;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

/** Dùng các bảng notification và user_notification. */
@Repository
public class NotificationRepository {
    private final JdbcTemplate db;

    public NotificationRepository(JdbcTemplate db) {
        this.db = db;
    }

    public record Slice(List<Item> items, long total) {}

    private static LocalDateTime time(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toLocalDateTime();
    }

    private final RowMapper<Item> mapper =
            (rs, i) ->
                    new Item(
                            rs.getInt("user_notification_id"),
                            rs.getInt("notification_id"),
                            rs.getString("title"),
                            rs.getString("message"),
                            rs.getString("type"),
                            rs.getString("related_entity_type"),
                            rs.getObject("related_entity_id", Integer.class),
                            rs.getBoolean("is_read"),
                            time(rs, "read_at"),
                            time(rs, "created_at"));

    public Slice findByUser(int userId, boolean unreadOnly, int page, int size) {
        String where = " WHERE un.user_id = ?" + (unreadOnly ? " AND un.is_read = 0" : "");

        Long total =
                db.queryForObject(
                        "SELECT COUNT(*) FROM user_notification un" + where, Long.class, userId);

        List<Object> args = new ArrayList<>();
        args.add(userId);
        args.add(size);
        args.add((long) page * size);

        List<Item> items =
                db.query(
                        """
                        SELECT un.user_notification_id, un.notification_id, un.is_read, un.read_at,
                               n.title, n.message, n.type,
                               n.related_entity_type, n.related_entity_id, n.created_at
                        FROM user_notification un
                        JOIN notification n ON n.notification_id = un.notification_id
                        """
                                + where
                                + " ORDER BY n.created_at DESC, un.user_notification_id DESC"
                                + " LIMIT ? OFFSET ?",
                        mapper,
                        args.toArray());

        return new Slice(items, total == null ? 0 : total);
    }

    public long countUnread(int userId) {
        Long n =
                db.queryForObject(
                        "SELECT COUNT(*) FROM user_notification WHERE user_id = ? AND is_read = 0",
                        Long.class,
                        userId);
        return n == null ? 0 : n;
    }

    /** Thông báo có thuộc về người dùng này không. */
    public boolean exists(int userId, int userNotificationId) {
        Integer n =
                db.queryForObject(
                        "SELECT COUNT(*) FROM user_notification"
                                + " WHERE user_notification_id = ? AND user_id = ?",
                        Integer.class,
                        userNotificationId,
                        userId);
        return n != null && n > 0;
    }

    /** Chỉ cập nhật khi chưa đọc, nên gọi lại nhiều lần vẫn giữ nguyên read_at đầu tiên. */
    public int markRead(int userId, int userNotificationId) {
        return db.update(
                "UPDATE user_notification SET is_read = 1, read_at = NOW()"
                        + " WHERE user_notification_id = ? AND user_id = ? AND is_read = 0",
                userNotificationId,
                userId);
    }

    public int markAllRead(int userId) {
        return db.update(
                "UPDATE user_notification SET is_read = 1, read_at = NOW()"
                        + " WHERE user_id = ? AND is_read = 0",
                userId);
    }

    // ---------------------------------------------------------------- Tạo thông báo

    /** Thêm một dòng vào notification, trả về notification_id. */
    public int insert(String type, String title, String message, String entityType, Integer entityId) {
        KeyHolder keys = new GeneratedKeyHolder();
        db.update(
                con -> {
                    PreparedStatement ps =
                            con.prepareStatement(
                                    "INSERT INTO notification"
                                            + " (title, message, type, related_entity_type, related_entity_id, created_at)"
                                            + " VALUES (?, ?, ?, ?, ?, NOW())",
                                    Statement.RETURN_GENERATED_KEYS);
                    ps.setString(1, limit(title, 200));
                    ps.setString(2, message);
                    ps.setString(3, limit(type, 30));
                    ps.setString(4, limit(entityType, 50));
                    if (entityId == null) ps.setNull(5, Types.INTEGER);
                    else ps.setInt(5, entityId);
                    return ps;
                },
                keys);
        return keys.getKey().intValue();
    }

    /** Gửi thông báo cho từng người trong danh sách (chưa đọc). */
    public void linkUsers(int notificationId, Collection<Integer> userIds) {
        db.batchUpdate(
                "INSERT INTO user_notification (user_id, notification_id, is_read) VALUES (?, ?, 0)",
                userIds.stream().distinct().map(id -> new Object[] {id, notificationId}).toList());
    }

    /** Gửi thông báo cho mọi tài khoản ACTIVE của một vai trò. */
    public int linkRole(int notificationId, String roleName) {
        return db.update(
                "INSERT INTO user_notification (user_id, notification_id, is_read)"
                        + " SELECT u.user_id, ?, 0 FROM `user` u"
                        + " JOIN `role` r ON r.role_id = u.role_id"
                        + " WHERE r.role_name = ? AND u.account_status = 'ACTIVE'",
                notificationId,
                roleName);
    }

    private static String limit(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }
}