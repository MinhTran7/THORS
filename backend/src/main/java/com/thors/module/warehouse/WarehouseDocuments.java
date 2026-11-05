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

    /**
     * Quantity of a receipt line already returned to the supplier: only dispatched returns (CONFIRMED),
     * excluding the return being checked. Draft/pending/approved returns do not reduce what is still
     * returnable; over-return is stopped when a return is dispatched (checked again inside the lock).
     */
    private long returned(int sourceItem, Integer self) {
        return s.count(
                """
                SELECT COALESCE(SUM(i.quantity),0) FROM stock_receipt_item i
                JOIN stock_receipt r ON r.receipt_id=i.receipt_id
                WHERE i.source_receipt_item_id=? AND r.receipt_type='SUPPLIER_RETURN'
                  AND r.status='CONFIRMED' AND r.receipt_id<>?
                """,
                sourceItem,
                self == null ? 0 : self);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<Map<String, Object>> list(Account a) {
        policy.view(a);
        var docs =
                s.jdbc()
                        .queryForList(
                                """
                SELECT r.*,COALESCE(r.manufacturer_name,parent.manufacturer_name,root.manufacturer_name) AS manufacturer_name,u.full_name AS creator_name,c.full_name AS confirmer_name,
                  mv.moved_at AS dispatched_at,parent.receipt_type AS source_type
                FROM stock_receipt r JOIN `user` u ON u.user_id=r.created_by
                LEFT JOIN `user` c ON c.user_id=r.confirmed_by
                LEFT JOIN stock_receipt parent ON parent.receipt_id=r.source_receipt_id
                LEFT JOIN stock_receipt root ON root.receipt_id=parent.source_receipt_id
                LEFT JOIN (SELECT i.receipt_id,MAX(m.adjusted_at) AS moved_at FROM stock_adjustment m
                  JOIN stock_receipt_item i ON i.receipt_item_id=m.receipt_item_id
                  WHERE m.movement_type='SUPPLIER_RETURN' GROUP BY i.receipt_id) mv ON mv.receipt_id=r.receipt_id
                ORDER BY r.receipt_id DESC
                """);
        // Two bulk queries keep list rendering independent of document count.
        var byDoc = new HashMap<Integer, List<Map<String, Object>>>();
        for (var line :
                s.jdbc()
                        .queryForList(
                                """
                SELECT i.*,p.product_name,d.color,d.size,COALESCE(h.done,0) AS handled_quantity,
                  COALESCE(a.held,0) AS reserved_quantity,COALESCE(ex.qty,0) AS exchanged_quantity
                FROM stock_receipt_item i JOIN product_detail d ON d.detail_id=i.detail_id
                LEFT JOIN (SELECT return_item_id,SUM(quantity) AS qty FROM supplier_settlement
                  WHERE settlement_type='EXCHANGE' AND voided_at IS NULL GROUP BY return_item_id) ex
                  ON ex.return_item_id=i.receipt_item_id
                JOIN product p ON p.product_id=d.product_id JOIN stock_receipt parent ON parent.receipt_id=i.receipt_id
                LEFT JOIN (SELECT x.source_receipt_item_id,SUM(x.quantity) AS done
                  FROM stock_receipt_item x JOIN stock_receipt r ON r.receipt_id=x.receipt_id
                  WHERE r.status='CONFIRMED' AND r.receipt_type IN ('RECEIPT','SUPPLIER_RETURN')
                  GROUP BY x.source_receipt_item_id) h ON h.source_receipt_item_id=i.receipt_item_id
                LEFT JOIN (SELECT x.source_receipt_item_id,SUM(x.quantity) AS held
                  FROM stock_receipt_item x JOIN stock_receipt r ON r.receipt_id=x.receipt_id
                  WHERE r.status='APPROVED' AND r.receipt_type='SUPPLIER_RETURN'
                  GROUP BY x.source_receipt_item_id) a ON a.source_receipt_item_id=i.receipt_item_id
                ORDER BY i.receipt_item_id
                """))
            byDoc.computeIfAbsent(num(line, "receipt_id"), k -> new ArrayList<>()).add(line);
        // Active (not voided) supplier settlements: per return by type, per receipt as offset target.
        var settled = new HashMap<Integer, Map<String, BigDecimal>>();
        var payments = new HashMap<Integer, BigDecimal>();
        var offsets = new HashMap<Integer, BigDecimal>();
        for (var row :
                s.jdbc()
                        .queryForList(
                                """
                SELECT return_id,target_receipt_id,settlement_type,SUM(amount) AS amount FROM supplier_settlement
                WHERE voided_at IS NULL GROUP BY return_id,target_receipt_id,settlement_type
                """)) {
            var amount = (BigDecimal) row.get("amount");
            if (row.get("return_id") != null)
                settled.computeIfAbsent(num(row, "return_id"), k -> new HashMap<>())
                        .merge((String) row.get("settlement_type"), amount, BigDecimal::add);
            if (row.get("target_receipt_id") != null)
                ("PAYMENT".equals(row.get("settlement_type")) ? payments : offsets)
                        .merge(num(row, "target_receipt_id"), amount, BigDecimal::add);
        }
        for (var doc : docs) {
            int id = num(doc, "receipt_id");
            var items = byDoc.getOrDefault(id, List.of());
            doc.put("items", items);
            var total =
                    items.stream()
                            .map(
                                    i ->
                                            ((BigDecimal) i.get("unit_price"))
                                                    .multiply(BigDecimal.valueOf(num(i, "quantity"))))
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
            doc.put("total_amount", total);
            if (is(doc, "receipt_type", "RECEIPT")) {
                var paid = payments.getOrDefault(id, BigDecimal.ZERO);
                var offset = offsets.getOrDefault(id, BigDecimal.ZERO);
                doc.put("paid_amount", paid);
                doc.put("offset_amount", offset);
                // Exchange receipts and unconfirmed receipts create no debt; NULL basis = not declared.
                doc.put(
                        "debt_amount",
                        is(doc, "status", "CONFIRMED") && is(doc, "source_type", "PURCHASE_ORDER")
                                ? WarehouseSettlements.debt(total, doc.get("paid_before_tracking"), paid.add(offset))
                                : null);
            }
            if (is(doc, "receipt_type", "SUPPLIER_RETURN")) {
                var by = settled.getOrDefault(id, Map.of());
                BigDecimal done = BigDecimal.ZERO;
                for (var type : List.of("REFUND", "DEBT_OFFSET", "CREDIT_HOLD", "EXCHANGE")) {
                    var v = by.getOrDefault(type, BigDecimal.ZERO);
                    doc.put(type.toLowerCase(Locale.ROOT) + "_amount", v);
                    done = done.add(v);
                }
                doc.put("settled_amount", done);
                doc.put("unsettled_amount", total.subtract(done));
                // Separate from the document status: money/goods coming back from the supplier.
                doc.put(
                        "settlement_status",
                        !is(doc, "status", "CONFIRMED")
                                ? "NOT_APPLICABLE"
                                : done.signum() == 0
                                        ? "UNSETTLED"
                                        : done.compareTo(total) >= 0 ? "SETTLED" : "PARTIAL");
            }
        }
        return docs;
    }

    private void validate(Document r, Integer self) {
        if ("PURCHASE_ORDER".equals(r.type())) {
            if (r.sourceId() != null || r.manufacturer() == null || r.manufacturer().isBlank())
                throw invalid("Phiếu đặt phải có nhà sản xuất/nhà cung cấp và không có phiếu nguồn.");
        } else {
            if (r.sourceId() == null) throw invalid("Phải chọn phiếu nguồn trước.");
            var source = header(r.sourceId());
            // A receipt comes from a purchase order, or from a dispatched return whose lines wait for
            // replacement goods (exchange); a return always comes from a receipt.
            String expected =
                    "RECEIPT".equals(r.type())
                            ? (exchangeSource(source) ? "SUPPLIER_RETURN" : "PURCHASE_ORDER")
                            : "RECEIPT";
            if (!is(source, "receipt_type", expected) || !is(source, "status", "CONFIRMED"))
                throw invalid("Phiếu nguồn phải được xác nhận và chưa đóng/hủy.");
            if ("RECEIPT".equals(r.type()) && !exchangeSource(source) && remaining(r.sourceId()) <= 0)
                throw invalid(
                        "Đơn đặt đã nhận đủ nên không lập phiếu nhập thông thường. Nhận vượt cần luồng"
                                + " ngoại lệ do Owner duyệt, hiện chưa có chỗ lưu trong schema.");
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
                boolean receipt = "RECEIPT".equals(r.type());
                if (num(original, "receipt_id") != r.sourceId())
                    throw invalid("Dòng không thuộc phiếu nguồn đã chọn.");
                if (num(original, "detail_id") != line.detailId())
                    throw invalid(
                            receipt
                                    ? "Màu/size thực giao khác dòng đặt. Nhận thay thế cần Owner duyệt kèm lý"
                                            + " do; schema hiện tại chưa lưu được nên phải nhập đúng biến thể."
                                    : "Màu/size không khớp dòng phiếu nhập nguồn.");
                if (line.unitPrice().compareTo((BigDecimal) original.get("unit_price")) != 0)
                    throw invalid(
                            receipt
                                    ? "Đơn giá thực nhập khác giá đặt cần Owner duyệt kèm lý do; schema hiện"
                                            + " tại chưa lưu được nên phiếu nhập giữ giá đặt."
                                    : "Đơn giá trả lấy từ dòng phiếu nhập nguồn.");
                boolean exchange = receipt && exchangeSource(source(r));
                long base = exchange ? exchanged(line.sourceItemId()) : num(original, "quantity"),
                        done = receipt ? handled(line.sourceItemId(), r.type()) : returned(line.sourceItemId(), self);
                long left = Math.max(0, base - done);
                if (line.quantity() > left)
                    throw invalid(
                            exchange
                                    ? String.format(
                                            "Nhận hàng đổi vượt: nhà cung cấp đổi %d, đã nhận %d, còn chờ %d, lần"
                                                    + " này %d.",
                                            base, done, left, line.quantity())
                                    : receipt
                                    ? String.format(
                                            "Nhận vượt: đặt %d, đã nhập %d, còn thiếu %d, lần này %d, vượt %d."
                                                    + " Phần vượt cần Owner duyệt kèm giá và lý do; schema"
                                                    + " hiện tại chưa lưu được quyết định này.",
                                            base, done, left, line.quantity(), line.quantity() - left)
                                    : String.format(
                                            "Trả vượt: đã nhập %d, đã trả/đã duyệt trả %d, còn được trả %d,"
                                                    + " lần này %d.",
                                            base, done, left, line.quantity()));
            }
        }
    }

    private static boolean exchangeSource(Map<String, Object> source) {
        return is(source, "receipt_type", "SUPPLIER_RETURN");
    }

    private Map<String, Object> source(Document r) {
        return header(r.sourceId());
    }

    /** Replacement quantity the supplier agreed to deliver for one return line (active EXCHANGE). */
    private long exchanged(int returnItem) {
        return s.count(
                "SELECT COALESCE(SUM(quantity),0) FROM supplier_settlement WHERE return_item_id=? AND"
                        + " settlement_type='EXCHANGE' AND voided_at IS NULL",
                returnItem);
    }

    public Map<String, Object> create(Account a, Document r) {
        policy.create(a, r.type());
        s.lock();
        validate(r, null);
        // Exchange receipts keep the supplier name themselves: their chain (return → receipt → order)
        // is one level deeper than a normal receipt.
        String manufacturer =
                "PURCHASE_ORDER".equals(r.type())
                        ? r.manufacturer().trim()
                        : "RECEIPT".equals(r.type()) && exchangeSource(source(r))
                                ? s.supplierName(r.sourceId())
                                : null;
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
        validate(r, id);
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
        requireReturnReason(doc);
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
                        items),
                num(doc, "receipt_id"));
    }

    private void requireReturnReason(Map<String, Object> doc) {
        Object note = doc.get("note");
        if (is(doc, "receipt_type", "SUPPLIER_RETURN") && (note == null || note.toString().isBlank()))
            throw invalid("Nhập lý do trả hàng trước khi gửi duyệt hoặc xác nhận.");
    }

    public Map<String, Object> confirm(Account a, int id) {
        return confirm(a, id, null, null);
    }

    public Map<String, Object> confirm(Account a, int id, Map<Integer, Integer> expectedRemaining) {
        return confirm(a, id, expectedRemaining, null);
    }

    /**
     * Owner confirmation. PURCHASE_ORDER/RECEIPT: DRAFT|PENDING → CONFIRMED. SUPPLIER_RETURN: this is
     * "Xác nhận xuất trả" (the only place a return reduces stock); from DRAFT|PENDING it first runs the
     * same approval as {@link #approve} ("Xác nhận và xuất trả").
     */
    public Map<String, Object> confirm(
            Account a, int id, Map<Integer, Integer> expectedRemaining, List<Pick> picks) {
        policy.owner(a);
        s.lock();
        var doc = header(id);
        if (is(doc, "status", "CONFIRMED")) return doc;
        if (is(doc, "receipt_type", "SUPPLIER_RETURN")) return dispatch(a, doc, picks);
        if (!is(doc, "status", "PENDING_CONFIRMATION") && !is(doc, "status", "DRAFT"))
            throw invalid("Phiếu không ở trạng thái có thể xác nhận.");
        // Receipt of replacement goods for a supplier return (exchange) instead of a purchase order.
        boolean exchange =
                is(doc, "receipt_type", "RECEIPT") && exchangeSource(header(num(doc, "source_receipt_id")));
        if (is(doc, "receipt_type", "RECEIPT") && !exchange && expectedRemaining != null)
            checkStale(id, expectedRemaining);
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
        }
        s.jdbc()
                .update(
                        "UPDATE stock_receipt SET"
                                + " status='CONFIRMED',confirmed_by=?,confirmed_at=CURRENT_TIMESTAMP WHERE"
                                + " receipt_id=?",
                        a.id(),
                        id);
        s.audit(a.id(), "DOCUMENT_CONFIRM", id, (String) doc.get("receipt_type"));
        if (is(doc, "receipt_type", "RECEIPT") && !exchange) {
            // A purchase confirmed from now on starts with nothing paid; payments are recorded
            // separately. Receipts confirmed before payment tracking keep NULL (= not declared).
            s.jdbc()
                    .update(
                            "UPDATE stock_receipt SET paid_before_tracking=0 WHERE receipt_id=? AND"
                                    + " paid_before_tracking IS NULL",
                            id);
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

    /** Owner approves a supplier return: DRAFT|PENDING_CONFIRMATION → APPROVED. Stock is unchanged. */
    public Map<String, Object> approve(Account a, int id) {
        policy.owner(a);
        s.lock();
        var doc = header(id);
        if (!is(doc, "receipt_type", "SUPPLIER_RETURN"))
            throw invalid("Chỉ phiếu trả hàng nhà cung cấp có bước duyệt trước khi xuất trả.");
        if (is(doc, "status", "APPROVED") || is(doc, "status", "CONFIRMED")) return doc;
        approveReturn(a, doc);
        return header(id);
    }

    private void approveReturn(Account a, Map<String, Object> doc) {
        if (!is(doc, "status", "DRAFT") && !is(doc, "status", "PENDING_CONFIRMATION"))
            throw invalid("Phiếu trả không ở trạng thái có thể duyệt.");
        requireReturnReason(doc);
        // Checked against already dispatched returns; approval reserves nothing (checked again at dispatch).
        validateExisting(doc);
        int id = num(doc, "receipt_id");
        s.jdbc()
                .update(
                        "UPDATE stock_receipt SET status='APPROVED',confirmed_by=?,confirmed_at=CURRENT_TIMESTAMP"
                                + " WHERE receipt_id=?",
                        a.id(),
                        id);
        s.audit(a.id(), "DOCUMENT_APPROVE", id, "SUPPLIER_RETURN");
    }

    /**
     * The single stock path of a supplier return. Runs under the warehouse lock and in the caller's
     * transaction: any failure rolls back approval, location and stock changes together.
     */
    private Map<String, Object> dispatch(Account a, Map<String, Object> doc, List<Pick> picks) {
        int id = num(doc, "receipt_id");
        if (picks == null || picks.isEmpty())
            throw invalid("Chọn vị trí lấy hàng và số lượng lấy ở từng vị trí trước khi xuất trả.");
        if (is(doc, "status", "DRAFT") || is(doc, "status", "PENDING_CONFIRMATION")) approveReturn(a, doc);
        else if (!is(doc, "status", "APPROVED"))
            throw invalid("Chỉ xuất trả phiếu đã duyệt (chờ xuất trả).");
        doc = header(id);
        requireReturnReason(doc);
        // Recheck inside the lock against returns already dispatched: the first return dispatched wins,
        // a later one exceeding what is left fails here with "Trả vượt".
        validateExisting(doc);
        var lines = lines(id);
        var byItem = new HashMap<Integer, List<Pick>>();
        var seen = new HashSet<String>();
        for (var p : picks) {
            if (lines.stream().noneMatch(l -> num(l, "receipt_item_id") == p.itemId()))
                throw invalid("Dòng lấy hàng không thuộc phiếu trả này.");
            if (!seen.add(p.itemId() + ":" + p.locationId()))
                throw invalid("Mỗi vị trí chỉ khai báo một lần cho mỗi dòng hàng.");
            byItem.computeIfAbsent(p.itemId(), k -> new ArrayList<>()).add(p);
        }
        String reason = "Trả NCC phiếu #" + id + ": " + doc.get("note");
        if (reason.length() > 255) reason = reason.substring(0, 255);
        for (var line : lines)
            takeStock(a, line, byItem.getOrDefault(num(line, "receipt_item_id"), List.of()), reason);
        s.jdbc()
                .update(
                        "UPDATE stock_receipt SET status='CONFIRMED' WHERE receipt_id=? AND status='APPROVED'", id);
        s.audit(a.id(), "DOCUMENT_DISPATCH", id, "SUPPLIER_RETURN");
        return header(id);
    }

    private void takeStock(Account a, Map<String, Object> line, List<Pick> picks, String reason) {
        int detail = num(line, "detail_id"),
                qty = num(line, "quantity"),
                item = num(line, "receipt_item_id");
        String label = line.get("product_name") + " · " + line.get("color") + " · " + line.get("size");
        int picked = picks.stream().mapToInt(Pick::quantity).sum();
        if (picked != qty)
            throw invalid(String.format("%s: cần lấy %d nhưng phân bổ vị trí là %d.", label, qty, picked));
        var variant =
                s.one("SELECT stock_quantity FROM product_detail WHERE detail_id=? FOR UPDATE", detail);
        long stock = num(variant, "stock_quantity");
        if (stock < qty)
            throw invalid(String.format("%s: tồn hiện tại %d, không đủ trả %d.", label, stock, qty));
        int held = s.held(detail);
        if (stock - qty < held)
            throw invalid(String.format(
                    "%s: tồn %d, đang giữ cho đơn bán %d — chỉ xuất trả được tối đa %d.",
                    label, stock, held, Math.max(0, stock - held)));
        long assigned =
                s.count("SELECT COALESCE(SUM(quantity),0) FROM product_location WHERE detail_id=?", detail);
        if (assigned > stock)
            throw invalid(label + ": tồn tại vị trí lớn hơn tổng tồn; cần đối soát trước khi xuất trả.");
        for (var p : picks) {
            if (p.locationId() == null) {
                if (p.quantity() > stock - assigned)
                    throw invalid(
                            String.format(
                                    "%s: hàng chưa xếp vị trí chỉ còn %d, không lấy được %d.",
                                    label, stock - assigned, p.quantity()));
                movement(a, detail, -p.quantity(), "SUPPLIER_RETURN", item, null, "return:" + item + ":unassigned", reason);
                continue;
            }
            var rows =
                    s.jdbc()
                            .queryForList(
                                    """
                SELECT l.quantity,l.detail_id,r.rack_code,t.level_number FROM product_location l
                JOIN shelf_level t ON t.shelf_level_id=l.shelf_level_id JOIN rack r ON r.rack_id=t.rack_id
                WHERE l.product_location_id=? FOR UPDATE
                """,
                                    p.locationId());
            if (rows.isEmpty() || num(rows.get(0), "detail_id") != detail)
                throw invalid(label + ": vị trí đã chọn không chứa biến thể này.");
            var loc = rows.get(0);
            String where = "" + loc.get("rack_code") + loc.get("level_number");
            int changed =
                    s.jdbc()
                            .update(
                                    "UPDATE product_location SET quantity=quantity-?,updated_at=CURRENT_TIMESTAMP"
                                            + " WHERE product_location_id=? AND quantity>=?",
                                    p.quantity(),
                                    p.locationId(),
                                    p.quantity());
            if (changed != 1)
                throw invalid(
                        String.format(
                                "%s: vị trí %s chỉ còn %d, không lấy được %d.",
                                label, where, num(loc, "quantity"), p.quantity()));
            movement(
                    a,
                    detail,
                    -p.quantity(),
                    "SUPPLIER_RETURN",
                    item,
                    p.locationId(),
                    "return:" + item + ":" + p.locationId(),
                    reason);
        }
        int changed =
                s.jdbc()
                        .update(
                                "UPDATE product_detail SET stock_quantity=stock_quantity-? WHERE detail_id=? AND"
                                        + " stock_quantity>=?",
                                qty,
                                detail,
                                qty);
        if (changed != 1) throw invalid(label + ": tồn không đủ để xuất trả.");
    }

    /** Status/audit trail and stock movements of one document, from the existing audit/movement logs. */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Map<String, Object> history(Account a, int id) {
        policy.view(a);
        header(id);
        var actions =
                s.jdbc()
                        .queryForList(
                                """
                SELECT l.action_type,l.performed_at,l.new_value,u.full_name AS actor_name FROM audit_log l
                LEFT JOIN `user` u ON u.user_id=l.user_id
                WHERE l.entity_affected='warehouse' AND l.entity_id=? AND l.action_type LIKE 'DOCUMENT_%'
                ORDER BY l.log_id
                """,
                                id);
        var movements =
                s.jdbc()
                        .queryForList(
                                """
                SELECT m.adjustment_id,m.movement_type,m.quantity_change,m.adjusted_at,m.source_location_id,
                  u.full_name AS actor_name,p.product_name,d.color,d.size,r.rack_code,t.level_number
                FROM stock_adjustment m JOIN stock_receipt_item i ON i.receipt_item_id=m.receipt_item_id
                JOIN product_detail d ON d.detail_id=m.detail_id JOIN product p ON p.product_id=d.product_id
                JOIN `user` u ON u.user_id=m.adjusted_by
                LEFT JOIN product_location l ON l.product_location_id=m.source_location_id
                LEFT JOIN shelf_level t ON t.shelf_level_id=l.shelf_level_id
                LEFT JOIN rack r ON r.rack_id=t.rack_id
                WHERE i.receipt_id=? ORDER BY m.adjustment_id
                """,
                                id);
        return Map.of("actions", actions, "movements", movements);
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
        s.movement(a.id(), detail, change, type, item, source, key, reason);
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
        } else if ("cancel".equals(action)
                && is(doc, "receipt_type", "PURCHASE_ORDER")
                && is(doc, "status", "CONFIRMED")) {
            // A confirmed order may still be cancelled while nothing was actually received.
            if (s.count(
                    "SELECT COUNT(*) FROM stock_receipt WHERE source_receipt_id=? AND"
                            + " receipt_type='RECEIPT' AND status IN ('DRAFT','PENDING_CONFIRMATION')",
                    id)
                    > 0)
                throw invalid("Cần xử lý các phiếu nhập nháp/chờ xác nhận trước khi hủy đơn đặt.");
            if (s.count(
                    "SELECT COUNT(*) FROM stock_receipt WHERE source_receipt_id=? AND"
                            + " receipt_type='RECEIPT' AND status='CONFIRMED'",
                    id)
                    > 0)
                throw invalid(
                        "Đơn đặt đã có hàng nhập thực tế nên không hủy được. Hãy đóng phần còn thiếu kèm lý"
                                + " do để giữ lịch sử.");
            s.jdbc()
                    .update(
                            "UPDATE stock_receipt SET status='CANCELLED',rejection_reason=? WHERE receipt_id=?"
                                    + " AND status='CONFIRMED'",
                            reason,
                            id);
        } else {
            // An approved supplier return has not touched stock yet, so it can still be cancelled.
            var cancellable =
                    is(doc, "receipt_type", "SUPPLIER_RETURN")
                            ? Set.of("DRAFT", "PENDING_CONFIRMATION", "APPROVED")
                            : Set.of("DRAFT", "PENDING_CONFIRMATION");
            if (("reject".equals(action) && !is(doc, "status", "PENDING_CONFIRMATION"))
                    || (!"reject".equals(action) && !cancellable.contains(doc.get("status"))))
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

    /** Copies supplier, lines, quantities and prices of an order into a new draft; no history. */
    public Map<String, Object> copy(Account a, int id) {
        policy.owner(a);
        s.lock();
        var doc = header(id);
        if (!is(doc, "receipt_type", "PURCHASE_ORDER")) throw invalid("Chỉ sao chép phiếu đặt hàng.");
        var items =
                lines(id).stream()
                        .map(
                                l ->
                                        new Line(
                                                num(l, "detail_id"),
                                                num(l, "quantity"),
                                                (BigDecimal) l.get("unit_price"),
                                                null))
                        .toList();
        var copy =
                new Document(
                        "PURCHASE_ORDER", null, (String) doc.get("manufacturer_name"), null, items);
        validate(copy, null);
        int newId =
                s.insert(
                        "INSERT INTO"
                                + " stock_receipt(receipt_type,source_receipt_id,manufacturer_name,created_by,note,status)"
                                + " VALUES('PURCHASE_ORDER',NULL,?,?,NULL,'DRAFT')",
                        copy.manufacturer().trim(),
                        a.id());
        writeLines(newId, copy);
        s.audit(a.id(), "DOCUMENT_COPY", newId, "PURCHASE_ORDER from " + id);
        return header(newId);
    }

    private void checkStale(int id, Map<Integer, Integer> expected) {
        var changes = new ArrayList<String>();
        for (var line : lines(id)) {
            Integer source = (Integer) line.get("source_receipt_item_id");
            if (source == null || !expected.containsKey(source)) continue;
            var original = s.one("SELECT quantity FROM stock_receipt_item WHERE receipt_item_id=?", source);
            long now = Math.max(0, num(original, "quantity") - handled(source, "RECEIPT"));
            if (now != expected.get(source))
                changes.add(
                        line.get("product_name")
                                + " · "
                                + line.get("color")
                                + " · "
                                + line.get("size")
                                + ": còn thiếu lúc xem "
                                + expected.get(source)
                                + ", hiện tại "
                                + now);
        }
        if (!changes.isEmpty())
            throw new com.thors.common.ApiException(
                    409,
                    "WAREHOUSE_STALE",
                    "Số liệu đơn đặt đã thay đổi do có đợt nhập khác vừa được xác nhận. "
                            + String.join("; ", changes)
                            + ". Hãy tải lại và xác nhận lại.");
    }

    private long remaining(int po) {
        return lines(po).stream()
                .mapToLong(l -> Math.max(0, num(l, "quantity") - handled(num(l, "receipt_item_id"), "RECEIPT")))
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
