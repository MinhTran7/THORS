package com.thors.module.warehouse;

import static com.thors.module.warehouse.WarehouseStore.*;

import com.thors.module.account.entity.Account;
import java.math.BigDecimal;
import java.text.Normalizer;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read model for purchase orders. Every number is derived from stored documents:
 *
 * <ul>
 *   <li>ordered = quantity of the order line (never rewritten by receipts);
 *   <li>received = CONFIRMED receipt lines linked to the order line. A linked line with another
 *       detail_id is reported as "substitute"; anything above the ordered quantity as "over";
 *   <li>remaining = ordered - min(ordered, received) while the order is CONFIRMED, never negative;
 *   <li>open obligation ("đang đặt") only counts CONFIRMED orders, never draft/cancelled/closed.
 * </ul>
 *
 * Supplier identity is the manufacturer_name string of the order (no supplier table): trimmed,
 * whitespace collapsed, lower-cased; accents are kept so "An" and "Ân" stay different suppliers.
 */
@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class WarehouseOrders {
    private static final Set<String> HISTORY = Set.of("CONFIRMED", "CLOSED");

    private final WarehouseStore s;
    private final WarehousePolicy policy;

    public WarehouseOrders(WarehouseStore s, WarehousePolicy policy) {
        this.s = s;
        this.policy = policy;
    }

    static String supplierKey(Object name) {
        return name == null
                ? ""
                : name.toString().trim().replaceAll("\\s+", " ").toLowerCase(Locale.forLanguageTag("vi"));
    }

    static String searchKey(Object text) {
        if (text == null) return "";
        return Normalizer.normalize(text.toString(), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .replace('đ', 'd')
                .replace('Đ', 'D')
                .toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", " ")
                .trim();
    }

    static String code(int id) {
        return String.format(Locale.ROOT, "PD%05d", id);
    }

    /** One purchase-order line with everything derived from linked receipts and returns. */
    static final class LineState {
        int itemId, orderId, detailId, ordered;
        BigDecimal price;
        String orderStatus, supplier;
        Object orderDate;
        long exact, substitute, pending, returned;

        long received() {
            return exact + substitute;
        }

        long fulfilled() {
            return Math.min(ordered, received());
        }

        long over() {
            return Math.max(0, received() - ordered);
        }

        long shortfall() {
            return ordered - fulfilled();
        }

        long remaining() {
            return "CONFIRMED".equals(orderStatus) ? shortfall() : 0;
        }

        long closedShort() {
            return "CLOSED".equals(orderStatus) ? shortfall() : 0;
        }
    }

    Map<Integer, LineState> lineStates() {
        var states = new LinkedHashMap<Integer, LineState>();
        for (var row :
                s.jdbc()
                        .queryForList(
                                """
                SELECT i.receipt_item_id,i.receipt_id,i.detail_id,i.quantity,i.unit_price,
                  r.status,r.manufacturer_name,r.receipt_date
                FROM stock_receipt_item i JOIN stock_receipt r ON r.receipt_id=i.receipt_id
                WHERE r.receipt_type='PURCHASE_ORDER' ORDER BY i.receipt_item_id
                """)) {
            var l = new LineState();
            l.itemId = num(row, "receipt_item_id");
            l.orderId = num(row, "receipt_id");
            l.detailId = num(row, "detail_id");
            l.ordered = num(row, "quantity");
            l.price = (BigDecimal) row.get("unit_price");
            l.orderStatus = (String) row.get("status");
            l.supplier = (String) row.get("manufacturer_name");
            l.orderDate = row.get("receipt_date");
            states.put(l.itemId, l);
        }
        var returned = new HashMap<Integer, Long>();
        for (var row :
                s.jdbc()
                        .queryForList(
                                """
                SELECT y.source_receipt_item_id AS line_id,SUM(y.quantity) AS qty
                FROM stock_receipt_item y JOIN stock_receipt t ON t.receipt_id=y.receipt_id
                WHERE t.receipt_type='SUPPLIER_RETURN' AND t.status='CONFIRMED'
                  AND y.source_receipt_item_id IS NOT NULL
                GROUP BY y.source_receipt_item_id
                """))
            returned.put(num(row, "line_id"), ((Number) row.get("qty")).longValue());
        for (var row :
                s.jdbc()
                        .queryForList(
                                """
                SELECT x.receipt_item_id,x.source_receipt_item_id,x.detail_id,x.quantity,r.status
                FROM stock_receipt_item x JOIN stock_receipt r ON r.receipt_id=x.receipt_id
                WHERE r.receipt_type='RECEIPT' AND x.source_receipt_item_id IS NOT NULL
                """)) {
            var l = states.get(num(row, "source_receipt_item_id"));
            if (l == null) continue;
            int qty = num(row, "quantity");
            String status = (String) row.get("status");
            if ("CONFIRMED".equals(status)) {
                if (num(row, "detail_id") == l.detailId) l.exact += qty;
                else l.substitute += qty;
                l.returned += returned.getOrDefault(num(row, "receipt_item_id"), 0L);
            } else if (Set.of("DRAFT", "PENDING_CONFIRMATION").contains(status)) l.pending += qty;
        }
        return states;
    }

    private static String progress(String status, List<LineState> lines) {
        if (!HISTORY.contains(status)) return "NOT_APPLICABLE";
        long ordered = lines.stream().mapToLong(l -> l.ordered).sum();
        long fulfilled = lines.stream().mapToLong(LineState::fulfilled).sum();
        if ("CLOSED".equals(status) && fulfilled < ordered) return "CLOSED_SHORT";
        if (ordered > 0 && fulfilled >= ordered) return "RECEIVED";
        return fulfilled == 0 ? "NOT_RECEIVED" : "PARTIAL";
    }

    private static Map<String, Object> summary(Map<String, Object> doc, List<LineState> lines) {
        var row = new LinkedHashMap<String, Object>();
        row.put("receipt_id", doc.get("receipt_id"));
        row.put("receipt_type", "PURCHASE_ORDER");
        row.put("code", code(num(doc, "receipt_id")));
        row.put("manufacturer_name", doc.get("manufacturer_name"));
        row.put("receipt_date", doc.get("receipt_date"));
        row.put("status", doc.get("status"));
        row.put("created_by", doc.get("created_by"));
        row.put("creator_name", doc.get("creator_name"));
        row.put("line_count", lines.size());
        row.put(
                "total_amount",
                lines.stream()
                        .map(l -> l.price.multiply(BigDecimal.valueOf(l.ordered)))
                        .reduce(BigDecimal.ZERO, BigDecimal::add));
        row.put("ordered_quantity", lines.stream().mapToLong(l -> l.ordered).sum());
        row.put("received_quantity", lines.stream().mapToLong(LineState::received).sum());
        row.put("fulfilled_quantity", lines.stream().mapToLong(LineState::fulfilled).sum());
        row.put("remaining_quantity", lines.stream().mapToLong(LineState::remaining).sum());
        row.put("closed_short_quantity", lines.stream().mapToLong(LineState::closedShort).sum());
        row.put("over_quantity", lines.stream().mapToLong(LineState::over).sum());
        row.put("substitute_quantity", lines.stream().mapToLong(l -> l.substitute).sum());
        row.put("returned_quantity", lines.stream().mapToLong(l -> l.returned).sum());
        row.put("pending_receipt_quantity", lines.stream().mapToLong(l -> l.pending).sum());
        row.put("progress", progress((String) doc.get("status"), lines));
        return row;
    }

    private List<Map<String, Object>> orderHeaders() {
        return s.jdbc()
                .queryForList(
                        """
            SELECT r.receipt_id,r.manufacturer_name,r.receipt_date,r.status,r.created_by,r.note,
              r.confirmed_at,r.rejection_reason,r.closed_at,r.close_reason,
              u.full_name AS creator_name,c.full_name AS confirmer_name
            FROM stock_receipt r JOIN `user` u ON u.user_id=r.created_by
            LEFT JOIN `user` c ON c.user_id=r.confirmed_by
            WHERE r.receipt_type='PURCHASE_ORDER' ORDER BY r.receipt_id DESC
            """);
    }

    /** Paged purchase-order list; search/filter run on backend data, not on the open page. */
    public Map<String, Object> list(
            Account a, String q, String status, String progress, String supplier, int page, int size) {
        policy.view(a);
        int pageSize = Math.max(1, Math.min(size, 100));
        int pageNo = Math.max(0, page);
        var byOrder =
                lineStates().values().stream().collect(Collectors.groupingBy(l -> l.orderId));
        String query = searchKey(q);
        String supplierFilter = supplierKey(supplier);
        var rows = new ArrayList<Map<String, Object>>();
        for (var doc : orderHeaders()) {
            var row = summary(doc, byOrder.getOrDefault(num(doc, "receipt_id"), List.of()));
            if (status != null && !status.isBlank() && !status.equals(row.get("status"))) continue;
            if (progress != null && !progress.isBlank() && !progress.equals(row.get("progress"))) continue;
            if (!supplierFilter.isEmpty() && !supplierFilter.equals(supplierKey(row.get("manufacturer_name"))))
                continue;
            if (!query.isEmpty()
                    && !searchKey(row.get("code") + " " + row.get("receipt_id") + " "
                                    + row.get("manufacturer_name") + " " + row.get("creator_name"))
                            .contains(query)) continue;
            rows.add(row);
        }
        int from = Math.min(rows.size(), pageNo * pageSize);
        var result = new LinkedHashMap<String, Object>();
        result.put("items", rows.subList(from, Math.min(rows.size(), from + pageSize)));
        result.put("total", rows.size());
        result.put("page", pageNo);
        result.put("size", pageSize);
        return result;
    }

    /** Order header, per-line progress and the linked receipts / supplier returns. */
    public Map<String, Object> detail(Account a, int id) {
        policy.view(a);
        var doc =
                orderHeaders().stream()
                        .filter(d -> num(d, "receipt_id") == id)
                        .findFirst()
                        .orElseThrow(
                                () -> new com.thors.common.ApiException(404, "NOT_FOUND", "Không tìm thấy phiếu đặt."));
        var states = lineStates();
        var lines =
                states.values().stream().filter(l -> l.orderId == id).toList();
        var variantRows =
                s.jdbc()
                        .queryForList(
                                """
                SELECT i.receipt_item_id,i.detail_id,p.product_name,d.color,d.size
                FROM stock_receipt_item i JOIN product_detail d ON d.detail_id=i.detail_id
                JOIN product p ON p.product_id=d.product_id WHERE i.receipt_id=?
                """,
                                id);
        var labels = new HashMap<Integer, Map<String, Object>>();
        for (var r : variantRows) labels.put(num(r, "receipt_item_id"), r);
        var items = new ArrayList<Map<String, Object>>();
        for (var l : lines) {
            var row = new LinkedHashMap<String, Object>();
            var label = labels.getOrDefault(l.itemId, Map.of());
            row.put("receipt_item_id", l.itemId);
            row.put("detail_id", l.detailId);
            row.put("product_name", label.get("product_name"));
            row.put("color", label.get("color"));
            row.put("size", label.get("size"));
            row.put("ordered_quantity", l.ordered);
            row.put("unit_price", l.price);
            row.put("received_exact", l.exact);
            row.put("received_substitute", l.substitute);
            row.put("fulfilled_quantity", l.fulfilled());
            row.put("over_quantity", l.over());
            row.put("remaining_quantity", l.remaining());
            row.put("closed_short_quantity", l.closedShort());
            row.put("returned_quantity", l.returned);
            row.put("pending_receipt_quantity", l.pending);
            items.add(row);
        }
        var receipts =
                s.jdbc()
                        .queryForList(
                                """
                SELECT r.receipt_id,r.receipt_type,r.status,r.receipt_date,r.confirmed_at,r.source_receipt_id,
                  u.full_name AS creator_name,
                  COALESCE(SUM(i.quantity),0) AS quantity,COALESCE(SUM(i.quantity*i.unit_price),0) AS amount
                FROM stock_receipt r JOIN `user` u ON u.user_id=r.created_by
                LEFT JOIN stock_receipt_item i ON i.receipt_id=r.receipt_id
                WHERE (r.receipt_type='RECEIPT' AND r.source_receipt_id=?)
                   OR (r.receipt_type='SUPPLIER_RETURN' AND r.source_receipt_id IN
                       (SELECT x.receipt_id FROM stock_receipt x WHERE x.receipt_type='RECEIPT' AND x.source_receipt_id=?))
                GROUP BY r.receipt_id,r.receipt_type,r.status,r.receipt_date,r.confirmed_at,r.source_receipt_id,u.full_name
                ORDER BY r.receipt_id
                """,
                                id,
                                id);
        var result = copy(summary(doc, lines));
        result.put("note", doc.get("note"));
        result.put("confirmed_at", doc.get("confirmed_at"));
        result.put("confirmer_name", doc.get("confirmer_name"));
        result.put("rejection_reason", doc.get("rejection_reason"));
        result.put("closed_at", doc.get("closed_at"));
        result.put("close_reason", doc.get("close_reason"));
        result.put("items", items);
        result.put("related", receipts);
        result.put(
                "can_cancel_confirmed",
                "CONFIRMED".equals(doc.get("status"))
                        && receipts.stream()
                                .noneMatch(
                                        r -> "RECEIPT".equals(r.get("receipt_type"))
                                                && Set.of("DRAFT", "PENDING_CONFIRMATION", "CONFIRMED")
                                                        .contains(r.get("status"))));
        return result;
    }

    /** Supplier names known from orders; history counts only CONFIRMED/CLOSED orders. */
    public List<Map<String, Object>> suppliers(Account a) {
        policy.view(a);
        var groups = new LinkedHashMap<String, Map<String, Object>>();
        for (var doc : orderHeaders()) {
            String key = supplierKey(doc.get("manufacturer_name"));
            if (key.isEmpty()) continue;
            var g =
                    groups.computeIfAbsent(
                            key,
                            k -> {
                                var m = new LinkedHashMap<String, Object>();
                                m.put("name", doc.get("manufacturer_name").toString().trim());
                                m.put("confirmed_orders", 0);
                                m.put("all_orders", 0);
                                m.put("last_order_date", null);
                                return m;
                            });
            g.put("all_orders", (int) g.get("all_orders") + 1);
            if (HISTORY.contains(doc.get("status"))) {
                g.put("confirmed_orders", (int) g.get("confirmed_orders") + 1);
                if (g.get("last_order_date") == null) g.put("last_order_date", doc.get("receipt_date"));
            }
        }
        return new ArrayList<>(groups.values());
    }

    /**
     * Variant picker for a purchase order. scope=history keeps variants that appear on a CONFIRMED or
     * CLOSED order of the supplier (document history, not an official supply catalogue); scope=all
     * lists every variant. Stock is the store-wide total stock, not stock per supplier.
     */
    public Map<String, Object> variants(
            Account a,
            String supplier,
            String scope,
            String q,
            Integer categoryId,
            Integer excludeOrderId,
            int page,
            int size) {
        policy.view(a);
        String key = supplierKey(supplier);
        boolean historyOnly = !"all".equals(scope);
        var history = new HashMap<Integer, LineState>();
        var onOrderHere = new HashMap<Integer, Long>();
        var onOrderOther = new HashMap<Integer, Long>();
        var otherSuppliers = new HashMap<Integer, Set<String>>();
        var receivedHere = new HashMap<Integer, Long>();
        for (var l : lineStates().values()) {
            if (excludeOrderId != null && l.orderId == excludeOrderId) continue;
            boolean same = !key.isEmpty() && key.equals(supplierKey(l.supplier));
            if (same && HISTORY.contains(l.orderStatus)) {
                var last = history.get(l.detailId);
                if (last == null || last.orderId < l.orderId) history.put(l.detailId, l);
                receivedHere.merge(l.detailId, l.exact, Long::sum);
            }
            long open = l.remaining();
            if (open <= 0) continue;
            if (same) onOrderHere.merge(l.detailId, open, Long::sum);
            else {
                onOrderOther.merge(l.detailId, open, Long::sum);
                otherSuppliers
                        .computeIfAbsent(l.detailId, k -> new TreeSet<>())
                        .add(l.supplier == null ? "" : l.supplier.trim());
            }
        }
        String query = searchKey(q);
        var rows = new ArrayList<Map<String, Object>>();
        for (var v :
                s.jdbc()
                        .queryForList(
                                """
                SELECT d.detail_id,d.product_id,d.color,d.size,d.price AS sale_price,d.stock_quantity,
                  d.status AS variant_status,d.online_sales_enabled,p.product_name,p.status AS product_status,
                  p.category_id,c.category_name
                FROM product_detail d JOIN product p ON p.product_id=d.product_id
                LEFT JOIN category c ON c.category_id=p.category_id
                ORDER BY p.product_name,d.color,d.size,d.detail_id
                """)) {
            int detail = num(v, "detail_id");
            var last = history.get(detail);
            if (historyOnly && last == null) continue;
            if (categoryId != null && (v.get("category_id") == null || num(v, "category_id") != categoryId))
                continue;
            if (!query.isEmpty()
                    && !searchKey(v.get("product_name") + " " + v.get("color") + " " + v.get("size") + " #"
                                    + detail + " sp" + v.get("product_id"))
                            .contains(query)) continue;
            var row = copy(v);
            row.put("ordered_from_supplier", last != null);
            row.put("last_order_price", last == null ? null : last.price);
            row.put("last_order_date", last == null ? null : last.orderDate);
            row.put("last_order_id", last == null ? null : last.orderId);
            row.put("received_from_supplier", receivedHere.getOrDefault(detail, 0L));
            row.put("on_order_supplier", onOrderHere.getOrDefault(detail, 0L));
            row.put("on_order_other", onOrderOther.getOrDefault(detail, 0L));
            row.put("other_suppliers", otherSuppliers.getOrDefault(detail, Set.of()));
            rows.add(row);
        }
        int pageSize = Math.max(1, Math.min(size, 100));
        int pageNo = Math.max(0, page);
        int from = Math.min(rows.size(), pageNo * pageSize);
        var result = new LinkedHashMap<String, Object>();
        result.put("items", rows.subList(from, Math.min(rows.size(), from + pageSize)));
        result.put("total", rows.size());
        result.put("page", pageNo);
        result.put("size", pageSize);
        result.put("supplier_has_history", !history.isEmpty());
        return result;
    }

}
