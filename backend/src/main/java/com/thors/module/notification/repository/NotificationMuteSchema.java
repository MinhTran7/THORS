package com.thors.module.notification.repository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Kiểm tra database đã chạy migration 2026-11-09_notification_mute.sql chưa.
 *
 * <p>Nhóm dùng chung một database và mỗi người tự chạy migration. Chưa có bảng notification_mute thì
 * thông báo vẫn gửi cho mọi người như cũ và công tắc bật/tắt bị ẩn, không lỗi SQL. Chạy migration xong,
 * tính năng tự bật trong vòng {@link #RECHECK_MS} ms, không cần khởi động lại server.
 */
@Component
public class NotificationMuteSchema {
    private static final Logger log = LoggerFactory.getLogger(NotificationMuteSchema.class);
    static final long RECHECK_MS = 60_000;

    private static final String CHECK_SQL =
            "SELECT COUNT(*) FROM information_schema.tables"
                    + " WHERE table_schema = DATABASE() AND table_name = 'notification_mute'";

    private final JdbcTemplate db;
    private volatile boolean ready;
    private volatile long checkedAt;

    public NotificationMuteSchema(JdbcTemplate db) {
        this.db = db;
    }

    /** true nếu DB đã có bảng notification_mute. Có rồi thì nhớ luôn; chưa thì kiểm tra lại sau mỗi phút. */
    public boolean ready() {
        if (ready) return true;
        long now = System.currentTimeMillis();
        if (now - checkedAt < RECHECK_MS) return false;
        synchronized (this) {
            if (ready || now - checkedAt < RECHECK_MS) return ready;
            checkedAt = now;
            try {
                Integer found = db.queryForObject(CHECK_SQL, Integer.class);
                ready = found != null && found == 1;
            } catch (RuntimeException e) {
                ready = false;
            }
            if (!ready)
                log.info("Bật/tắt thông báo đang tắt: database chưa chạy migration 2026-11-09_notification_mute.sql");
            return ready;
        }
    }
}
