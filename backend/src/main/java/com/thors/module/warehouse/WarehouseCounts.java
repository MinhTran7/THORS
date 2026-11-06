package com.thors.module.warehouse;

import static com.thors.module.warehouse.WarehouseStore.*;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.warehouse.WarehouseRequests.*;
import java.util.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Stock count (kiểm kê). A count records, per variant and location (or the unplaced part), the
 * system quantity at the time it was saved and the counted quantity. Draft / pending counts never
 * touch stock. On confirmation every line is compared with the current quantity: anything that
 * moved since counting blocks the confirmation (the count has to be saved again to take the new
 * system figures), so an old count never silently overwrites newer stock. Differences need a reason;
 * "missing document" differences must be fixed with the original business document (receipt, sale,
 * supplier return) and block confirmation. Confirmed differences are ADJUSTMENT rows in the ledger.
 */
@Service
@Transactional(isolation = Isolation.READ_COMMITTED)
public class WarehouseCounts {
    static final Map<String, String> REASONS =
            Map.of(
                    "COUNT_ERROR", "Sai lệch ghi nhận trước đây",
                    "DAMAGED", "Hàng hư hỏng",
                    "LOST", "Thất lạc / mất",
                    "FOUND", "Tìm thấy hàng",
                    "MISSING_DOCUMENT", "Thiếu chứng từ (nhập/bán/trả chưa ghi)");

    private final WarehouseStore s;
    private final WarehousePolicy policy;

    public WarehouseCounts(WarehouseStore s, WarehousePolicy policy) {
        this.s = s;
        this.policy = policy;
    }

    static String code(int id) {
        return String.format(Locale.ROOT, "KK%05d", id);
    }

    private Map<String, Object> header(int id) {
        return s.migrated(() -> s.one("SELECT * FROM stock_count WHERE count_id=?", id));
    }

    /** Current system quantity of a line target; null location = unplaced part. Locks the rows. */
    private int current(int detail, Integer location) {
        var variant = s.one("SELECT stock_quantity FROM product_detail WHERE detail_id=? FOR UPDATE", detail);
        if (location != null) {
            var rows = s.jdbc().queryForList(
                    "SELECT detail_id,quantity FROM product_location WHERE product_location_id=? FOR UPDATE", location);
            if (rows.isEmpty() || num(rows.get(0), "detail_id") != detail)
                throw invalid("Vị trí kiểm kê không chứa biến thể #" + detail + ".");
            return num(rows.get(0), "quantity");
        }
        long assigned = s.count("SELECT COALESCE(SUM(quantity),0) FROM product_location WHERE detail_id=?", detail);
        long unplaced = num(variant, "stock_quantity") - assigned;
        if (unplaced < 0)
            throw invalid("Biến thể #" + detail + ": tồn vị trí lớn hơn tổng tồn, cần đối soát trước khi kiểm kê.");
        return (int) unplaced;
    }

    private void writeLines(int id, Count r) {
        var seen = new HashSet<String>();
        for (var l : r.lines()) {
            if (!seen.add(l.detailId() + ":" + l.locationId()))
                throw invalid("Một biến thể chỉ kiểm một lần tại mỗi vị trí (và một lần cho phần chưa xếp).");
            int system = current(l.detailId(), l.locationId());
            boolean differs = l.counted() != system;
            if (differs && l.reason() == null)
                throw invalid("Dòng #" + l.detailId() + " lệch " + (l.counted() - system) + ": cần chọn lý do chênh lệch.");
            s.insert(
                    "INSERT INTO stock_count_item(count_id,detail_id,product_location_id,system_quantity,counted_quantity,reason_code,note)"
                            + " VALUES(?,?,?,?,?,?,?)",
                    id,
                    l.detailId(),
                    l.locationId(),
                    system,
                    l.counted(),
                    differs ? l.reason() : null,
                    l.note() == null || l.note().isBlank() ? null : l.note().trim());
        }
    }

    public Map<String, Object> create(Account a, Count r) {
        policy.view(a);
        s.lock();
        if (r.requestKey() != null) {
            var old = s.migrated(() -> s.jdbc().queryForList("SELECT count_id FROM stock_count WHERE request_key=?", r.requestKey()));
            if (!old.isEmpty()) return detail(a, num(old.get(0), "count_id"));
        }
        int id;
        try {
            id = s.migrated(() -> s.insert(
                    "INSERT INTO stock_count(status,note,created_by,counted_at,request_key) VALUES('DRAFT',?,?,CURRENT_TIMESTAMP,?)",
                    blank(r.note()),
                    a.id(),
                    r.requestKey()));
        } catch (DuplicateKeyException e) {
            throw invalid("Phiếu kiểm kê này đã được gửi, hãy tải lại.");
        }
        writeLines(id, r);
        s.audit(a.id(), "COUNT_CREATE", id, code(id));
        return detail(a, id);
    }

