package com.thors.module.account.repository;

import com.thors.module.account.dto.AuditLogViews.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/**
 * Chỉ ĐỌC bảng audit_log. Không có insert/update/delete ở đây vì các dòng audit còn được code khác
 * dùng làm dữ liệu nội bộ (xem AccountRepository.SELECT).
 */
@Repository
public class AuditLogRepository {
    /**
     * Các action là dữ liệu nội bộ, không hiển thị trong System Logs: GOOGLE_LINK chứa hash liên kết
     * Google, PASSWORD_INVALIDATE/STATUS_INVALIDATE dùng để thu hồi session, OTP_SENT dùng để giới hạn
     * số lần gửi OTP (và quá nhiều, gây nhiễu).
     */
    public static final List<String> HIDDEN =
            List.of("GOOGLE_LINK", "PASSWORD_INVALIDATE", "STATUS_INVALIDATE", "OTP_SENT");

    /** Đăng nhập thất bại. */
    public static final List<String> FAILED = List.of("LOGIN_FAILED");

    /** Sự kiện cần chú ý về bảo mật: khóa/vô hiệu hóa tài khoản, yêu cầu đặt lại mật khẩu của Owner. */
    public static final List<String> WARNING =
            List.of("ACCOUNT_LOCK", "ACCOUNT_DEACTIVATE", "PASSWORD_RESET_REQUEST");

    public static String statusOf(String action) {
        if (FAILED.contains(action)) return "FAILED";
        if (WARNING.contains(action)) return "WARNING";
        return "SUCCESS";
    }

    private static final String FROM =
            """
            FROM audit_log l
            LEFT JOIN `user` a ON a.user_id = l.user_id
            LEFT JOIN `user` t ON l.entity_affected = 'user' AND t.user_id = l.entity_id
            LEFT JOIN `role` tr ON tr.role_id = t.role_id
            """;

    private static final String COLUMNS =
            """
            SELECT l.log_id, l.user_id, a.full_name AS actor_name, l.actor_type, l.action_type,
                   l.entity_affected, l.entity_id, t.full_name AS target_name, tr.role_name AS target_role,
                   l.old_value, l.new_value, l.performed_at
            """;

    private static final RowMapper<Item> MAPPER =
            (rs, i) -> {
                String action = rs.getString("action_type");
                String newValue = rs.getString("new_value");
                // Đăng nhập ghi địa chỉ IP dưới dạng "IP x.x.x.x" trong new_value.
                String ip = newValue != null && newValue.startsWith("IP ") ? newValue.substring(3) : null;
                return new Item(
                        rs.getLong("log_id"),
                        rs.getObject("user_id", Integer.class),
                        rs.getString("actor_name"),
                        rs.getString("actor_type"),
                        action,
                        statusOf(action),
                        rs.getString("entity_affected"),
                        rs.getObject("entity_id", Long.class),
                        rs.getString("target_name"),
                        rs.getString("target_role"),
                        ip,
                        rs.getString("old_value"),
                        newValue,
                        rs.getObject("performed_at", LocalDateTime.class));
            };

    private final JdbcTemplate db;

    public AuditLogRepository(JdbcTemplate db) {
        this.db = db;
    }

    public Page search(Filter f, int page, int size) {
        var where = new StringBuilder(" WHERE l.action_type NOT IN (" + marks(HIDDEN.size()) + ")");
        List<Object> args = new ArrayList<>(HIDDEN);

        if (f.action() != null) {
            where.append(" AND l.action_type = ?");
            args.add(f.action());
        }
        if (f.status() != null) {
            switch (f.status()) {
                case "FAILED" -> {
                    where.append(" AND l.action_type IN (" + marks(FAILED.size()) + ")");
                    args.addAll(FAILED);
                }
                case "WARNING" -> {
                    where.append(" AND l.action_type IN (" + marks(WARNING.size()) + ")");
                    args.addAll(WARNING);
                }
                default -> {
                    where.append(" AND l.action_type NOT IN (" + marks(FAILED.size() + WARNING.size()) + ")");
                    args.addAll(FAILED);
                    args.addAll(WARNING);
                }
            }
        }
        if (f.actorId() != null) {
            where.append(" AND l.user_id = ?");
            args.add(f.actorId());
        }
        if (f.targetId() != null) {
            where.append(" AND l.entity_affected = 'user' AND l.entity_id = ?");
            args.add(f.targetId());
        }
        if (f.q() != null) {
            String like = like(f.q());
            where.append(
                    " AND (LOWER(a.full_name) LIKE ? OR LOWER(t.full_name) LIKE ?"
                            + " OR LOWER(l.action_type) LIKE ? OR LOWER(l.new_value) LIKE ?)");
            for (int i = 0; i < 4; i++) args.add(like);
        }
        if (f.from() != null) {
            where.append(" AND l.performed_at >= ?");
            args.add(f.from().atStartOfDay().minusMinutes(f.offset()));
        }
        if (f.to() != null) {
            where.append(" AND l.performed_at < ?");
            args.add(f.to().plusDays(1).atStartOfDay().minusMinutes(f.offset()));
        }

        long total = db.queryForObject("SELECT COUNT(*) " + FROM + where, Long.class, args.toArray());

        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(size);
        pageArgs.add((long) page * size);
        List<Item> items =
                db.query(
                        COLUMNS
                                + FROM
                                + where
                                + " ORDER BY l.performed_at DESC, l.log_id DESC LIMIT ? OFFSET ?",
                        MAPPER,
                        pageArgs.toArray());

        int totalPages = (int) ((total + size - 1) / size);
        return new Page(items, page, size, total, totalPages);
    }

    /** Số liệu của ngày hôm nay theo múi giờ của người xem (offset phút lệch về phía đông UTC). */
    public Summary summary(int offset) {
        LocalDate today = LocalDateTime.now(ZoneOffset.UTC).plusMinutes(offset).toLocalDate();
        LocalDateTime start = today.atStartOfDay().minusMinutes(offset);
        List<Object> args = new ArrayList<>(HIDDEN);
        args.add(start);
        args.add(start.plusDays(1));
        Map<String, Long> counts = new HashMap<>();
        db.query(
                "SELECT action_type, COUNT(*) AS n FROM audit_log WHERE action_type NOT IN ("
                        + marks(HIDDEN.size())
                        + ") AND performed_at >= ? AND performed_at < ? GROUP BY action_type",
                rs -> {
                    counts.put(rs.getString("action_type"), rs.getLong("n"));
                },
                args.toArray());
        long events = counts.values().stream().mapToLong(Long::longValue).sum();
        long failed = FAILED.stream().mapToLong(a -> counts.getOrDefault(a, 0L)).sum();
        long alerts = failed + WARNING.stream().mapToLong(a -> counts.getOrDefault(a, 0L)).sum();
        return new Summary(
                events, events - failed, alerts, failed, counts.getOrDefault("ACCOUNT_LOCK", 0L));
    }

    /** Danh sách action_type đang có trong log, dùng cho dropdown lọc ở giao diện. */
    public List<String> actions() {
        return db.queryForList(
                "SELECT DISTINCT action_type FROM audit_log WHERE action_type NOT IN ("
                        + marks(HIDDEN.size())
                        + ") ORDER BY action_type",
                String.class,
                HIDDEN.toArray());
    }

    private static String like(String q) {
        return "%"
                + q.toLowerCase().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                + "%";
    }

    private static String marks(int n) {
        return String.join(",", Collections.nCopies(n, "?"));
    }
}