package com.thors.module.warehouse;

import static com.thors.module.warehouse.WarehouseStore.*;

import com.thors.module.account.entity.Account;
import com.thors.module.warehouse.WarehouseRequests.Settlement;
import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Money between the shop and a supplier, and replacement goods agreed for supplier returns.
 *
 * <p>Purchase debt of a confirmed receipt from a purchase order:
 * {@code value − paid_before_tracking − Σ PAYMENT − Σ DEBT_OFFSET − Σ CREDIT_USE}. Each amount is
 * counted once and the debt never goes below zero. {@code paid_before_tracking} is NULL for receipts
 * confirmed before payment tracking: their debt is unknown (never assumed paid or unpaid) until the
 * Owner declares what had been paid; receipts confirmed later start at 0.
 *
 * <p>A dispatched return's value (Σ quantity × unit price) is settled by REFUND (several times
 * allowed), DEBT_OFFSET (on one receipt of the same supplier), CREDIT_HOLD (supplier keeps it; later
 * CREDIT_USE on a receipt) or EXCHANGE (supplier will deliver the same variant again). Exchange goods
 * enter stock only through a normal RECEIPT whose source is the return, confirmed by the Owner; that
 * receipt creates no new debt because the returned goods paid for it.
 *
 * <p>Entries are corrected by voiding with a reason, never deleted.
 */
@Service
@Transactional(isolation = Isolation.READ_COMMITTED)
public class WarehouseSettlements {
    private static final Set<String> FOR_RETURN = Set.of("REFUND", "DEBT_OFFSET", "CREDIT_HOLD", "EXCHANGE");
    private final WarehouseStore s;
    private final WarehousePolicy policy;

    public WarehouseSettlements(WarehouseStore s, WarehousePolicy policy) {
        this.s = s;
        this.policy = policy;
    }

    /** Debt of a purchase receipt; null while what was paid before tracking is not declared. */
    static BigDecimal debt(BigDecimal value, Object paidBefore, BigDecimal reductions) {
        return paidBefore == null ? null : value.subtract((BigDecimal) paidBefore).subtract(reductions);
    }

    private static String vnd(BigDecimal v) {
        return NumberFormat.getIntegerInstance(Locale.forLanguageTag("vi")).format(v) + " ₫";
    }

    private static String code(String prefix, int id) {
        return prefix + String.format("%05d", id);
    }

    private String supplierOf(int doc) {
        var name = s.supplierName(doc);
        return name == null ? "" : name;
    }

    private BigDecimal value(int doc) {
        return s.jdbc()
                .queryForObject(
                        "SELECT COALESCE(SUM(quantity*unit_price),0) FROM stock_receipt_item WHERE receipt_id=?",
                        BigDecimal.class,
                        doc);
    }

    private BigDecimal sum(String where, Object... args) {
        return s.jdbc()
                .queryForObject(
                        "SELECT COALESCE(SUM(amount),0) FROM supplier_settlement WHERE voided_at IS NULL AND " + where,
                        BigDecimal.class,
                        args);
    }

    /** Part of a dispatched return not yet refunded, offset, held as credit or exchanged. */
    private BigDecimal unsettled(int returnId) {
        return value(returnId)
                .subtract(sum("return_id=? AND settlement_type IN ('REFUND','DEBT_OFFSET','CREDIT_HOLD','EXCHANGE')", returnId));
    }

    /** Credit held by a supplier (all its returns) minus what was already used. */
    private BigDecimal credit(String supplier) {
        String key = WarehouseOrders.supplierKey(supplier);
        var balance = BigDecimal.ZERO;
        for (var row :
                s.jdbc()
                        .queryForList(
                                """
                SELECT supplier_name,settlement_type,SUM(amount) AS amount FROM supplier_settlement
                WHERE voided_at IS NULL AND settlement_type IN ('CREDIT_HOLD','CREDIT_USE')
                GROUP BY supplier_name,settlement_type
                """))
            if (WarehouseOrders.supplierKey(row.get("supplier_name")).equals(key))
                balance =
                        "CREDIT_HOLD".equals(row.get("settlement_type"))
                                ? balance.add((BigDecimal) row.get("amount"))
                                : balance.subtract((BigDecimal) row.get("amount"));
        return balance;
    }

