package com.thors.module.warehouse.repository;

import com.thors.common.ApiException;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class WarehouseStore {
    private final JdbcTemplate db;
    private final ProductUnits units;

    public WarehouseStore(JdbcTemplate db) {
        this.db = db;
        this.units = new ProductUnits(db);
    }

    /** Sổ hàng lỗi (bảng product_unit); gọi {@link ProductUnits#clampDefects} khi tồn giảm. */
    public ProductUnits units() {
        return units;
    }

    public JdbcTemplate jdbc() {
        return db;
    }

    private volatile Boolean tierNames;
    private volatile long tierNamesCheckedAt;

    /** Cột shelf_level.level_name đã có chưa (migration 2026-11-18_shelf_level_name.sql). */
    public boolean tierNamesReady() {
        if (Boolean.TRUE.equals(tierNames)) return true;
        long now = System.currentTimeMillis();
        if (tierNames != null && now - tierNamesCheckedAt < 30_000) return false;
        try {
            db.queryForObject("SELECT COUNT(level_name) FROM shelf_level WHERE 1=0", Long.class);
            tierNames = true;
        } catch (org.springframework.dao.DataAccessException e) {
            tierNames = false;
        }
        tierNamesCheckedAt = now;
        return tierNames;
    }

    /**
     * SQL nhãn của một tầng: tên tầng chủ cửa hàng đặt, nếu chưa đặt thì mã kệ + số tầng (vd A2).
     * {@code rack}/{@code tier} là bí danh bảng rack / shelf_level trong câu SQL. NULL khi không có tầng.
     */
    public String tierLabel(String rack, String tier) {
        String plain = "CONCAT(" + rack + ".rack_code," + tier + ".level_number)";
        return tierNamesReady() ? "COALESCE(NULLIF(TRIM(" + tier + ".level_name),'')," + plain + ")" : plain;
    }

    /** Thay {@code TIER_LABEL} trong câu SQL bằng nhãn tầng của bí danh r (rack) / t (shelf_level). */
    public String withTierLabel(String sql) {
        return sql.replace("TIER_LABEL", tierLabel("r", "t"));
    }

    /**
     * Danh mục {@code id} cùng mọi danh mục con, cháu của nó, để lọc theo danh mục cha thì ra cả hàng của
     * nhánh con (giống bộ lọc danh mục trang khách). {@code null} khi không lọc theo danh mục.
     */
    public Set<Integer> categoryBranch(Integer id) {
        if (id == null) return null;
        var branch = new HashSet<Integer>();
        branch.add(id);
        List<Map<String, Object>> links;
        try {
            links = db.queryForList("SELECT category_id,parent_id FROM category WHERE parent_id IS NOT NULL");
        } catch (org.springframework.dao.DataAccessException e) {
            return branch; // DB chưa chạy migration 2026-11-10_category_hierarchy.sql: chưa có danh mục con
        }
        for (boolean grew = true; grew; ) {
            grew = false;
            for (var l : links)
                if (branch.contains(num(l, "parent_id")) && branch.add(num(l, "category_id"))) grew = true;
        }
        return branch;
    }

    /** Hàng có danh mục thuộc nhánh {@link #categoryBranch} không ({@code branch == null}: không lọc). */
    public static boolean inCategoryBranch(Set<Integer> branch, Map<String, Object> row) {
        return branch == null || (row.get("category_id") != null && branch.contains(num(row, "category_id")));
    }

    /** Danh mục cho ô lọc dạng cây ở trang kho: category_id, category_name, parent_id (nếu DB đã có cột). */
    public List<Map<String, Object>> categoryOptions() {
        try {
            return db.queryForList("SELECT category_id,category_name,parent_id FROM category ORDER BY category_name");
        } catch (org.springframework.dao.DataAccessException e) {
            return db.queryForList("SELECT category_id,category_name FROM category ORDER BY category_name");
        }
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
                    Map.entry("stock_count_item", "count_item_id"),
                    Map.entry("product_unit", "unit_id"));

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
        var taken = take(actor, detail, qty, stock, orderItem, key, reason);
        if (db.update(
                        "UPDATE product_detail SET stock_quantity=stock_quantity-? WHERE detail_id=? AND stock_quantity>=?",
                        qty,
                        detail,
                        qty)
                != 1) throw invalid("Biến thể #" + detail + ": tồn vừa thay đổi, hãy tải lại.");
        stockAlert(detail, stock);
        units.clampDefects(detail, "SOLD", reason);
        return taken;
    }

    /**
     * Ledger for a sale whose stock_quantity was already reduced by code outside the warehouse (the
     * Facebook order screen deducts on creation without a ledger row). Writes the same ORDER_OUT rows
     * and takes the same locations as {@link #sell}, but does not touch stock_quantity again. Caller
     * holds {@link #lock()}.
     */
    public void recordSold(int actor, int detail, int qty, int orderItem, String key, String reason) {
        var variant = one("SELECT stock_quantity FROM product_detail WHERE detail_id=? FOR UPDATE", detail);
        take(actor, detail, qty, num(variant, "stock_quantity") + qty, orderItem, key, reason);
        units.clampDefects(detail, "SOLD", reason);
    }

    /** Unplaced first, then the fullest locations; one ORDER_OUT row per source. {@code stock} = before the sale. */
    private List<Map<String, Object>> take(
            int actor, int detail, int qty, int stock, int orderItem, String key, String reason) {
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
        if (left > 0) throw invalid("Biến thể #" + detail + ": tồn vừa thay đổi, hãy tải lại.");
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
        // Độ lệch giờ (làm tròn 15 phút) gần như không đổi: nhớ 10 phút để khỏi hỏi DB ở mỗi request
        long nowMs = System.currentTimeMillis();
        var cached = offsetCache;
        if (cached != null && nowMs - offsetCachedAt < 600_000) return cached;
        var dbNow = time(db.queryForObject("SELECT LOCALTIMESTAMP", Object.class));
        long minutes = java.time.Duration.between(java.time.LocalDateTime.now(STORE_ZONE), dbNow).toMinutes();
        var offset = java.time.Duration.ofMinutes(Math.round(minutes / 15.0) * 15);
        offsetCache = offset;
        offsetCachedAt = nowMs;
        return offset;
    }

    private volatile java.time.Duration offsetCache;
    private volatile long offsetCachedAt;

    /** Rewrites the given timestamp fields of a row from database time to store (Vietnam) time. */
    public static void storeTime(Map<String, Object> row, java.time.Duration offset, String... fields) {
        for (var f : fields) if (row.get(f) != null) row.put(f, time(row.get(f)).minus(offset));
    }

    /** One notification for every active Owner (the bell in the header). */
    public void notifyOwners(String entityType, int entity, String title, String message, String type) {
        int id =
                insert(
                        "INSERT INTO notification(title,message,type,related_entity_type,related_entity_id)"
                                + " VALUES(?,?,?,?,?)",
                        title.length() > 200 ? title.substring(0, 200) : title,
                        message,
                        type,
                        entityType,
                        entity);
        db.update(
                "INSERT INTO user_notification(user_id,notification_id) SELECT u.user_id,? FROM `user`"
                        + " u JOIN `role` r ON r.role_id=u.role_id WHERE r.role_name='OWNER' AND"
                        + " u.account_status='ACTIVE'",
                id);
    }

    /**
     * Call after stock of a variant went down from {@code before}. Notifies the Owner once when it
     * runs out (0) or first drops to its minimum stock; replaces the warning panel on the inventory page.
     */
    public void stockAlert(int detail, int before) {
        var v =
                one(
                        "SELECT d.stock_quantity,d.min_stock_quantity,d.color,d.size,p.product_name FROM product_detail d"
                                + " JOIN product p ON p.product_id=d.product_id WHERE d.detail_id=?",
                        detail);
        int after = num(v, "stock_quantity");
        if (after >= before) return;
        String name = v.get("product_name") + " · " + v.get("color") + " · " + v.get("size");
        Integer min = v.get("min_stock_quantity") == null ? null : num(v, "min_stock_quantity");
        if (after == 0)
            notifyOwners("product_detail", detail, "Hết hàng: " + name, name + " đã hết hàng trong kho.", "STOCK_OUT");
        else if (min != null && before > min && after <= min)
            notifyOwners(
                    "product_detail",
                    detail,
                    "Sắp hết hàng: " + name,
                    name + " chỉ còn " + after + " sản phẩm (ngưỡng tối thiểu " + min + ").",
                    "STOCK_LOW");
    }

    /** Runs a query that needs database/migrations/2026-11-06_inventory.sql; explains instead of a 500. */
    public <T> T migrated(java.util.function.Supplier<T> action) {
        try {
            return action.get();
        } catch (org.springframework.jdbc.BadSqlGrammarException e) {
            String m = String.valueOf(e.getMostSpecificCause().getMessage()).toLowerCase(Locale.ROOT);
            if (m.contains("scanned_quantity") || m.contains("expected_quantity") || m.contains("receive_note"))
                throw new ApiException(
                        503,
                        "MIGRATION_REQUIRED",
                        "Database chưa có phần kiểm hàng bằng quét. Cần chạy database/migrations/2026-11-15_receipt_scan_check.sql.");
            if (m.contains("product_unit"))
                throw new ApiException(
                        503,
                        "MIGRATION_REQUIRED",
                        "Database chưa có bảng hàng lỗi. Cần chạy database/migrations/2026-11-16_product_unit.sql.");
            if (m.contains("request_status") || m.contains("request_shelf_id"))
                throw new ApiException(
                        503,
                        "MIGRATION_REQUIRED",
                        "Database chưa có phần yêu cầu xếp kệ. Cần chạy database/migrations/2026-11-18_move_request_columns.sql.");
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
