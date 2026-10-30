package com.thors.module.warehouse;

import com.thors.common.ApiException;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class WarehouseStore {
    private final JdbcTemplate db;

    public WarehouseStore(JdbcTemplate db) {
        this.db = db;
    }

    public JdbcTemplate jdbc() {
        return db;
    }

    public Map<String, Object> one(String sql, Object... args) {
        var rows = db.queryForList(sql, args);
        if (rows.isEmpty()) throw new ApiException(404, "NOT_FOUND", "Không tìm thấy dữ liệu kho.");
        return rows.get(0);
    }

    public long count(String sql, Object... args) {
        return db.queryForObject(sql, Long.class, args);
    }

    public int insert(String sql, Object... args) {
        var match =
                java.util.regex.Pattern.compile("INSERT INTO ([a-z_]+)\\(").matcher(sql.stripLeading());
        if (!match.find()) throw new IllegalArgumentException("Expected a warehouse INSERT statement");
        String column =
                Map.of(
                                "stock_receipt",
                                "receipt_id",
                                "stock_receipt_item",
                                "receipt_item_id",
                                "stock_adjustment",
                                "adjustment_id",
                                "notification",
                                "notification_id",
                                "rack",
                                "rack_id",
                                "shelf_level",
                                "shelf_level_id",
                                "product_location",
                                "product_location_id",
                                "product_location_image",
                                "product_location_image_id")
                        .get(match.group(1));
        if (column == null) throw new IllegalArgumentException("Unknown warehouse identity column");
        var key = new GeneratedKeyHolder();
        db.update(
                c -> {
                    var s = c.prepareStatement(sql, new String[] {column});
                    for (int i = 0; i < args.length; i++) s.setObject(i + 1, args[i]);
                    return s;
                },
                key);
        return Objects.requireNonNull(key.getKey()).intValue();
    }

    /**
     * A single warehouse: serialize mutations on an existing OWNER role row. All mutations call this
     * inside their transaction before reading mutable stock. No lock table, migration, or JVM-local
     * lock; works across app instances.
     */
    public void lock() {
        one("SELECT role_id FROM `role` WHERE role_name='OWNER' FOR UPDATE");
    }

    public void audit(int actor, String action, int id, String detail) {
        db.update(
                "INSERT INTO audit_log(user_id,action_type,entity_affected,entity_id,new_value,actor_type)"
                        + " VALUES(?,?,'warehouse',?,?,'USER')",
                actor,
                action,
                id,
                detail);
    }

    public static int num(Map<String, Object> row, String field) {
        Object value = row.get(field);
        return value instanceof Boolean b ? (b ? 1 : 0) : ((Number) value).intValue();
    }

    public static boolean is(Map<String, Object> row, String field, String value) {
        return value.equals(row.get(field));
    }

    public static ApiException invalid(String message) {
        return new ApiException(409, "WAREHOUSE_CONFLICT", message);
    }
}