    /** Purchase receipt (CONFIRMED, from a purchase order) with its debt numbers. */
    private Map<String, Object> purchase(int receipt) {
        var doc =
                s.one(
                        """
                SELECT r.*,p.receipt_type AS source_type FROM stock_receipt r
                LEFT JOIN stock_receipt p ON p.receipt_id=r.source_receipt_id WHERE r.receipt_id=?
                """,
                        receipt);
        if (!is(doc, "receipt_type", "RECEIPT") || !is(doc, "status", "CONFIRMED"))
            throw invalid("Chỉ ghi thanh toán/đối trừ cho phiếu nhập đã xác nhận.");
        if (!is(doc, "source_type", "PURCHASE_ORDER"))
            throw invalid("Phiếu nhập hàng đổi không phát sinh công nợ.");
        var value = value(receipt);
        var paid = sum("target_receipt_id=? AND settlement_type='PAYMENT'", receipt);
        var offset = sum("target_receipt_id=? AND settlement_type IN ('DEBT_OFFSET','CREDIT_USE')", receipt);
        var result = new LinkedHashMap<String, Object>();
        result.put("value", value);
        result.put("paid_before_tracking", doc.get("paid_before_tracking"));
        result.put("paid_amount", paid);
        result.put("offset_amount", offset);
        result.put("debt_amount", debt(value, doc.get("paid_before_tracking"), paid.add(offset)));
        return result;
    }

    private void checkDebt(Integer target, String supplier, BigDecimal amount) {
        if (target == null) throw invalid("Chọn phiếu nhập.");
        var p = purchase(target);
        if (!WarehouseOrders.supplierKey(supplierOf(target)).equals(WarehouseOrders.supplierKey(supplier)))
            throw invalid("Phiếu nhập phải cùng nhà cung cấp.");
        var debt = (BigDecimal) p.get("debt_amount");
        if (debt == null)
            throw invalid(
                    code("PN", target)
                            + " xác nhận trước khi theo dõi công nợ và chưa khai báo số đã thanh toán trước đó."
                            + " Khai báo trước khi ghi thanh toán hoặc đối trừ.");
        if (amount.compareTo(debt) > 0)
            throw invalid(
                    "Vượt số còn nợ của phiếu nhập " + code("PN", target) + ": còn nợ " + vnd(debt) + ", lần này "
                            + vnd(amount) + ".");
    }

