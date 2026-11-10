package com.thors.module.warehouse;

import static com.thors.module.warehouse.WarehouseStore.*;

import com.thors.module.account.entity.Account;
import com.thors.module.warehouse.WarehouseRequests.Move;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Shelving / moving between shelves by a family member: "Lưu" only records a PENDING request;
 * product_location and stock_adjustment change when the owner confirms (the exact same move the
 * owner would do himself, keyed by the request key so a retried approval moves goods once).
 * The owner's own moves keep going straight through {@link WarehouseLayout#move}.
 * Table: database/migrations/2026-11-10_location_move_request.sql.
 */
@Service
@Transactional(isolation = Isolation.READ_COMMITTED)
public class WarehouseMoveRequests {
    private static final String PENDING = "PENDING";

    private final WarehouseStore s;
    private final WarehousePolicy policy;
    private final WarehouseLayout layout;
    private final WarehousePhotos photos;

    public WarehouseMoveRequests(
            WarehouseStore s, WarehousePolicy policy, WarehouseLayout layout, WarehousePhotos photos) {
        this.s = s;
        this.policy = policy;
        this.photos = photos;
        this.layout = layout;
    }

    /** Family: record the move for the owner. Owner: apply it at once, as before. */
    public Map<String, Object> submit(Account a, Move r) {
        policy.view(a);
        if ("OWNER".equals(a.role())) return layout.move(a, r);
        return s.migrated(() -> record(a, r));
    }

    private Map<String, Object> record(Account a, Move r) {
        s.lock();
        var old = s.jdbc().queryForList("SELECT * FROM location_move_request WHERE request_key=?", r.requestKey());
        if (!old.isEmpty()) {
            var m = old.get(0);
            if (num(m, "detail_id") != r.detailId()
                    || num(m, "quantity") != r.quantity()
                    || !Objects.equals(m.get("from_location_id"), r.fromLocationId())
                    || !Objects.equals(m.get("to_shelf_id"), r.toShelfId()))
                throw invalid("Mã thao tác đã được dùng với nội dung khác.");
            return view(num(m, "request_id"));
        }
        check(r);
        int id =
                s.insert(
                        "INSERT INTO location_move_request(detail_id,from_location_id,to_shelf_id,quantity,description,"
                                + "photo_keys,request_key,requested_by) VALUES(?,?,?,?,?,?,?,?)",
                        r.detailId(),
                        r.fromLocationId(),
                        r.toShelfId(),
                        r.quantity(),
                        r.description() == null || r.description().isBlank() ? null : r.description().trim(),
                        r.photoKeys() == null || r.photoKeys().isEmpty() ? null : String.join(",", r.photoKeys()),
                        r.requestKey(),
                        a.id());
        var row = view(id);
        notify(
                null,
                "Yêu cầu xếp kệ chờ xác nhận",
                row.get("requester_name") + " muốn " + describe(row) + ". Kho chưa thay đổi cho đến khi bạn xác nhận.",
                "WAREHOUSE_MOVE_PENDING",
                id);
        s.audit(a.id(), "LOCATION_MOVE_REQUEST", id, r.quantity() + " sản phẩm");
        return row;
    }

    public List<Map<String, Object>> list(Account a, String status) {
        policy.view(a);
        return s.migrated(() -> s.jdbc().queryForList(SELECT + " WHERE (? IS NULL OR m.status=?) ORDER BY m.request_id DESC LIMIT 200",
                blank(status), blank(status)));
    }

