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

    private static final Map<String, String> IDENTITY =
            Map.ofEntries(
                    Map.entry("stock_receipt", "receipt_id"),
                    Map.entry("stock_receipt_item", "receipt_item_id"),
                    Map.entry("stock_adjustment", "adjustment_id"),
                    Map.entry("notification", "notification_id"),
                    Map.entry("rack", "rack_id"),
                    Map.entry("shelf_level", "shelf_level_id"),
                    Map.entry("product_location", "product_location_id"),
                    Map.entry("product_location_image", "product_location_image_id"),
                    Map.entry("supplier_settlement", "settlement_id"),
                    Map.entry("stock_count", "count_id"),
                    Map.entry("stock_count_item", "count_item_id"));

    public int insert(String sql, Object... args) {
        var match =
                java.util.regex.Pattern.compile("INSERT INTO ([a-z_]+)\\(").matcher(sql.stripLeading());
        if (!match.find()) throw new IllegalArgumentException("Expected a warehouse INSERT statement");
        String column =
                IDENTITY.get(match.group(1));
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

    /** Supplier of a document: its own name, else its source's, else the source's source (order). */
    public String supplierName(int doc) {
        var row =
                one(
                        """
                SELECT COALESCE(r.manufacturer_name,p.manufacturer_name,g.manufacturer_name) AS name
                FROM stock_receipt r LEFT JOIN stock_receipt p ON p.receipt_id=r.source_receipt_id
                LEFT JOIN stock_receipt g ON g.receipt_id=p.source_receipt_id WHERE r.receipt_id=?
                """,
                        doc);
        return row.get("name") == null ? null : row.get("name").toString().trim();
    }

    /** One stock_adjustment row linked to a document line (and optionally a source location). */
    public void movement(
            int actor, int detail, int change, String type, int item, Integer source, String key, String reason) {
        db.update(
                """
            INSERT INTO stock_adjustment(detail_id,quantity_change,reason,adjusted_by,movement_type,movement_quantity,receipt_item_id,source_location_id,idempotency_key)
            VALUES(?,?,?,?,?,?,?,?,?)
            """,
                detail,
                change,
                reason,
                actor,
                type,
                Math.abs(change),
                item,
                source,
                key);
    }

    /**
     * Quantity held for customer orders. A hold is order_item.reserved_quantity: set when an online
     * order is placed, set back to 0 in the same transaction that ships (deducts) or releases it.
     */
    public int held(int detail) {
        return (int) count("SELECT COALESCE(SUM(reserved_quantity),0) FROM order_item WHERE detail_id=?", detail);
    }

    /**
     * Sale stock-out shared by in-store sales and online order confirmation. Caller holds {@link
     * #lock()}. Allowed only up to stock minus what other orders hold ({@code ownHeld} is the part
     * held by this order line, consumed here). Goods are taken from the unplaced part first, then
     * from the location holding the most (one ORDER_OUT row per source, linked to the order line), so
     * total = placed + unplaced stays true. Returns the rows written.
     */
    public List<Map<String, Object>> sell(
            int actor, int detail, int qty, int ownHeld, int orderItem, String key, String reason) {
        var variant = one("SELECT stock_quantity FROM product_detail WHERE detail_id=? FOR UPDATE", detail);
        int stock = num(variant, "stock_quantity");
        int others = held(detail) - ownHeld;
        if (qty > stock - others)
            throw invalid(
                    String.format(
                            "Biến thể #%d không đủ hàng có thể bán: tồn %d, đang giữ cho đơn khác %d, cần %d.",
                            detail, stock, Math.max(0, others), qty));
        long assigned = count("SELECT COALESCE(SUM(quantity),0) FROM product_location WHERE detail_id=?", detail);
        int left = qty;
        var taken = new ArrayList<Map<String, Object>>();
        int unplaced = (int) Math.max(0, Math.min(left, stock - assigned));
        if (unplaced > 0) {
            saleRow(actor, detail, -unplaced, orderItem, null, key + ":unplaced", reason);
            taken.add(Map.of("location_id", 0, "quantity", unplaced));
            left -= unplaced;
        }
        for (var loc :
                db.queryForList(
                        "SELECT product_location_id,quantity FROM product_location WHERE detail_id=? AND quantity>0"
                                + " ORDER BY quantity DESC,product_location_id FOR UPDATE",
                        detail)) {
            if (left == 0) break;
            int part = Math.min(left, num(loc, "quantity"));
            int id = num(loc, "product_location_id");
            db.update(
                    "UPDATE product_location SET quantity=quantity-?,updated_at=CURRENT_TIMESTAMP WHERE product_location_id=?",
                    part,
                    id);
            saleRow(actor, detail, -part, orderItem, id, key + ":" + id, reason);
            taken.add(Map.of("location_id", id, "quantity", part));
            left -= part;
        }
        if (left > 0 || db.update(
                        "UPDATE product_detail SET stock_quantity=stock_quantity-? WHERE detail_id=? AND stock_quantity>=?",
                        qty,
                        detail,
                        qty)
                != 1) throw invalid("Biến thể #" + detail + ": tồn vừa thay đổi, hãy tải lại.");
        return taken;
    }

    private void saleRow(int actor, int detail, int change, int orderItem, Integer source, String key, String reason) {
        db.update(
                """
            INSERT INTO stock_adjustment(detail_id,quantity_change,reason,adjusted_by,movement_type,movement_quantity,order_item_id,source_location_id,idempotency_key)
            VALUES(?,?,?,?,'ORDER_OUT',?,?,?,?)
            """,
                detail,
                change,
                reason,
                actor,
                Math.abs(change),
                orderItem,
                source,
                key);
    }

    /** Business days and displayed times are Vietnamese time. */
    public static final java.time.ZoneId STORE_ZONE = java.time.ZoneId.of("Asia/Ho_Chi_Minh");

    public static java.time.LocalDateTime time(Object v) {
        if (v == null) return null;
        if (v instanceof java.time.LocalDateTime t) return t;
        if (v instanceof java.sql.Timestamp t) return t.toLocalDateTime();
        if (v instanceof java.time.OffsetDateTime t) return t.toLocalDateTime();
        return java.time.LocalDateTime.parse(v.toString().replace(' ', 'T'));
    }

    /**
     * Timestamps are written by the database clock (CURRENT_TIMESTAMP, UTC on the shared MySQL).
     * database time − offset = store time; store day + offset = database time.
     */
    public java.time.Duration clockOffset() {
        var dbNow = time(db.queryForObject("SELECT LOCALTIMESTAMP", Object.class));
        long minutes = java.time.Duration.between(java.time.LocalDateTime.now(STORE_ZONE), dbNow).toMinutes();
        return java.time.Duration.ofMinutes(Math.round(minutes / 15.0) * 15);
    }

    /** Rewrites the given timestamp fields of a row from database time to store (Vietnam) time. */
    public static void storeTime(Map<String, Object> row, java.time.Duration offset, String... fields) {
        for (var f : fields) if (row.get(f) != null) row.put(f, time(row.get(f)).minus(offset));
    }

    /** Runs a query that needs database/migrations/2026-11-06_inventory.sql; explains instead of a 500. */
    public <T> T migrated(java.util.function.Supplier<T> action) {
        try {
            return action.get();
        } catch (org.springframework.jdbc.BadSqlGrammarException e) {
            String m = String.valueOf(e.getMostSpecificCause().getMessage()).toLowerCase(Locale.ROOT);
            if (m.contains("min_stock_quantity") || m.contains("stock_count"))
                throw new ApiException(
                        503,
                        "MIGRATION_REQUIRED",
                        "Database chưa có phần tồn kho mới. Cần chạy database/migrations/2026-11-06_inventory.sql.");
            throw e;
        }
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

    /** Mutable copy that keeps JDBC's case-insensitive column names. */
    public static Map<String, Object> copy(Map<String, Object> source) {
        var map = new org.springframework.util.LinkedCaseInsensitiveMap<Object>();
        map.putAll(source);
        return map;
    }

    public static boolean is(Map<String, Object> row, String field, String value) {
        return value.equals(row.get(field));
    }

    public static ApiException invalid(String message) {
        return new ApiException(409, "WAREHOUSE_CONFLICT", message);
    }
}