    private static String blank(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    private void editable(Account a, Map<String, Object> doc) {
        boolean ownerUser = "OWNER".equals(a.role());
        if (!ownerUser && num(doc, "created_by") != a.id())
            throw new ApiException(403, "WAREHOUSE_FORBIDDEN", "Chỉ người lập phiếu hoặc chủ cửa hàng được sửa phiếu kiểm kê.");
        if (!(is(doc, "status", "DRAFT") || ownerUser && is(doc, "status", "PENDING_CONFIRMATION")))
            throw invalid("Chỉ sửa được phiếu kiểm kê nháp (chủ cửa hàng sửa được phiếu chờ xác nhận).");
    }

    /** Saving again re-reads the system quantities (new count time). */
    public Map<String, Object> edit(Account a, int id, Count r) {
        policy.view(a);
        s.lock();
        var doc = header(id);
        editable(a, doc);
        s.jdbc().update("DELETE FROM stock_count_item WHERE count_id=?", id);
        s.jdbc().update("UPDATE stock_count SET note=?,counted_at=CURRENT_TIMESTAMP WHERE count_id=?", blank(r.note()), id);
        writeLines(id, r);
        s.audit(a.id(), "COUNT_EDIT", id, code(id));
        return detail(a, id);
    }

    public Map<String, Object> submit(Account a, int id) {
        policy.view(a);
        s.lock();
        var doc = header(id);
        if ("OWNER".equals(a.role()))
            throw invalid("Chủ cửa hàng xác nhận trực tiếp phiếu kiểm kê, không cần gửi xác nhận.");
        if (num(doc, "created_by") != a.id())
            throw new ApiException(403, "WAREHOUSE_FORBIDDEN", "Chỉ người lập phiếu được gửi xác nhận.");
        if (s.jdbc().update("UPDATE stock_count SET status='PENDING_CONFIRMATION' WHERE count_id=? AND status='DRAFT'", id) != 1)
            throw invalid("Chỉ gửi xác nhận được phiếu nháp.");
        s.audit(a.id(), "COUNT_SUBMIT", id, code(id));
        return detail(a, id);
    }

    /** Owner confirms a draft directly or approves a pending count. Stock changes only here. */
    public Map<String, Object> confirm(Account a, int id) {
        policy.owner(a);
        s.lock();
        var doc = header(id);
        if (is(doc, "status", "CONFIRMED")) return detail(a, id); // repeated request: already applied once
        if (!is(doc, "status", "DRAFT") && !is(doc, "status", "PENDING_CONFIRMATION"))
            throw invalid("Phiếu kiểm kê không còn chờ xác nhận.");
        var lines = s.jdbc().queryForList(
                """
                SELECT i.*,p.product_name,d.color,d.size FROM stock_count_item i
                JOIN product_detail d ON d.detail_id=i.detail_id JOIN product p ON p.product_id=d.product_id
                WHERE i.count_id=? ORDER BY i.detail_id,i.count_item_id
                """,
                id);
        var labels = new HashMap<Integer, String>();
        for (var row : s.jdbc().queryForList(
                "SELECT l.product_location_id,r.rack_code,t.level_number FROM product_location l JOIN shelf_level t"
                        + " ON t.shelf_level_id=l.shelf_level_id JOIN rack r ON r.rack_id=t.rack_id"))
            labels.put(num(row, "product_location_id"), "" + row.get("rack_code") + row.get("level_number"));
        var changed = new ArrayList<String>();
        var missing = new ArrayList<String>();
        for (var l : lines) {
            Integer location = l.get("product_location_id") == null ? null : num(l, "product_location_id");
            String label = l.get("product_name") + " · " + l.get("color") + " · " + l.get("size") + " · "
                    + (location == null ? "chưa xếp" : labels.getOrDefault(location, "?"));
            int now = current(num(l, "detail_id"), location);
            if (now != num(l, "system_quantity"))
                changed.add(label + ": lúc đếm " + num(l, "system_quantity") + ", hiện " + now);
            if (num(l, "counted_quantity") != num(l, "system_quantity") && is(l, "reason_code", "MISSING_DOCUMENT"))
                missing.add(label);
        }
        if (!changed.isEmpty())
            throw new ApiException(
                    409,
                    "COUNT_STALE",
                    "Tồn đã thay đổi sau khi đếm (" + String.join("; ", changed)
                            + "). Không ghi đè bằng số đếm cũ: hãy mở phiếu, lưu lại để lấy số hệ thống mới và kiểm tra lại số đếm.");
        if (!missing.isEmpty())
            throw invalid("Chênh lệch do thiếu chứng từ phải được lập đúng chứng từ gốc (phiếu nhập, đơn bán, trả NCC) trước: "
                    + String.join("; ", missing) + ". Sau đó lưu lại phiếu kiểm kê.");
        var warnings = new ArrayList<String>();
        for (var l : lines) {
            int detail = num(l, "detail_id");
            int diff = num(l, "counted_quantity") - num(l, "system_quantity");
            if (diff == 0) continue;
            Integer location = l.get("product_location_id") == null ? null : num(l, "product_location_id");
            if (location != null
                    && s.jdbc().update(
                                    "UPDATE product_location SET quantity=?,updated_at=CURRENT_TIMESTAMP WHERE product_location_id=? AND quantity=?",
                                    num(l, "counted_quantity"),
                                    location,
                                    num(l, "system_quantity"))
                            != 1) throw invalid("Vị trí vừa thay đổi, hãy tải lại.");
            if (s.jdbc().update(
                            "UPDATE product_detail SET stock_quantity=stock_quantity+? WHERE detail_id=? AND stock_quantity+?>=0",
                            diff,
                            detail,
                            diff)
                    != 1) throw invalid("Tồn của biến thể #" + detail + " không thể âm.");
            s.jdbc().update(
                    """
                INSERT INTO stock_adjustment(detail_id,quantity_change,reason,adjusted_by,movement_type,movement_quantity,source_location_id,idempotency_key)
                VALUES(?,?,?,?,'ADJUSTMENT',?,?,?)
                """,
                    detail,
                    diff,
                    trim(
                            "Kiểm kê " + code(id) + ": " + REASONS.get((String) l.get("reason_code"))
                                    + (l.get("note") == null ? "" : " — " + l.get("note"))),
                    a.id(),
                    Math.abs(diff),
                    location,
                    "count:" + id + ":" + num(l, "count_item_id"));
            int stock = num(s.one("SELECT stock_quantity FROM product_detail WHERE detail_id=?", detail), "stock_quantity");
            int held = s.held(detail);
            if (held > stock)
                warnings.add(l.get("product_name") + " · " + l.get("color") + " · " + l.get("size")
                        + ": tồn còn " + stock + " nhưng đơn bán đang giữ " + held + " — cần xử lý các đơn này.");
        }
        if (s.jdbc().update(
                        "UPDATE stock_count SET status='CONFIRMED',confirmed_by=?,confirmed_at=CURRENT_TIMESTAMP WHERE count_id=?"
                                + " AND status IN ('DRAFT','PENDING_CONFIRMATION')",
                        a.id(),
                        id)
                != 1) throw invalid("Phiếu kiểm kê vừa thay đổi, hãy tải lại.");
        s.audit(a.id(), "COUNT_CONFIRM", id, code(id));
        var result = copy(detail(a, id));
        result.put("warnings", warnings);
        return result;
    }

    private static String trim(String v) {
        return v.length() > 255 ? v.substring(0, 255) : v;
    }

    public Map<String, Object> end(Account a, int id, String action, String reason) {
        policy.view(a);
        s.lock();
        if (reason == null || reason.isBlank()) throw invalid("Cần nhập lý do.");
        var doc = header(id);
        boolean ownerUser = "OWNER".equals(a.role());
        int changed;
        if ("reject".equals(action)) {
            policy.owner(a);
            changed = s.jdbc().update(
                    "UPDATE stock_count SET status='REJECTED',rejection_reason=?,confirmed_by=?,confirmed_at=CURRENT_TIMESTAMP"
                            + " WHERE count_id=? AND status='PENDING_CONFIRMATION'",
                    trim(reason.trim()),
                    a.id(),
                    id);
            if (changed != 1) throw invalid("Chỉ từ chối được phiếu đang chờ xác nhận.");
        } else {
            if (!ownerUser && num(doc, "created_by") != a.id())
                throw new ApiException(403, "WAREHOUSE_FORBIDDEN", "Chỉ người lập phiếu hoặc chủ cửa hàng được hủy.");
            changed = s.jdbc().update(
                    "UPDATE stock_count SET status='CANCELLED',rejection_reason=? WHERE count_id=? AND status IN"
                            + " ('DRAFT','PENDING_CONFIRMATION')",
                    trim(reason.trim()),
                    id);
            if (changed != 1) throw invalid("Chỉ hủy được phiếu nháp hoặc chờ xác nhận.");
        }
        s.audit(a.id(), "COUNT_" + action.toUpperCase(Locale.ROOT), id, reason.trim());
        return detail(a, id);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<Map<String, Object>> list(Account a, Integer detail) {
        policy.view(a);
        var offset = s.clockOffset();
        return WarehouseInventory.stored(offset, s.migrated(() -> s.jdbc().queryForList(
                """
                SELECT c.*,u.full_name AS creator_name,v.full_name AS confirmer_name,
                  (SELECT COUNT(*) FROM stock_count_item i WHERE i.count_id=c.count_id) AS line_count,
                  (SELECT COUNT(*) FROM stock_count_item i WHERE i.count_id=c.count_id AND i.counted_quantity<>i.system_quantity) AS diff_lines,
                  (SELECT COALESCE(SUM(i.counted_quantity-i.system_quantity),0) FROM stock_count_item i WHERE i.count_id=c.count_id) AS net_difference
                FROM stock_count c JOIN `user` u ON u.user_id=c.created_by LEFT JOIN `user` v ON v.user_id=c.confirmed_by
                WHERE (? IS NULL OR EXISTS (SELECT 1 FROM stock_count_item i WHERE i.count_id=c.count_id AND i.detail_id=?))
                ORDER BY c.count_id DESC
                """,
                detail,
                detail)), "created_at", "counted_at", "confirmed_at");
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Map<String, Object> detail(Account a, int id) {
        policy.view(a);
        var doc = copy(s.migrated(() -> s.one(
                """
                SELECT c.*,u.full_name AS creator_name,v.full_name AS confirmer_name FROM stock_count c
                JOIN `user` u ON u.user_id=c.created_by LEFT JOIN `user` v ON v.user_id=c.confirmed_by WHERE c.count_id=?
                """,
                id)));
        doc.put("code", code(id));
        var offset = s.clockOffset();
        storeTime(doc, offset, "created_at", "counted_at", "confirmed_at");
        var lines = new ArrayList<Map<String, Object>>();
        boolean open = is(doc, "status", "DRAFT") || is(doc, "status", "PENDING_CONFIRMATION");
        for (var row : s.jdbc().queryForList(
                """
                SELECT i.*,p.product_name,p.product_id,d.color,d.size,d.barcode,d.stock_quantity,r.rack_code,t.level_number,
                  (SELECT COALESCE(SUM(x.quantity),0) FROM product_location x WHERE x.detail_id=i.detail_id) AS assigned_now,
                  l.quantity AS location_now
                FROM stock_count_item i JOIN product_detail d ON d.detail_id=i.detail_id JOIN product p ON p.product_id=d.product_id
                LEFT JOIN product_location l ON l.product_location_id=i.product_location_id
                LEFT JOIN shelf_level t ON t.shelf_level_id=l.shelf_level_id LEFT JOIN rack r ON r.rack_id=t.rack_id
                WHERE i.count_id=? ORDER BY p.product_name,d.color,d.size,i.count_item_id
                """,
                id)) {
            var line = copy(row);
            line.put("location_label", row.get("product_location_id") == null ? null : "" + row.get("rack_code") + row.get("level_number"));
            line.put("difference", num(row, "counted_quantity") - num(row, "system_quantity"));
            line.put("reason_label", row.get("reason_code") == null ? null : REASONS.get((String) row.get("reason_code")));
            if (open) {
                long now = row.get("product_location_id") == null
                        ? num(row, "stock_quantity") - ((Number) row.get("assigned_now")).longValue()
                        : num(row, "location_now");
                line.put("current_quantity", now);
                line.put("changed_since_count", now != num(row, "system_quantity"));
            }
            lines.add(line);
        }
        doc.put("lines", lines);
        doc.put(
                "history",
                WarehouseInventory.stored(offset, s.jdbc().queryForList(
                        """
                SELECT l.action_type,l.performed_at,l.new_value,u.full_name AS actor_name FROM audit_log l
                LEFT JOIN `user` u ON u.user_id=l.user_id
                WHERE l.entity_affected='warehouse' AND l.entity_id=? AND l.action_type LIKE 'COUNT_%' ORDER BY l.log_id
                """,
                        id), "performed_at"));
        return doc;
    }
}