    /** Owner confirms: the move is carried out now; fails (nothing saved) if the shelves changed meanwhile. */
    public Map<String, Object> approve(Account a, int id) {
        policy.owner(a);
        s.lock();
        var m = s.one("SELECT * FROM location_move_request WHERE request_id=? FOR UPDATE", id);
        if (is(m, "status", "APPROVED")) return view(id);
        if (!is(m, "status", PENDING)) throw invalid("Yêu cầu này đã được xử lý.");
        String keys = (String) m.get("photo_keys");
        layout.move(
                a,
                new Move(
                        num(m, "detail_id"),
                        (Integer) intOrNull(m.get("from_location_id")),
                        (Integer) intOrNull(m.get("to_shelf_id")),
                        num(m, "quantity"),
                        (String) m.get("description"),
                        keys == null || keys.isBlank() ? List.of() : List.of(keys.split(",")),
                        (String) m.get("request_key")));
        s.jdbc()
                .update(
                        "UPDATE location_move_request SET status='APPROVED',decided_by=?,decided_at=CURRENT_TIMESTAMP"
                                + " WHERE request_id=?",
                        a.id(),
                        id);
        var row = view(id);
        notify(num(m, "requested_by"), "Yêu cầu xếp kệ đã được xác nhận", "Đã lưu: " + describe(row) + ".",
                "WAREHOUSE_MOVE_APPROVED", id);
        s.audit(a.id(), "LOCATION_MOVE_APPROVE", id, "");
        return row;
    }

    /** Owner rejects, or the requester withdraws his own pending request. Stock never changes. */
    public Map<String, Object> end(Account a, int id, String action, String reason) {
        policy.view(a);
        s.lock();
        var m = s.one("SELECT * FROM location_move_request WHERE request_id=? FOR UPDATE", id);
        boolean reject = "reject".equals(action);
        if (reject) policy.owner(a);
        else if (num(m, "requested_by") != a.id()) policy.owner(a);
        if (!is(m, "status", PENDING)) throw invalid("Yêu cầu này đã được xử lý.");
        if (reject && (reason == null || reason.isBlank())) throw invalid("Nhập lý do từ chối.");
        s.jdbc()
                .update(
                        "UPDATE location_move_request SET status=?,decided_by=?,decided_at=CURRENT_TIMESTAMP,"
                                + "rejection_reason=? WHERE request_id=?",
                        reject ? "REJECTED" : "CANCELLED",
                        a.id(),
                        reason == null || reason.isBlank() ? null : reason.trim(),
                        id);
        var row = view(id);
        if (reject)
            notify(num(m, "requested_by"), "Yêu cầu xếp kệ bị từ chối",
                    describe(row) + " — lý do: " + reason.trim() + ". Hãy đưa hàng về chỗ cũ.", "WAREHOUSE_MOVE_REJECTED", id);
        s.audit(a.id(), reject ? "LOCATION_MOVE_REJECT" : "LOCATION_MOVE_CANCEL", id, reason == null ? "" : reason.trim());
        return row;
    }

    /** Same rules as the owner's move, checked now so a family member learns of a mistake at once. */
    private void check(Move r) {
        var variant = s.one("SELECT * FROM product_detail WHERE detail_id=?", r.detailId());
        long assigned = s.count("SELECT COALESCE(SUM(quantity),0) FROM product_location WHERE detail_id=?", r.detailId());
        if (r.fromLocationId() == null) {
            if (r.toShelfId() == null) throw invalid("Phải chọn vị trí đích.");
            long waiting =
                    s.count(
                            "SELECT COALESCE(SUM(quantity),0) FROM location_move_request WHERE detail_id=? AND"
                                    + " from_location_id IS NULL AND status='PENDING'",
                            r.detailId());
            if (r.quantity() > num(variant, "stock_quantity") - assigned - waiting)
                throw invalid(
                        "Không đủ hàng chưa xếp vị trí"
                                + (waiting > 0 ? " (đã có " + waiting + " sản phẩm trong yêu cầu đang chờ duyệt)." : "."));
        } else {
            var from = s.one("SELECT * FROM product_location WHERE product_location_id=?", r.fromLocationId());
            long waiting =
                    s.count(
                            "SELECT COALESCE(SUM(quantity),0) FROM location_move_request WHERE from_location_id=? AND"
                                    + " status='PENDING'",
                            r.fromLocationId());
            if (num(from, "detail_id") != r.detailId() || num(from, "quantity") - waiting < r.quantity())
                throw invalid(
                        "Vị trí nguồn không đủ đúng màu/size đã chọn"
                                + (waiting > 0 ? " (đã có " + waiting + " sản phẩm trong yêu cầu đang chờ duyệt)." : "."));
            if (Objects.equals(from.get("shelf_level_id"), r.toShelfId())) throw invalid("Vị trí nguồn và đích phải khác nhau.");
        }
        if (r.toShelfId() == null) return;
        var tier =
                s.one(
                        "SELECT l.*,r.is_active AS rack_active FROM shelf_level l JOIN rack r ON r.rack_id=l.rack_id"
                                + " WHERE l.shelf_level_id=?",
                        r.toShelfId());
        if (num(tier, "is_active") != 1 || num(tier, "rack_active") != 1 || !is(tier, "status", "AVAILABLE"))
            throw invalid("Chỉ được đưa hàng vào tầng đang hoạt động và còn chỗ.");
        boolean newPlace =
                s.count(
                                "SELECT COUNT(*) FROM product_location WHERE detail_id=? AND shelf_level_id=?",
                                r.detailId(),
                                r.toShelfId())
                        == 0;
        if (newPlace
                && (r.description() == null
                        || r.description().isBlank()
                        || r.photoKeys() == null
                        || r.photoKeys().isEmpty()))
            throw invalid("Lần đầu gán vị trí phải có mô tả và ảnh thực tế.");
        if (r.photoKeys() != null) r.photoKeys().forEach(photos::existing);
    }

