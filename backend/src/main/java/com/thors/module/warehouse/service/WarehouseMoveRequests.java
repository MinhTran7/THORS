package com.thors.module.warehouse.service;

import com.thors.module.warehouse.repository.WarehouseStore;
import static com.thors.module.warehouse.repository.WarehouseStore.*;

import com.thors.module.account.entity.Account;
import com.thors.module.warehouse.dto.WarehouseRequests.Move;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Shelving / moving between shelves by a family member: "Lưu" only records a PENDING request;
 * product_location and stock_adjustment change when the owner confirms (the exact same move the
 * owner would do himself, keyed by the request key so a retried approval moves goods once).
 * The owner's own moves keep going straight through {@link WarehouseLayout#move}.
 * No table of its own: a request is a stock_adjustment row of type MOVE (quantity_change 0) with
 * request_status set — see database/migrations/2026-11-18_move_request_columns.sql. Stock card and
 * reports skip rows whose request_status is not NULL; the real move gets its own row on approval.
 */
@Service
@Transactional(isolation = Isolation.READ_COMMITTED)
public class WarehouseMoveRequests {
    private static final String PENDING = "PENDING";
    /** idempotency_key of a request row; the approved move itself keeps 'move:' + request key. */
    private static final String KEY = "movereq:";

    private final WarehouseStore s;
    private final WarehousePolicy policy;
    private final WarehouseLayout layout;
    private final WarehousePhotos photos;

    public WarehouseMoveRequests(
            WarehouseStore s, WarehousePolicy policy, WarehouseLayout layout, WarehousePhotos photos) {
        this.s = s;
        this.policy = policy;
        this.layout = layout;
        this.photos = photos;
    }

    /** Family: record the move for the owner. Owner: apply it at once, as before. */
    public Map<String, Object> submit(Account a, Move r) {
        policy.view(a);
        if ("OWNER".equals(a.role())) return layout.move(a, r);
        return s.migrated(() -> record(a, r));
    }

    private Map<String, Object> record(Account a, Move r) {
        s.lock();
        var old = s.jdbc().queryForList(select() + " WHERE m.idempotency_key=?", KEY + r.requestKey());
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
                        "INSERT INTO stock_adjustment(detail_id,quantity_change,reason,adjusted_by,movement_type,movement_quantity,"
                                + "source_location_id,idempotency_key,request_status,request_shelf_id,request_note,request_photo_keys)"
                                + " VALUES(?,0,'Yêu cầu xếp/chuyển kệ',?,'MOVE',?,?,?,'PENDING',?,?,?)",
                        r.detailId(),
                        a.id(),
                        r.quantity(),
                        r.fromLocationId(),
                        KEY + r.requestKey(),
                        r.toShelfId(),
                        r.description() == null || r.description().isBlank() ? null : r.description().trim(),
                        r.photoKeys() == null || r.photoKeys().isEmpty() ? null : String.join(",", r.photoKeys()));
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