    public Map<String, Object> record(Account a, Settlement r) {
        policy.owner(a);
        s.lock();
        var existing = s.jdbc().queryForList("SELECT * FROM supplier_settlement WHERE request_key=?", r.requestKey());
        if (!existing.isEmpty()) return existing.get(0); // retried request
        String type = r.type(), supplier;
        Integer returnId = null, itemId = null, target = null, quantity = null;
        BigDecimal amount = r.amount();
        if (FOR_RETURN.contains(type)) {
            if (r.returnId() == null) throw invalid("Chọn phiếu trả hàng.");
            var ret = s.one("SELECT * FROM stock_receipt WHERE receipt_id=?", r.returnId());
            if (!is(ret, "receipt_type", "SUPPLIER_RETURN") || !is(ret, "status", "CONFIRMED"))
                throw invalid("Chỉ xử lý tiền/đổi hàng cho phiếu trả đã xuất trả.");
            returnId = r.returnId();
            supplier = supplierOf(returnId);
            if ("EXCHANGE".equals(type)) {
                if (r.itemId() == null || r.quantity() == null)
                    throw invalid("Chọn dòng hàng và số lượng nhà cung cấp sẽ đổi.");
                var line = s.one("SELECT * FROM stock_receipt_item WHERE receipt_item_id=?", r.itemId());
                if (num(line, "receipt_id") != returnId) throw invalid("Dòng hàng không thuộc phiếu trả này.");
                long done =
                        s.count(
                                "SELECT COALESCE(SUM(quantity),0) FROM supplier_settlement WHERE return_item_id=?"
                                        + " AND settlement_type='EXCHANGE' AND voided_at IS NULL",
                                r.itemId());
                long left = num(line, "quantity") - done;
                if (r.quantity() > left)
                    throw invalid(
                            String.format(
                                    "Đổi hàng vượt: đã trả %d, đã ghi đổi %d, còn đổi được %d, lần này %d.",
                                    num(line, "quantity"), done, left, r.quantity()));
                itemId = r.itemId();
                quantity = r.quantity();
                amount = ((BigDecimal) line.get("unit_price")).multiply(BigDecimal.valueOf(quantity));
            } else if (amount == null) throw invalid("Nhập số tiền.");
            var open = unsettled(returnId);
            if (amount.compareTo(open) > 0)
                throw invalid(
                        "Vượt phần chưa xử lý của phiếu trả " + code("PT", returnId) + ": còn " + vnd(open)
                                + ", lần này " + vnd(amount) + ".");
            if ("DEBT_OFFSET".equals(type)) {
                checkDebt(r.targetReceiptId(), supplier, amount);
                target = r.targetReceiptId();
            }
        } else { // PAYMENT, CREDIT_USE: reduce the debt of one purchase receipt
            if (amount == null) throw invalid("Nhập số tiền.");
            if (r.targetReceiptId() == null) throw invalid("Chọn phiếu nhập.");
            supplier = supplierOf(r.targetReceiptId());
            if ("CREDIT_USE".equals(type)) {
                var balance = credit(supplier);
                if (amount.compareTo(balance) > 0)
                    throw invalid("Tiền đối trừ đang giữ của nhà cung cấp chỉ còn " + vnd(balance) + ".");
            }
            checkDebt(r.targetReceiptId(), supplier, amount);
            target = r.targetReceiptId();
        }
        boolean money = "REFUND".equals(type) || "PAYMENT".equals(type);
        if (money && r.method() == null) throw invalid("Chọn hình thức thanh toán.");
        int id =
                s.insert(
                        """
                INSERT INTO supplier_settlement(settlement_type,supplier_name,return_id,return_item_id,target_receipt_id,
                  quantity,amount,payment_method,transaction_date,note,created_by,request_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                        type,
                        supplier,
                        returnId,
                        itemId,
                        target,
                        quantity,
                        amount,
                        money ? r.method() : null,
                        r.date() == null ? LocalDate.now() : r.date(),
                        r.note() == null || r.note().isBlank() ? null : r.note().trim(),
                        a.id(),
                        r.requestKey());
        for (var doc : new LinkedHashSet<>(Arrays.asList(returnId, target)))
            if (doc != null) s.audit(a.id(), "DOCUMENT_" + type, doc, amount.toPlainString());
        return entry(id);
    }

    private Map<String, Object> entry(int id) {
        return s.one("SELECT * FROM supplier_settlement WHERE settlement_id=?", id);
    }

    public Map<String, Object> voidEntry(Account a, int id, String reason) {
        policy.owner(a);
        s.lock();
        var row = entry(id);
        if (row.get("voided_at") != null) return row;
        if (reason == null || reason.isBlank()) throw invalid("Cần nhập lý do hủy.");
        String type = (String) row.get("settlement_type");
        if ("EXCHANGE".equals(type)) {
            // Replacement goods already received through confirmed receipts must stay covered.
            int item = num(row, "return_item_id");
            long agreed =
                    s.count(
                            "SELECT COALESCE(SUM(quantity),0) FROM supplier_settlement WHERE return_item_id=? AND"
                                    + " settlement_type='EXCHANGE' AND voided_at IS NULL",
                            item);
            long received =
                    s.count(
                            """
                    SELECT COALESCE(SUM(i.quantity),0) FROM stock_receipt_item i
                    JOIN stock_receipt r ON r.receipt_id=i.receipt_id
                    WHERE i.source_receipt_item_id=? AND r.receipt_type='RECEIPT' AND r.status='CONFIRMED'
                    """,
                            item);
            if (agreed - num(row, "quantity") < received)
                throw invalid(
                        String.format(
                                "Đã nhận %d sản phẩm hàng đổi qua phiếu nhập nên không hủy được phần đổi này.",
                                received));
        }
        if ("CREDIT_HOLD".equals(type)) {
            var balance = credit((String) row.get("supplier_name"));
            if (balance.compareTo((BigDecimal) row.get("amount")) < 0)
                throw invalid(
                        "Tiền đối trừ này đã được dùng (số dư còn " + vnd(balance)
                                + "). Hủy các lần dùng tiền đối trừ trước.");
        }
        s.jdbc()
                .update(
                        "UPDATE supplier_settlement SET voided_by=?,voided_at=CURRENT_TIMESTAMP,void_reason=? WHERE"
                                + " settlement_id=? AND voided_at IS NULL",
                        a.id(),
                        reason.trim(),
                        id);
        for (var doc : new LinkedHashSet<>(Arrays.asList(row.get("return_id"), row.get("target_receipt_id"))))
            if (doc != null) s.audit(a.id(), "DOCUMENT_SETTLEMENT_VOID", ((Number) doc).intValue(), type + ": " + reason.trim());
        return entry(id);
    }

    /**
     * Owner declares what had been paid on a receipt confirmed before payment tracking. May be
     * corrected later, but never below zero debt given the payments/offsets recorded since.
     */
    public Map<String, Object> declareBasis(Account a, int receipt, BigDecimal paidBefore) {
        policy.owner(a);
        s.lock();
        var p = purchase(receipt);
        var reductions = ((BigDecimal) p.get("paid_amount")).add((BigDecimal) p.get("offset_amount"));
        var max = ((BigDecimal) p.get("value")).subtract(reductions);
        if (paidBefore.compareTo(max) > 0)
            throw invalid(
                    "Số đã thanh toán trước vượt giá trị còn lại của phiếu nhập (tối đa " + vnd(max)
                            + " sau các khoản đã ghi).");
        s.jdbc().update("UPDATE stock_receipt SET paid_before_tracking=? WHERE receipt_id=?", paidBefore, receipt);
        Object old = p.get("paid_before_tracking");
        s.audit(
                a.id(),
                "DOCUMENT_PAYMENT_BASIS",
                receipt,
                (old == null ? "chưa khai báo" : ((BigDecimal) old).toPlainString()) + " → " + paidBefore.toPlainString());
        return purchase(receipt);
    }

    /** Entries of a return (source) or a receipt (target / exchange source), debt and supplier credit. */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Map<String, Object> forDocument(Account a, int id) {
        policy.view(a);
        var doc =
                s.one(
                        """
                SELECT r.*,p.receipt_type AS source_type FROM stock_receipt r
                LEFT JOIN stock_receipt p ON p.receipt_id=r.source_receipt_id WHERE r.receipt_id=?
                """,
                        id);
        var entries =
                s.jdbc()
                        .queryForList(
                                """
                SELECT x.*,u.full_name AS creator_name,v.full_name AS voider_name,p.product_name,d.color,d.size
                FROM supplier_settlement x JOIN `user` u ON u.user_id=x.created_by
                LEFT JOIN `user` v ON v.user_id=x.voided_by
                LEFT JOIN stock_receipt_item i ON i.receipt_item_id=x.return_item_id
                LEFT JOIN product_detail d ON d.detail_id=i.detail_id LEFT JOIN product p ON p.product_id=d.product_id
                WHERE x.return_id=? OR x.target_receipt_id=? ORDER BY x.transaction_date,x.settlement_id
                """,
                                id,
                                id);
        var result = new LinkedHashMap<String, Object>();
        result.put("entries", entries);
        result.put("supplier_credit", credit(supplierOf(id)));
        if (is(doc, "receipt_type", "RECEIPT") && is(doc, "status", "CONFIRMED") && is(doc, "source_type", "PURCHASE_ORDER"))
            result.put("debt", purchase(id));
        return result;
    }

    /**
     * Per supplier: payments, refunds, offsets, held credit balance and purchase debt. Debt only sums
     * receipts whose pre-tracking payment is declared; the others are counted separately.
     */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<Map<String, Object>> credits(Account a) {
        policy.view(a);
        var bySupplier = new LinkedHashMap<String, Map<String, Object>>();
        java.util.function.Function<Object, Map<String, Object>> of =
                name ->
                        bySupplier.computeIfAbsent(
                                WarehouseOrders.supplierKey(name),
                                k -> {
                                    var x = new LinkedHashMap<String, Object>();
                                    x.put("supplier_name", name);
                                    for (var t : List.of("payment", "refund", "debt_offset", "credit_hold", "credit_use", "exchange"))
                                        x.put(t + "_amount", BigDecimal.ZERO);
                                    x.put("debt_amount", BigDecimal.ZERO);
                                    x.put("undeclared_receipts", 0);
                                    return x;
                                });
        for (var row :
                s.jdbc()
                        .queryForList(
                                """
                SELECT supplier_name,settlement_type,SUM(amount) AS amount FROM supplier_settlement
                WHERE voided_at IS NULL GROUP BY supplier_name,settlement_type ORDER BY supplier_name
                """)) {
            var m = of.apply(row.get("supplier_name"));
            String field = row.get("settlement_type").toString().toLowerCase(Locale.ROOT) + "_amount";
            m.put(field, ((BigDecimal) m.get(field)).add((BigDecimal) row.get("amount")));
        }
        for (var row :
                s.jdbc()
                        .queryForList(
                                """
                SELECT r.receipt_id,r.paid_before_tracking,TRIM(p.manufacturer_name) AS supplier_name,
                  (SELECT COALESCE(SUM(i.quantity*i.unit_price),0) FROM stock_receipt_item i WHERE i.receipt_id=r.receipt_id) AS receipt_value,
                  (SELECT COALESCE(SUM(x.amount),0) FROM supplier_settlement x
                    WHERE x.target_receipt_id=r.receipt_id AND x.voided_at IS NULL) AS reductions
                FROM stock_receipt r JOIN stock_receipt p ON p.receipt_id=r.source_receipt_id
                WHERE r.receipt_type='RECEIPT' AND r.status='CONFIRMED' AND p.receipt_type='PURCHASE_ORDER'
                """)) {
            var m = of.apply(row.get("supplier_name"));
            var debt = debt((BigDecimal) row.get("receipt_value"), row.get("paid_before_tracking"), (BigDecimal) row.get("reductions"));
            if (debt == null) m.put("undeclared_receipts", (int) m.get("undeclared_receipts") + 1);
            else m.put("debt_amount", ((BigDecimal) m.get("debt_amount")).add(debt));
        }
        for (var m : bySupplier.values())
            m.put(
                    "credit_balance",
                    ((BigDecimal) m.get("credit_hold_amount")).subtract((BigDecimal) m.get("credit_use_amount")));
        return new ArrayList<>(bySupplier.values());
    }
}
