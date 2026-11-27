package com.thors.module.warehouse.service;

import com.thors.module.warehouse.repository.WarehouseStore;
import com.thors.module.warehouse.repository.ProductUnits;

import static com.thors.module.warehouse.repository.WarehouseStore.*;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Hàng lỗi. Kho dùng mã chung cho mỗi biến thể nên báo lỗi = quét mã biến thể + số chiếc lỗi; mỗi chiếc
 * lỗi là một dòng trong product_unit (cột defect_*, không có bảng riêng; lịch sử nằm trong audit_log).
 *
 * <p>Báo lỗi không đổi tồn: chiếc lỗi vẫn trong kho, được đếm riêng để quầy bán cảnh báo và để trả NCC
 * đóng lỗi trước. Tồn chỉ giảm khi trả NCC (phiếu trả) hoặc chủ cửa hàng "Bỏ hẳn" ({@link #discard}).
 *
 * <p>Mẫu lỗi: {@link #DEFAULT_TYPES} + các lỗi chủ cửa hàng đã tự gõ (lấy lại từ những lỗi đã ghi).
 */
@Service
@Transactional(isolation = Isolation.READ_COMMITTED)
public class WarehouseDefects {
    static final List<String> DEFAULT_TYPES =
            List.of("Rách", "Bung chỉ", "Ố bẩn", "Lỗi khóa kéo / cúc", "Phai màu", "Sai màu / size", "Lỗi in / thêu", "Khác");
    static final Set<String> SOURCES = Set.of("SUPPLIER", "WAREHOUSE", "CUSTOMER");
    static final Set<String> STATUSES = Set.of("OPEN", "FIXED", "DISCARDED", "RETURNED", "SOLD");

    private final WarehouseStore s;
    private final WarehousePolicy policy;
    private final WarehousePhotos photos;

    public WarehouseDefects(WarehouseStore s, WarehousePolicy policy, WarehousePhotos photos) {
        this.s = s;
        this.policy = policy;
        this.photos = photos;
    }

    private void requireColumns() {
        if (!s.units().ready() || !s.units().defectsReady())
            throw new ApiException(
                    503,
                    "MIGRATION_REQUIRED",
                    "Database chưa có phần hàng lỗi. Cần chạy database/migrations/2026-11-16_product_unit.sql rồi"
                            + " 2026-11-17_unit_defect.sql.");
    }

    /** Mẫu lỗi để chọn: lỗi mặc định rồi đến các lỗi tự gõ đã từng dùng. */
    // Chỉ đọc: chạy chung transaction nếu đã có, không tự mở transaction mới (mỗi transaction tốn thêm ~7 lượt gửi lệnh tới DB cloud)
    @Transactional(propagation = Propagation.SUPPORTS)
    public List<String> types(Account a) {
        policy.view(a);
        requireColumns();
        return knownTypes();
    }

    private List<String> knownTypes() {
        var all = new LinkedHashSet<>(DEFAULT_TYPES);
        var used = new TreeSet<String>(String.CASE_INSENSITIVE_ORDER);
        for (var text : s.jdbc().queryForList(
                "SELECT DISTINCT defect_types FROM product_unit WHERE defect_types IS NOT NULL", String.class))
            used.addAll(Arrays.asList(text.split(", ")));
        for (var t : used) if (all.stream().noneMatch(x -> x.equalsIgnoreCase(t))) all.add(t);
        return List.copyOf(all);
    }

    /**
     * Báo {@code quantity} chiếc lỗi của biến thể có mã chung {@code rawCode}: thêm {@code quantity} dòng lỗi
     * đang mở. Không vượt số chiếc chưa báo lỗi (tồn - đang lỗi). Tồn không đổi. Chủ cửa hàng được gõ lỗi
     * mới; người nhà chọn trong mẫu có sẵn.
     */
    public Map<String, Object> report(
            Account a,
            String rawCode,
            Integer quantity,
            List<String> types,
            String description,
            String source,
            List<String> photoKeys) {
        policy.view(a);
        requireColumns();
        String code = rawCode == null ? "" : rawCode.trim().toUpperCase(Locale.ROOT);
        if (code.isEmpty()) throw invalid("Quét hoặc nhập mã hàng.");
        int qty = quantity == null ? 1 : quantity;
        if (qty < 1 || qty > 1000) throw invalid("Số chiếc lỗi từ 1 đến 1000.");
        if (!SOURCES.contains(source)) throw invalid("Chọn nguồn lỗi.");
        var known = knownTypes();
        var chosen = new ArrayList<String>();
        for (var raw : types == null ? List.<String>of() : types) {
            String t = raw == null ? "" : raw.trim().replaceAll("\\s+", " ");
            if (t.isEmpty()) continue;
            var match = known.stream().filter(k -> k.equalsIgnoreCase(t)).findFirst();
            if (match.isEmpty()) {
                if (!"OWNER".equals(a.role()))
                    throw invalid("Lỗi \"" + t + "\" chưa có trong danh sách. Nhờ chủ cửa hàng thêm lỗi mới.");
                if (t.length() > 60) throw invalid("Tên lỗi tối đa 60 ký tự.");
                if (t.contains(",")) throw invalid("Tên lỗi không được có dấu phẩy.");
            }
            String name = match.orElse(t);
            if (!chosen.contains(name)) chosen.add(name);
        }
        if (chosen.isEmpty()) throw invalid("Chọn ít nhất một lỗi.");
        String text = String.join(", ", chosen);
        if (text.length() > 500) throw invalid("Chọn ít lỗi hơn.");
        String desc = description == null || description.isBlank() ? null : description.trim();
        if (desc != null && desc.length() > 500) throw invalid("Mô tả tối đa 500 ký tự.");
        var keys = photoKeys == null ? List.<String>of() : photoKeys.stream().distinct().toList();
        if (keys.size() > 8) throw invalid("Tối đa 8 ảnh.");
        keys.forEach(photos::existing);

        s.lock();
        var found = s.jdbc().queryForList(
                "SELECT d.detail_id,d.color,d.size,p.product_name FROM product_detail d JOIN product p ON p.product_id=d.product_id"
                        + " WHERE d.barcode=? AND d.status<>'DELETED'",
                code);
        if (found.isEmpty()) throw new ApiException(404, "BARCODE_NOT_FOUND", "Không tìm thấy hàng hóa có mã " + code + ".");
        int detail = num(found.get(0), "detail_id");
        String label = found.get(0).get("product_name") + " · " + found.get(0).get("color") + " · " + found.get(0).get("size");
        int stock = num(s.one("SELECT stock_quantity FROM product_detail WHERE detail_id=? FOR UPDATE", detail), "stock_quantity");
        int open = s.units().openDefects(detail);
        if (qty > stock - open)
            throw invalid(String.format(Locale.ROOT,
                    "%s: tồn %d, đang báo lỗi %d — chỉ báo thêm được tối đa %d chiếc.",
                    label, stock, open, Math.max(0, stock - open)));
        var ids = s.units().create(detail, qty, "Báo lỗi");
        s.jdbc().update(
                "UPDATE product_unit SET defect_status='OPEN',defect_types=?,defect_note=?,defect_source=?,defect_photos=?,"
                        + "defect_by=?,defect_at=CURRENT_TIMESTAMP WHERE unit_id IN (" + ProductUnits.marks(ids.size()) + ")",
                ProductUnits.concat(
                        new Object[] {text, desc, source, keys.isEmpty() ? null : String.join(",", keys), a.id()}, ids));
        s.audit(a.id(), "DEFECT_REPORT", ids.get(0), trim(code + " ×" + qty + ": " + text + (desc == null ? "" : " — " + desc)));
        var items = shaped(s.jdbc().queryForList(
                s.withTierLabel(ROW) + " WHERE u.unit_id IN (" + ProductUnits.marks(ids.size()) + ") ORDER BY u.unit_id",
                ids.toArray()));
        return Map.of("code", code, "quantity", qty, "open", open + qty, "items", items);
    }

    private static final String ROW =
            """
            SELECT u.unit_id AS defect_id,u.unit_id,u.detail_id,u.defect_types,u.defect_note AS description,
              u.defect_source AS source,u.defect_photos AS photo_keys,u.defect_status AS status,u.defect_at AS reported_at,
              u.defect_resolved_at AS resolved_at,u.defect_resolve_note AS resolve_note,ru.full_name AS reporter_name,
              vu.full_name AS resolver_name,d.barcode,u.status AS unit_status,d.color,d.size,p.product_name,p.product_id,
              TIER_LABEL AS tier_label
            FROM product_unit u
            JOIN product_detail d ON d.detail_id=u.detail_id JOIN product p ON p.product_id=d.product_id
            LEFT JOIN product_location l ON l.product_location_id=u.product_location_id
            LEFT JOIN shelf_level t ON t.shelf_level_id=l.shelf_level_id LEFT JOIN rack r ON r.rack_id=t.rack_id
            LEFT JOIN `user` ru ON ru.user_id=u.defect_by LEFT JOIN `user` vu ON vu.user_id=u.defect_resolved_by
            """;

    private List<Map<String, Object>> shaped(List<Map<String, Object>> rows) {
        var offset = s.clockOffset();
        var out = new ArrayList<Map<String, Object>>();
        for (var row : rows) {
            var m = copy(row);
            m.put("location", row.get("tier_label"));
            m.put("photo_keys", row.get("photo_keys") == null ? List.of() : List.of(((String) row.get("photo_keys")).split(",")));
            m.put("types", List.of(((String) row.get("defect_types")).split(", ")));
            storeTime(m, offset, "reported_at", "resolved_at");
            out.add(m);
        }
        return out;
    }

    private Map<String, Object> one(int unitId) {
        return shaped(s.jdbc().queryForList(s.withTierLabel(ROW) + " WHERE u.unit_id=?", unitId)).get(0);
    }

    /** Danh sách chiếc lỗi theo trạng thái lỗi (mặc định đang lỗi), tìm theo mã hàng / tên sản phẩm. */
    // Chỉ đọc: chạy chung transaction nếu đã có, không tự mở transaction mới (mỗi transaction tốn thêm ~7 lượt gửi lệnh tới DB cloud)
    @Transactional(propagation = Propagation.SUPPORTS)
    public Map<String, Object> list(Account a, String status, String q) {
        policy.view(a);
        requireColumns();
        var where = new StringBuilder(" WHERE u.defect_status IS NOT NULL");
        var args = new ArrayList<Object>();
        String st = status == null || status.isBlank() ? "OPEN" : status.trim().toUpperCase(Locale.ROOT);
        if (!"ALL".equals(st)) {
            if (!STATUSES.contains(st)) throw invalid("Trạng thái không hợp lệ.");
            where.append(" AND u.defect_status=?");
            args.add(st);
        }
        if (q != null && !q.isBlank()) {
            where.append(" AND (UPPER(d.barcode) LIKE ? OR LOWER(p.product_name) LIKE ?)");
            String like = "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
            args.add(like.toUpperCase(Locale.ROOT));
            args.add(like);
        }
        var rows = s.jdbc().queryForList(s.withTierLabel(ROW) + where + " ORDER BY u.defect_at DESC,u.unit_id DESC LIMIT 500", args.toArray());
        var counts = new LinkedHashMap<String, Long>();
        for (var row : s.jdbc().queryForList(
                "SELECT defect_status,COUNT(*) AS n FROM product_unit WHERE defect_status IS NOT NULL GROUP BY defect_status"))
            counts.put((String) row.get("defect_status"), ((Number) row.get("n")).longValue());
        return Map.of("items", shaped(rows), "counts", counts);
    }

    private Map<String, Object> openDefect(int unitId) {
        var rows = s.jdbc().queryForList(
                "SELECT u.unit_id,u.detail_id,d.barcode,u.status,u.product_location_id,u.defect_types,u.defect_status"
                        + " FROM product_unit u JOIN product_detail d ON d.detail_id=u.detail_id WHERE u.unit_id=?",
                unitId);
        if (rows.isEmpty() || rows.get(0).get("defect_status") == null)
            throw new ApiException(404, "NOT_FOUND", "Không tìm thấy chiếc hàng lỗi.");
        if (!is(rows.get(0), "defect_status", "OPEN")) throw invalid("Lỗi này đã được xử lý.");
        return rows.get(0);
    }

    /** "Sửa xong": chiếc lại bán được bình thường. Tồn không đổi. */
    public Map<String, Object> fix(Account a, int unitId, String note) {
        policy.view(a);
        requireColumns();
        s.lock();
        var unit = openDefect(unitId);
        s.jdbc().update(
                "UPDATE product_unit SET defect_status='FIXED',defect_resolved_by=?,defect_resolved_at=CURRENT_TIMESTAMP,"
                        + "defect_resolve_note=? WHERE unit_id=? AND defect_status='OPEN'",
                a.id(), trim(note), unitId);
        s.audit(a.id(), "DEFECT_FIX", unitId, unit.get("barcode") + (note == null || note.isBlank() ? "" : ": " + trim(note)));
        return one(unitId);
    }

    /**
     * Chủ cửa hàng "Bỏ hẳn" một chiếc lỗi: tồn giảm 1, chiếc thành Mất/hỏng, sổ kho ghi một dòng điều chỉnh.
     * Lấy ra từ: ô kệ ghi trên dòng lỗi (dữ liệu cũ) nếu ô còn hàng; không thì hàng chưa xếp; không còn
     * hàng chưa xếp thì ô đang chứa nhiều nhất.
     */
    public Map<String, Object> discard(Account a, int unitId, String note) {
        policy.owner(a);
        requireColumns();
        String reason = trim(note);
        if (reason == null) throw invalid("Nhập lý do bỏ chiếc hàng này.");
        s.lock();
        var unit = openDefect(unitId);
        int detail = num(unit, "detail_id");
        String code = (String) unit.get("barcode");
        var variant = s.one("SELECT stock_quantity FROM product_detail WHERE detail_id=? FOR UPDATE", detail);
        int stock = num(variant, "stock_quantity");
        int held = s.held(detail);
        if (stock - 1 < held)
            throw invalid("Biến thể này đang giữ " + held + " cho đơn bán, tồn chỉ còn " + stock
                    + ". Xử lý đơn trước rồi mới bỏ chiếc lỗi.");
        if (stock < 1) throw invalid("Biến thể này đã hết hàng trong kho.");
        Integer location = unit.get("product_location_id") == null ? null : num(unit, "product_location_id");
        if (location != null
                && s.count("SELECT COALESCE(SUM(quantity),0) FROM product_location WHERE product_location_id=? AND detail_id=?",
                                location, detail) < 1) location = null;
        if (location == null) {
            long assigned = s.count("SELECT COALESCE(SUM(quantity),0) FROM product_location WHERE detail_id=?", detail);
            if (stock - assigned < 1) {
                var fullest = s.jdbc().queryForList(
                        "SELECT product_location_id FROM product_location WHERE detail_id=? AND quantity>0"
                                + " ORDER BY quantity DESC,product_location_id LIMIT 1",
                        Integer.class,
                        detail);
                if (!fullest.isEmpty()) location = fullest.get(0);
            }
        }
        if (location != null
                && s.jdbc().update(
                                "UPDATE product_location SET quantity=quantity-1,updated_at=CURRENT_TIMESTAMP WHERE product_location_id=?"
                                        + " AND quantity>=1",
                                location)
                        != 1) throw invalid("Ô kệ vừa thay đổi, hãy tải lại.");
        if (s.jdbc().update("UPDATE product_detail SET stock_quantity=stock_quantity-1 WHERE detail_id=? AND stock_quantity>=1", detail) != 1)
            throw invalid("Tồn vừa thay đổi, hãy tải lại.");
        String text = trim("Bỏ hàng lỗi " + code + " (" + unit.get("defect_types") + "): " + reason);
        s.jdbc().update(
                """
                INSERT INTO stock_adjustment(detail_id,quantity_change,reason,adjusted_by,movement_type,movement_quantity,source_location_id,idempotency_key)
                VALUES(?,-1,?,?,'ADJUSTMENT',1,?,?)
                """,
                detail, text, a.id(), location, "defect:" + unitId); // một chiếc chỉ bỏ được một lần
        s.jdbc().update(
                "UPDATE product_unit SET status='LOST',product_location_id=NULL,note=?,out_at=CURRENT_TIMESTAMP,"
                        + "defect_status='DISCARDED',defect_resolved_by=?,defect_resolved_at=CURRENT_TIMESTAMP,"
                        + "defect_resolve_note=?,updated_at=CURRENT_TIMESTAMP WHERE unit_id=?",
                text, a.id(), reason, unitId);
        s.stockAlert(detail, stock);
        s.audit(a.id(), "DEFECT_DISCARD", unitId, text);
        return one(unitId);
    }

    private static String trim(String v) {
        if (v == null || v.isBlank()) return null;
        v = v.trim();
        return v.length() > 255 ? v.substring(0, 255) : v;
    }
}
