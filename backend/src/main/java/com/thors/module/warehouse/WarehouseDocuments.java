package com.thors.module.warehouse;

import static com.thors.module.warehouse.WarehouseStore.*;

import com.thors.module.account.entity.Account;
import com.thors.module.warehouse.WarehouseRequests.*;
import java.math.BigDecimal;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(isolation = Isolation.READ_COMMITTED)
public class WarehouseDocuments {
    private final WarehouseStore s;
    private final WarehousePolicy policy;

    public WarehouseDocuments(WarehouseStore s, WarehousePolicy policy) {
        this.s = s;
        this.policy = policy;
    }

    private Map<String, Object> header(int id) {
        return s.one("SELECT * FROM stock_receipt WHERE receipt_id=?", id);
    }

    private List<Map<String, Object>> lines(int id) {
        return s.jdbc()
                .queryForList(
                        """
            SELECT i.*,p.product_name,d.color,d.size FROM stock_receipt_item i
            JOIN product_detail d ON d.detail_id=i.detail_id JOIN product p ON p.product_id=d.product_id
            WHERE i.receipt_id=? ORDER BY i.receipt_item_id
            """,
                        id);
    }

    private long handled(int sourceItem, String type) {
        return s.count(
                """
                SELECT COALESCE(SUM(i.quantity),0) FROM stock_receipt_item i
                JOIN stock_receipt r ON r.receipt_id=i.receipt_id
                WHERE i.source_receipt_item_id=? AND r.receipt_type=? AND r.status='CONFIRMED'
                """,
                sourceItem,
                type);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<Map<String, Object>> list(Account a) {
        policy.view(a);
        var docs =
                s.jdbc()
                        .queryForList(
                                """
                SELECT r.*,COALESCE(r.manufacturer_name,parent.manufacturer_name,root.manufacturer_name) AS manufacturer_name,u.full_name AS creator_name,c.full_name AS confirmer_name
                FROM stock_receipt r JOIN `user` u ON u.user_id=r.created_by
                LEFT JOIN `user` c ON c.user_id=r.confirmed_by
                LEFT JOIN stock_receipt parent ON parent.receipt_id=r.source_receipt_id
                LEFT JOIN stock_receipt root ON root.receipt_id=parent.source_receipt_id ORDER BY r.receipt_id DESC
                """);
        // Two bulk queries keep list rendering independent of document count.
        var byDoc = new HashMap<Integer, List<Map<String, Object>>>();
        for (var line :
                s.jdbc()
                        .queryForList(
                                """
                SELECT i.*,p.product_name,d.color,d.size,COALESCE(h.done,0) AS handled_quantity
                FROM stock_receipt_item i JOIN product_detail d ON d.detail_id=i.detail_id
                JOIN product p ON p.product_id=d.product_id JOIN stock_receipt parent ON parent.receipt_id=i.receipt_id
                LEFT JOIN (SELECT x.source_receipt_item_id,SUM(x.quantity) AS done
                  FROM stock_receipt_item x JOIN stock_receipt r ON r.receipt_id=x.receipt_id
                  WHERE r.status='CONFIRMED' AND r.receipt_type IN ('RECEIPT','SUPPLIER_RETURN')
                  GROUP BY x.source_receipt_item_id) h ON h.source_receipt_item_id=i.receipt_item_id
                ORDER BY i.receipt_item_id
                """))
            byDoc.computeIfAbsent(num(line, "receipt_id"), k -> new ArrayList<>()).add(line);
        for (var doc : docs) {
            var items = byDoc.getOrDefault(num(doc, "receipt_id"), List.of());
            doc.put("items", items);
            doc.put(
                    "total_amount",
                    items.stream()
                            .map(
                                    i ->
                                            ((BigDecimal) i.get("unit_price"))
                                                    .multiply(BigDecimal.valueOf(num(i, "quantity"))))
                            .reduce(BigDecimal.ZERO, BigDecimal::add));
        }
        return docs;
    }

    private void validate(Document r) {
        if ("PURCHASE_ORDER".equals(r.type())) {
            if (r.sourceId() != null || r.manufacturer() == null || r.manufacturer().isBlank())
                throw invalid("Phiếu đặt phải có nhà sản xuất/nhà cung cấp và không có phiếu nguồn.");
        } else {
            if (r.sourceId() == null) throw invalid("Phải chọn phiếu nguồn trước.");
            var source = header(r.sourceId());
            String expected = "RECEIPT".equals(r.type()) ? "PURCHASE_ORDER" : "RECEIPT";
            if (!is(source, "receipt_type", expected) || !is(source, "status", "CONFIRMED"))
                throw invalid("Phiếu nguồn phải được xác nhận và chưa đóng.");
        }
        var seen = new HashSet<Integer>();
        for (var line : r.items()) {
            s.one("SELECT detail_id FROM product_detail WHERE detail_id=?", line.detailId());
            if (!seen.add(line.detailId()))
                throw invalid("Mỗi màu/size chỉ được có một dòng trong phiếu.");
            if ("PURCHASE_ORDER".equals(r.type())) {
                if (line.sourceItemId() != null) throw invalid("Dòng đặt hàng không có dòng nguồn.");
            } else {
                if (line.sourceItemId() == null) throw invalid("Dòng nhập/trả phải liên kết dòng nguồn.");
                var original =
                        s.one("SELECT * FROM stock_receipt_item WHERE receipt_item_id=?", line.sourceItemId());
                if (num(original, "receipt_id") != r.sourceId()
                        || num(original, "detail_id") != line.detailId())
                    throw invalid("Màu/size không khớp dòng phiếu nguồn.");
                if (line.unitPrice().compareTo((BigDecimal) original.get("unit_price")) != 0)
                    throw invalid("Đơn giá nhập/trả phải lấy từ phiếu nguồn.");
                if (line.quantity() > num(original, "quantity") - handled(line.sourceItemId(), r.type()))
                    throw invalid("Số lượng vượt phần còn được nhập/trả của phiếu nguồn.");
            }
        }
    }

    public Map<String, Object> create(Account a, Document r) {
        policy.create(a, r.type());
        s.lock();
        validate(r);
        String manufacturer = "PURCHASE_ORDER".equals(r.type()) ? r.manufacturer().trim() : null;
        int id =
                s.insert(
                        "INSERT INTO"
                                + " stock_receipt(receipt_type,source_receipt_id,manufacturer_name,created_by,note,status)"
                                + " VALUES(?,?,?,?,?,'DRAFT')",
                        r.type(),
                        r.sourceId(),
                        manufacturer,
                        a.id(),
                        r.note());
        writeLines(id, r);
        s.audit(a.id(), "DOCUMENT_CREATE", id, r.type());
        return header(id);
    }

    private void writeLines(int id, Document r) {
        for (var l : r.items())
            s.insert(
                    "INSERT INTO"
                            + " stock_receipt_item(receipt_id,detail_id,quantity,unit_price,source_receipt_item_id)"
                            + " VALUES(?,?,?,?,?)",
                    id,
                    l.detailId(),
                    l.quantity(),
                    l.unitPrice(),
                    l.sourceItemId());
    }

    public Map<String, Object> edit(Account a, int id, Document r) {
        policy.view(a);
        s.lock();
        var old = header(id);
        policy.edit(a, old);
        if (!is(old, "status", "DRAFT")) throw invalid("Chỉ được sửa phiếu nháp.");
        if (!is(old, "receipt_type", r.type())
                || !Objects.equals(old.get("source_receipt_id"), r.sourceId()))
            throw invalid("Không được đổi loại hoặc phiếu nguồn khi sửa.");
        validate(r);
        s.jdbc().update("DELETE FROM stock_receipt_item WHERE receipt_id=?", id);
        s.jdbc()
                .update(
                        "UPDATE stock_receipt SET manufacturer_name=?,note=? WHERE receipt_id=?",
                        "PURCHASE_ORDER".equals(r.type())
                                ? r.manufacturer().trim()
                                : old.get("manufacturer_name"),
                        r.note(),
                        id);
        writeLines(id, r);
        s.audit(a.id(), "DOCUMENT_EDIT", id, r.type());
        return header(id);
    }

    public Map<String, Object> submit(Account a, int id) {
        policy.view(a);
        s.lock();
        var doc = header(id);
        policy.edit(a, doc);
        if (is(doc, "status", "PENDING_CONFIRMATION")) return doc;
        if (!is(doc, "status", "DRAFT")) throw invalid("Chỉ gửi xác nhận phiếu nháp.");
        validateExisting(doc);
        s.jdbc()
                .update("UPDATE stock_receipt SET status='PENDING_CONFIRMATION' WHERE receipt_id=?", id);
        notifyOwners(
                id,
                "Phiếu kho chờ xác nhận",
                "Phiếu #" + id + " đang chờ chủ cửa hàng xác nhận.",
                "WAREHOUSE_PENDING");
        s.audit(a.id(), "DOCUMENT_SUBMIT", id, "");
        return header(id);
    }

    private void validateExisting(Map<String, Object> doc) {
        var items =
                lines(num(doc, "receipt_id")).stream()
                        .map(
                                l ->
                                        new Line(
                                                num(l, "detail_id"),
                                                num(l, "quantity"),
                                                (BigDecimal) l.get("unit_price"),
                                                (Integer) l.get("source_receipt_item_id")))
                        .toList();
        if (items.isEmpty()) throw invalid("Phiếu chưa có sản phẩm.");
        validate(
                new Document(
                        (String) doc.get("receipt_type"),
                        (Integer) doc.get("source_receipt_id"),
                        (String) doc.get("manufacturer_name"),
                        (String) doc.get("note"),
                        items));
    }

    public Map<String, Object> confirm(Account a, int id) {
        policy.owner(a);
        s.lock();
        var doc = header(id);
        if (is(doc, "status", "CONFIRMED")) return doc;
        if (!is(doc, "status", "PENDING_CONFIRMATION") && !is(doc, "status", "DRAFT"))
            throw invalid("Phiếu không ở trạng thái có thể xác nhận.");
        validateExisting(doc);
        if (is(doc, "receipt_type", "RECEIPT")) {
            for (var line : lines(id)) {
                int detail = num(line, "detail_id"), qty = num(line, "quantity");
                int changed =
                        s.jdbc()
                                .update(
                                        "UPDATE product_detail SET stock_quantity=stock_quantity+? WHERE detail_id=?"
                                                + " AND stock_quantity<=2147483647-?",
                                        qty,
                                        detail,
                                        qty);
                if (changed != 1) throw invalid("Tổng tồn vượt giới hạn cho phép.");
                movement(
                        a,
                        detail,
                        qty,
                        "RECEIPT",
                        num(line, "receipt_item_id"),
                        null,
                        "receipt:" + id + ":" + num(line, "receipt_item_id"),
                        "Nhập theo phiếu #" + id);
            }
        } else if (is(doc, "receipt_type", "SUPPLIER_RETURN")) {
            for (var line : lines(id)) returnStock(a, id, line, (String) doc.get("note"));
        }
        s.jdbc()
                .update(
                        "UPDATE stock_receipt SET"
                                + " status='CONFIRMED',confirmed_by=?,confirmed_at=CURRENT_TIMESTAMP WHERE"
                                + " receipt_id=?",
                        a.id(),
                        id);
        s.audit(a.id(), "DOCUMENT_CONFIRM", id, (String) doc.get("receipt_type"));
        if (is(doc, "receipt_type", "RECEIPT")) {
            int po = num(doc, "source_receipt_id");
            long missing = remaining(po);
            if (missing > 0)
                notifyOwners(
                        po,
                        "Đơn đặt còn thiếu hàng",
                        "Phiếu đặt #" + po + " còn thiếu " + missing + " sản phẩm sau đợt nhập #" + id + ".",
                        "WAREHOUSE_SHORTAGE");
        }
        return header(id);
    }

    private void returnStock(Account a, int docId, Map<String, Object> line, String reason) {
        if (reason == null || reason.isBlank()) throw invalid("Phiếu trả phải có lý do trong ghi chú.");
        int detail = num(line, "detail_id"),
                qty = num(line, "quantity"),
                item = num(line, "receipt_item_id");
        var variant =
                s.one("SELECT stock_quantity FROM product_detail WHERE detail_id=? FOR UPDATE", detail);
        long stock = num(variant, "stock_quantity");
        if (stock < qty) throw invalid("Tồn hiện tại không đủ để trả nhà cung cấp.");
        long assigned =
                s.count("SELECT COALESCE(SUM(quantity),0) FROM product_location WHERE detail_id=?", detail);
        if (assigned > stock) throw invalid("Dữ liệu tồn vị trí lớn hơn tổng tồn; cần đối soát trước.");
        int unassigned = (int) Math.min(qty, stock - assigned), left = qty - unassigned;
        if (unassigned > 0)
            movement(
                    a,
                    detail,
                    -unassigned,
                    "SUPPLIER_RETURN",
                    item,
                    null,
                    "return:" + item + ":unassigned",
                    reason);
        for (var loc :
                s.jdbc()
                        .queryForList(
                                "SELECT * FROM product_location WHERE detail_id=? AND quantity>0 ORDER BY"
                                        + " product_location_id FOR UPDATE",
                                detail)) {
            if (left == 0) break;
            int take = Math.min(left, num(loc, "quantity")), location = num(loc, "product_location_id");
            s.jdbc()
                    .update(
                            "UPDATE product_location SET quantity=quantity-?,updated_at=CURRENT_TIMESTAMP WHERE"
                                    + " product_location_id=?",
                            take,
                            location);
            movement(
                    a,
                    detail,
                    -take,
                    "SUPPLIER_RETURN",
                    item,
                    location,
                    "return:" + item + ":" + location,
                    reason);
            left -= take;
        }
        if (left != 0) throw invalid("Không đủ hàng để trả.");
        s.jdbc()
                .update(
                        "UPDATE product_detail SET stock_quantity=stock_quantity-? WHERE detail_id=?",
                        qty,
                        detail);
    }

    private void movement(
            Account a,
            int detail,
            int change,
            String type,
            int item,
            Integer source,
            String key,
            String reason) {
        s.jdbc()
                .update(
                        """
            INSERT INTO stock_adjustment(detail_id,quantity_change,reason,adjusted_by,movement_type,movement_quantity,receipt_item_id,source_location_id,idempotency_key)
            VALUES(?,?,?,?,?,?,?,?,?)
            """,
                        detail,
                        change,
                        reason,
                        a.id(),
                        type,
                        Math.abs(change),
                        item,
                        source,
                        key);
    }

    public Map<String, Object> end(Account a, int id, String action, String reason) {
        policy.owner(a);
        s.lock();
        var doc = header(id);
        if (reason == null || reason.isBlank()) throw invalid("Cần nhập lý do.");
        String target =
                switch (action) {
                    case "reject" -> "REJECTED";
                    case "cancel" -> "CANCELLED";
                    case "close" -> "CLOSED";
                    default -> throw invalid("Thao tác không hợp lệ.");
                };
        if (is(doc, "status", target)) return doc;
        if ("close".equals(action)) {
            if (!is(doc, "receipt_type", "PURCHASE_ORDER") || !is(doc, "status", "CONFIRMED"))
                throw invalid("Chỉ đóng đơn đặt đã xác nhận.");
            if (s.count(
                    "SELECT COUNT(*) FROM stock_receipt WHERE source_receipt_id=? AND"
                            + " receipt_type='RECEIPT' AND status IN ('DRAFT','PENDING_CONFIRMATION')",
                    id)
                    > 0) throw invalid("Cần xử lý các phiếu nhập nháp/chờ xác nhận trước khi đóng đơn đặt.");
            s.jdbc()
                    .update(
                            "UPDATE stock_receipt SET status='CLOSED',closed_at=CURRENT_TIMESTAMP,close_reason=?"
                                    + " WHERE receipt_id=?",
                            reason,
                            id);
        } else {
            if (("reject".equals(action) && !is(doc, "status", "PENDING_CONFIRMATION"))
                    || (!"reject".equals(action)
                    && !Set.of("DRAFT", "PENDING_CONFIRMATION").contains(doc.get("status"))))
                throw invalid(
                        "Không thể hủy/từ chối phiếu đã xử lý. Phiếu nhập đã xác nhận phải dùng phiếu trả.");
            s.jdbc()
                    .update(
                            "UPDATE stock_receipt SET status=?,rejection_reason=? WHERE receipt_id=?",
                            target,
                            reason,
                            id);
        }
        s.audit(a.id(), "DOCUMENT_" + action.toUpperCase(Locale.ROOT), id, reason);
        return header(id);
    }

    private long remaining(int po) {
        return lines(po).stream()
                .mapToLong(l -> num(l, "quantity") - handled(num(l, "receipt_item_id"), "RECEIPT"))
                .sum();
    }

    private void notifyOwners(int entity, String title, String message, String type) {
        int id =
                s.insert(
                        "INSERT INTO notification(title,message,type,related_entity_type,related_entity_id)"
                                + " VALUES(?,?,?,'stock_receipt',?)",
                        title,
                        message,
                        type,
                        entity);
        s.jdbc()
                .update(
                        "INSERT INTO user_notification(user_id,notification_id) SELECT u.user_id,? FROM `user`"
                                + " u JOIN `role` r ON r.role_id=u.role_id WHERE r.role_name='OWNER' AND"
                                + " u.account_status='ACTIVE'",
                        id);
    }
}
