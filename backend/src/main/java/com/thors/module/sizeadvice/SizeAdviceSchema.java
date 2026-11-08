package com.thors.module.sizeadvice;

import com.thors.common.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Kiểm tra database đã chạy migration 2026-11-08_body_measurements.sql chưa.
 *
 * <p>Nhóm dùng chung một database và mỗi người tự chạy migration, nên code có thể lên trước khi DB có
 * cột/bảng mới. Khi đó tính năng gợi ý size tự tắt (API trả 503 SIZE_ADVICE_UNAVAILABLE, frontend ẩn
 * phần gợi ý) thay vì lỗi SQL; các chức năng khác không bị ảnh hưởng. Chạy migration xong, tính năng tự
 * bật lại trong vòng {@link #RECHECK_MS} ms, không cần khởi động lại server.
 */
@Component
public class SizeAdviceSchema {
    private static final Logger log = LoggerFactory.getLogger(SizeAdviceSchema.class);
    static final long RECHECK_MS = 60_000;

    /** Đủ 4 cột mới của `user` và có bảng order_item_fit_feedback. */
    private static final String CHECK_SQL =
            """
            SELECT
              (SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = DATABASE() AND table_name = 'user'
                  AND column_name IN ('height_cm', 'weight_kg', 'foot_length_mm', 'fit_preference'))
              + (SELECT COUNT(*) FROM information_schema.tables
                WHERE table_schema = DATABASE() AND table_name = 'order_item_fit_feedback')
            """;
    private static final int EXPECTED = 5;

    private final JdbcTemplate db;
    private volatile boolean ready;
    private volatile long checkedAt;

    public SizeAdviceSchema(JdbcTemplate db) {
        this.db = db;
    }

    /** true nếu DB đã có cột/bảng mới. Đã sẵn sàng thì nhớ luôn; chưa thì kiểm tra lại sau mỗi phút. */
    public boolean ready() {
        if (ready) return true;
        long now = System.currentTimeMillis();
        if (now - checkedAt < RECHECK_MS) return false;
        synchronized (this) {
            if (ready || now - checkedAt < RECHECK_MS) return ready;
            checkedAt = now;
            try {
                Integer found = db.queryForObject(CHECK_SQL, Integer.class);
                ready = found != null && found == EXPECTED;
            } catch (RuntimeException e) {
                ready = false;
            }
            if (!ready)
                log.info("Gợi ý size đang tắt: database chưa chạy migration 2026-11-08_body_measurements.sql");
            return ready;
        }
    }

    /** Ném 503 nếu DB chưa sẵn sàng; gọi ở đầu mọi API dùng cột/bảng mới. */
    public void require() {
        if (!ready())
            throw new ApiException(
                    503, "SIZE_ADVICE_UNAVAILABLE", "Chức năng gợi ý size chưa sẵn sàng (database chưa cập nhật).");
    }
}
