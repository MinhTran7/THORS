package com.thors.module.website;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Thông tin chung của website bán hàng (thanh thông báo, footer: Về THORS, liên hệ...).
 * Lưu dạng khóa - giá trị trong bảng website_setting (xem database/migrations/2026-11-13_website_setting.sql).
 * Bảng chưa có thì tự tạo ở lần dùng đầu tiên.
 */
@Repository
public class WebsiteSettingRepository {

    private final JdbcTemplate jdbcTemplate;
    private volatile boolean tableReady;

    public WebsiteSettingRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    private void ensureTable() {
        if (tableReady) return;
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS website_setting (
                setting_key   VARCHAR(64) NOT NULL PRIMARY KEY,
                setting_value TEXT        NOT NULL,
                updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
            """);
        tableReady = true;
    }

    /** Tất cả cài đặt đã lưu: khóa -> giá trị. */
    public Map<String, String> findAll() {
        ensureTable();
        Map<String, String> result = new LinkedHashMap<>();
        jdbcTemplate.query("SELECT setting_key, setting_value FROM website_setting",
                rs -> {
                    result.put(rs.getString("setting_key"), rs.getString("setting_value"));
                });
        return result;
    }

    /** Lưu (thêm mới hoặc ghi đè) từng cặp khóa - giá trị. */
    public void saveAll(Map<String, String> values) {
        ensureTable();
        values.forEach((key, value) -> jdbcTemplate.update("""
            INSERT INTO website_setting (setting_key, setting_value) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
            """, key, value));
    }
}
