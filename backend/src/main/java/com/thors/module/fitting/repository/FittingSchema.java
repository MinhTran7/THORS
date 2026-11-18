package com.thors.module.fitting.repository;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Kiểm tra DB đã có cột mới chưa (vd. foot_min) để code chạy được cả trước và sau khi chạy migration.
 * Chỉ ghi nhớ khi cột ĐÃ có; chưa có thì lần sau hỏi lại (để chạy migration xong không cần khởi động lại).
 */
@Component
public class FittingSchema {

    private final JdbcTemplate jdbc;
    private final Map<String, Boolean> known = new ConcurrentHashMap<>();

    public FittingSchema(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean hasColumn(String table, String column) {
        String key = table + "." + column;
        if (known.containsKey(key)) return true;
        Integer n = jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
                """, Integer.class, table, column);
        boolean has = n != null && n > 0;
        if (has) known.put(key, true);
        return has;
    }
}