    private static final String SELECT =
            """
            SELECT m.*,d.color,d.size,p.product_name,u.full_name AS requester_name,v.full_name AS decider_name,
              CONCAT(fr.rack_code,ft.level_number) AS from_label,CONCAT(tr.rack_code,tt.level_number) AS to_label
            FROM location_move_request m
            JOIN product_detail d ON d.detail_id=m.detail_id JOIN product p ON p.product_id=d.product_id
            JOIN `user` u ON u.user_id=m.requested_by LEFT JOIN `user` v ON v.user_id=m.decided_by
            LEFT JOIN product_location fl ON fl.product_location_id=m.from_location_id
            LEFT JOIN shelf_level ft ON ft.shelf_level_id=fl.shelf_level_id LEFT JOIN rack fr ON fr.rack_id=ft.rack_id
            LEFT JOIN shelf_level tt ON tt.shelf_level_id=m.to_shelf_id LEFT JOIN rack tr ON tr.rack_id=tt.rack_id
            """;

    private Map<String, Object> view(int id) {
        return s.one(SELECT + " WHERE m.request_id=?", id);
    }

    private static String describe(Map<String, Object> m) {
        String what = m.get("quantity") + " " + m.get("product_name") + " · " + m.get("color") + " · " + m.get("size");
        String from = m.get("from_label") == null ? "hàng chưa xếp" : "kệ " + m.get("from_label");
        String to = m.get("to_label") == null ? "phần chưa xếp" : "kệ " + m.get("to_label");
        return (m.get("from_label") == null ? "xếp " : "chuyển ") + what + " từ " + from + " vào " + to;
    }

    /** user = null → every active owner; otherwise that one user (the requester). */
    private void notify(Integer user, String title, String message, String type, int id) {
        int n =
                s.insert(
                        "INSERT INTO notification(title,message,type,related_entity_type,related_entity_id)"
                                + " VALUES(?,?,?,'location_move_request',?)",
                        title,
                        message.length() > 500 ? message.substring(0, 500) : message,
                        type,
                        id);
        if (user != null)
            s.jdbc().update("INSERT INTO user_notification(user_id,notification_id) VALUES(?,?)", user, n);
        else
            s.jdbc()
                    .update(
                            "INSERT INTO user_notification(user_id,notification_id) SELECT u.user_id,? FROM `user` u"
                                    + " JOIN `role` r ON r.role_id=u.role_id WHERE r.role_name='OWNER' AND"
                                    + " u.account_status='ACTIVE'",
                            n);
    }

    private static String blank(String v) {
        return v == null || v.isBlank() ? null : v;
    }

    private static Object intOrNull(Object v) {
        return v == null ? null : ((Number) v).intValue();
    }
}