    // Chỉ đọc: chạy chung transaction nếu đã có, không tự mở transaction mới (mỗi transaction tốn thêm lượt gửi lệnh tới DB cloud)
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.SUPPORTS)
    public List<Map<String, Object>> list(Account a, String status) {
        policy.view(a);
        return s.migrated(() -> s.jdbc().queryForList(select() + " WHERE m.request_status IS NOT NULL AND (? IS NULL OR m.request_status=?)"
                + " ORDER BY m.adjustment_id DESC LIMIT 200",
                blank(status), blank(status)));
    }

    /** Owner confirms: the move is carried out now; fails (nothing saved) if the shelves changed meanwhile. */
    public Map<String, Object> approve(Account a, int id) {
        policy.owner(a);
        s.lock();
        var m = s.one(select() + " WHERE m.adjustment_id=? AND m.request_status IS NOT NULL", id);
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
                        "UPDATE stock_adjustment SET request_status='APPROVED',decided_by=?,decided_at=CURRENT_TIMESTAMP"
                                + " WHERE adjustment_id=?",
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
        var m = s.one(select() + " WHERE m.adjustment_id=? AND m.request_status IS NOT NULL", id);
        boolean reject = "reject".equals(action);
        if (reject) policy.owner(a);
        else if (num(m, "requested_by") != a.id()) policy.owner(a);
        if (!is(m, "status", PENDING)) throw invalid("Yêu cầu này đã được xử lý.");
        if (reject && (reason == null || reason.isBlank())) throw invalid("Nhập lý do từ chối.");
        s.jdbc()
                .update(
                        // Lý do từ chối ghi vào cột reason có sẵn.
                        "UPDATE stock_adjustment SET request_status=?,decided_by=?,decided_at=CURRENT_TIMESTAMP,"
                                + "reason=COALESCE(?,reason) WHERE adjustment_id=?",
                        reject ? "REJECTED" : "CANCELLED",
                        a.id(),
                        reject ? truncate(reason.trim()) : null,
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
                            "SELECT COALESCE(SUM(movement_quantity),0) FROM stock_adjustment WHERE detail_id=? AND"
                                    + " source_location_id IS NULL AND request_status='PENDING'",
                            r.detailId());
            if (r.quantity() > num(variant, "stock_quantity") - assigned - waiting)
                throw invalid(
                        "Không đủ hàng chưa xếp vị trí"
                                + (waiting > 0 ? " (đã có " + waiting + " sản phẩm trong yêu cầu đang chờ duyệt)." : "."));
        } else {
            var from = s.one("SELECT * FROM product_location WHERE product_location_id=?", r.fromLocationId());
            long waiting =
                    s.count(
                            "SELECT COALESCE(SUM(movement_quantity),0) FROM stock_adjustment WHERE source_location_id=? AND"
                                    + " request_status='PENDING'",
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
        // Mô tả và ảnh thực tế tại vị trí: không bắt buộc.
        if (r.photoKeys() != null) r.photoKeys().forEach(photos::existing);
    }

    private static final String SELECT =
            """
            SELECT m.adjustment_id AS request_id,m.detail_id,m.source_location_id AS from_location_id,
              m.request_shelf_id AS to_shelf_id,m.movement_quantity AS quantity,
              m.request_note AS description,m.request_photo_keys AS photo_keys,
              CASE WHEN m.request_status='REJECTED' THEN m.reason END AS rejection_reason,
              SUBSTRING(m.idempotency_key,9) AS request_key,m.request_status AS status,
              m.adjusted_by AS requested_by,m.adjusted_at AS requested_at,m.decided_by,m.decided_at,
              d.color,d.size,p.product_name,u.full_name AS requester_name,v.full_name AS decider_name,
              FROM_LABEL AS from_label,TO_LABEL AS to_label
            FROM stock_adjustment m
            JOIN product_detail d ON d.detail_id=m.detail_id JOIN product p ON p.product_id=d.product_id
            JOIN `user` u ON u.user_id=m.adjusted_by LEFT JOIN `user` v ON v.user_id=m.decided_by
            LEFT JOIN product_location fl ON fl.product_location_id=m.source_location_id
            LEFT JOIN shelf_level ft ON ft.shelf_level_id=fl.shelf_level_id LEFT JOIN rack fr ON fr.rack_id=ft.rack_id
            LEFT JOIN shelf_level tt ON tt.shelf_level_id=m.request_shelf_id LEFT JOIN rack tr ON tr.rack_id=tt.rack_id
            """;

    /** SELECT with the source / destination tier labels (tier names when set). */
    private String select() {
        return SELECT.replace("FROM_LABEL", s.tierLabel("fr", "ft")).replace("TO_LABEL", s.tierLabel("tr", "tt"));
    }

    private Map<String, Object> view(int id) {
        return s.one(select() + " WHERE m.adjustment_id=?", id);
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

    private static String truncate(String v) {
        return v.length() > 255 ? v.substring(0, 255) : v;
    }

    private static String blank(String v) {
        return v == null || v.isBlank() ? null : v;
    }

    private static Object intOrNull(Object v) {
        return v == null ? null : ((Number) v).intValue();
    }
}
