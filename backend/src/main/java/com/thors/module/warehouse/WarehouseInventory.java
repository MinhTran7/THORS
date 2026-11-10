package com.thors.module.warehouse;

import static com.thors.module.warehouse.WarehouseStore.*;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Inventory read model (list, variant detail, stock card, period report) and the minimum-stock
 * threshold. Every number is derived from stored rows:
 *
 * <ul>
 *   <li>total = product_detail.stock_quantity; placed = Σ product_location.quantity; unplaced =
 *       total − placed;
 *   <li>held = Σ order_item.reserved_quantity (online orders waiting for the owner); sellable =
 *       total − held;
 *   <li>incoming = remaining of CONFIRMED purchase orders ({@link WarehouseOrders#lineStates()}),
 *       never added to total or sellable;
 *   <li>cost = perpetual moving weighted average (bình quân gia quyền liên hoàn) replayed from the
 *       ledger in time order, see {@link #replay}. Owner only. Stock whose origin has no price is
 *       reported as "no cost basis", never valued at 0, sale price or last purchase price;
 *   <li>report and stock card = the stock_adjustment ledger walked back from the current stock.
 * </ul>
 */
@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class WarehouseInventory {
    static final Set<String> STATES = Set.of("in", "out", "low", "unassigned", "slow", "noThreshold");

    private final WarehouseStore s;
    private final WarehousePolicy policy;
    private final WarehouseOrders orders;

    public WarehouseInventory(WarehouseStore s, WarehousePolicy policy, WarehouseOrders orders) {
        this.s = s;
        this.policy = policy;
        this.orders = orders;
    }

    private Duration dbOffset() {
        return s.clockOffset();
    }

    private static LocalDateTime startOf(LocalDate day, Duration offset) {
        return day.atStartOfDay().plus(offset);
    }

    private static boolean owner(Account a) {
        return "OWNER".equals(a.role());
    }

    static String productCode(Object productId) {
        return String.format(Locale.ROOT, "SP%05d", ((Number) productId).intValue());
    }


    /** Moving weighted average state of one variant at one moment. */
    static final class Cost {
        long qty;
        BigDecimal value = BigDecimal.ZERO;
        boolean known = true;
        BigDecimal lastUnit;
        String note;

        BigDecimal unit() {
            return qty > 0 ? value.divide(BigDecimal.valueOf(qty), 4, RoundingMode.HALF_UP) : lastUnit;
        }

        Cost copy() {
            var c = new Cost();
            c.qty = qty;
            c.value = value;
            c.known = known;
            c.lastUnit = lastUnit;
            c.note = note;
            return c;
        }

        void unknown(String why) {
            if (known) note = why;
            known = false;
        }

        /** Owner-facing figures: unit cost, value and why it is missing (null value = no basis). */
        void put(Map<String, Object> row, String prefix) {
            boolean ok = known && qty >= 0;
            row.put(prefix + "unit_cost", ok && qty > 0 ? unit().setScale(0, RoundingMode.HALF_UP) : null);
            row.put(prefix + "value", ok ? value.setScale(0, RoundingMode.HALF_UP) : null);
            row.put(prefix + "cost_note", ok ? null : note);
        }
    }

    /**
     * Replays the stock ledger (stock_adjustment) of every variant in time order with the perpetual
     * moving weighted average method and returns the state just before each cut (null cut = now):
     *
     * <ul>
     *   <li>RECEIPT +q: value += q × receipt line price; the average changes;
     *   <li>ORDER_OUT −q, ADJUSTMENT −q: value −= q × current average (average unchanged);
     *   <li>SUPPLIER_RETURN −q: value −= q × price of the returned receipt line;
     *   <li>RESTOCK +q (customer return): at the cost the order line was sold at, else the current average;
     *   <li>ADJUSTMENT +q (count surplus): at the current (or last) average;
     *   <li>MOVE: no effect on quantity or value.
     * </ul>
     *
     * Stock that existed before the first recorded movement (stock − Σ ledger ≠ 0), or an inbound
     * movement without a price, has no cost basis: the variant is reported as missing until its
     * quantity returns to 0 (all goods of unknown cost have left), then it starts clean again.
     */
    private Map<Integer, Cost[]> replay(LocalDateTime... cuts) {
        var states = new HashMap<Integer, Cost>();
        for (var v :
                s.jdbc()
                        .queryForList(
                                "SELECT d.detail_id,d.stock_quantity,COALESCE(SUM(m.quantity_change),0) AS ledger FROM product_detail d"
                                        + " LEFT JOIN stock_adjustment m ON m.detail_id=d.detail_id GROUP BY d.detail_id,d.stock_quantity")) {
            var c = new Cost();
            c.qty = num(v, "stock_quantity") - ((Number) v.get("ledger")).longValue();
            if (c.qty != 0)
                c.unknown(String.format(
                        "%d sản phẩm tồn trước lịch sử kho, không có chứng từ giá", c.qty));
            states.put(num(v, "detail_id"), c);
        }
        var result = new HashMap<Integer, Cost[]>();
        var sold = new HashMap<Integer, BigDecimal>(); // order_item_id -> unit cost when sold
        int next = 0;
        var rows =
                s.jdbc()
                        .queryForList(
                                """
                SELECT m.detail_id,m.quantity_change,m.movement_type,m.adjusted_at,m.order_item_id,
                  i.unit_price AS line_price,rri.order_item_id AS returned_item
                FROM stock_adjustment m LEFT JOIN stock_receipt_item i ON i.receipt_item_id=m.receipt_item_id
                LEFT JOIN return_request_item rri ON rri.return_request_item_id=m.return_request_item_id
                WHERE m.movement_type<>'MOVE' ORDER BY m.adjusted_at,m.adjustment_id
                """);
        for (int r = 0; r <= rows.size(); r++) {
            var at = r < rows.size() ? time(rows.get(r).get("adjusted_at")) : null;
            while (next < cuts.length && (at == null || cuts[next] != null && !at.isBefore(cuts[next]))) {
                for (var e : states.entrySet())
                    result.computeIfAbsent(e.getKey(), k -> new Cost[cuts.length])[next] = e.getValue().copy();
                next++;
            }
            if (at == null) break;
            var m = rows.get(r);
            var c = states.get(num(m, "detail_id"));
            if (c == null) continue;
            int change = num(m, "quantity_change");
            String type = (String) m.get("movement_type");
            var linePrice = (BigDecimal) m.get("line_price");
            if (change > 0) {
                BigDecimal unit =
                        switch (type) {
                            case "RECEIPT" -> linePrice;
                            case "RESTOCK" -> m.get("returned_item") != null && sold.get(num(m, "returned_item")) != null
                                    ? sold.get(num(m, "returned_item"))
                                    : c.known ? c.unit() : null;
                            default -> c.known ? c.unit() : null;
                        };
                if (unit == null)
                    c.unknown("RECEIPT".equals(type)
                            ? "Có lần nhập không có đơn giá"
                            : "Có hàng nhập lại / kiểm kê thừa khi chưa có giá vốn trước đó");
                else if (c.known) c.value = c.value.add(unit.multiply(BigDecimal.valueOf(change)));
                c.qty += change;
            } else {
                int q = -change;
                if (c.known) {
                    var unit = "SUPPLIER_RETURN".equals(type) && linePrice != null ? linePrice : c.unit();
                    if (unit == null) unit = BigDecimal.ZERO;
                    if ("ORDER_OUT".equals(type) && m.get("order_item_id") != null)
                        sold.put(num(m, "order_item_id"), unit);
                    c.value = c.value.subtract(unit.multiply(BigDecimal.valueOf(q))).max(BigDecimal.ZERO);
                }
                c.qty -= q;
                if (c.qty < 0) c.unknown("Lịch sử xuất nhiều hơn số đã ghi nhận nhập");
            }
            if (c.qty > 0 && c.known) c.lastUnit = c.unit();
            if (c.qty == 0) {
                c.value = BigDecimal.ZERO;
                c.known = true; // nothing of unknown cost is left
                c.note = null;
            }
        }
        return result;
    }

    /** Location labels such as "B2" for every product_location row. */
    private Map<Integer, String> locationLabels() {
        var labels = new HashMap<Integer, String>();
        for (var row :
                s.jdbc()
                        .queryForList(
                                """
                SELECT l.product_location_id,r.rack_code,t.level_number FROM product_location l
                JOIN shelf_level t ON t.shelf_level_id=l.shelf_level_id JOIN rack r ON r.rack_id=t.rack_id
                """))
            labels.put(num(row, "product_location_id"), "" + row.get("rack_code") + row.get("level_number"));
        return labels;
    }

    /** One row per variant with every inventory figure; owner rows also carry cost/value. */
    private List<Map<String, Object>> rows(Account a, Integer onlyDetail) {
        var incoming = new HashMap<Integer, Long>();
        for (var l : orders.lineStates().values())
            if (l.remaining() > 0) incoming.merge(l.detailId, l.remaining(), Long::sum);
        var costs = owner(a) ? replay((LocalDateTime) null) : Map.<Integer, Cost[]>of();
        var places = new HashMap<Integer, List<Map<String, Object>>>();
        var labels = locationLabels();
        for (var row :
                s.jdbc()
                        .queryForList(
                                "SELECT l.product_location_id,l.detail_id,l.shelf_level_id,l.quantity FROM product_location l"
                                        + " WHERE l.quantity>0 ORDER BY l.quantity DESC,l.product_location_id")) {
            var place = new LinkedHashMap<String, Object>();
            place.put("location_id", num(row, "product_location_id"));
            place.put("shelf_level_id", num(row, "shelf_level_id"));
            place.put("label", labels.getOrDefault(num(row, "product_location_id"), "?"));
            place.put("quantity", num(row, "quantity"));
            places.computeIfAbsent(num(row, "detail_id"), k -> new ArrayList<>()).add(place);
        }
        var result = new ArrayList<Map<String, Object>>();
        var now = time(s.jdbc().queryForObject("SELECT LOCALTIMESTAMP", Object.class));
        var offset = dbOffset();
        for (var v :
                s.jdbc()
                        .queryForList(
                                """
                SELECT d.detail_id,d.product_id,d.barcode,d.color,d.size,d.price,d.stock_quantity,d.min_stock_quantity,
                  d.status,p.product_name,p.status AS product_status,p.category_id,c.category_name,
                  COALESCE(l.assigned,0) AS assigned_quantity,COALESCE(h.held,0) AS held_quantity,
                  sale.last_sale_at,fin.first_in_at,COALESCE(led.total,0) AS ledger_total
                FROM product_detail d JOIN product p ON p.product_id=d.product_id
                LEFT JOIN category c ON c.category_id=p.category_id
                LEFT JOIN (SELECT detail_id,SUM(quantity) AS assigned FROM product_location GROUP BY detail_id) l
                  ON l.detail_id=d.detail_id
                LEFT JOIN (SELECT detail_id,SUM(reserved_quantity) AS held FROM order_item WHERE reserved_quantity>0
                  GROUP BY detail_id) h ON h.detail_id=d.detail_id
                LEFT JOIN (SELECT detail_id,MAX(adjusted_at) AS last_sale_at FROM stock_adjustment
                  WHERE movement_type='ORDER_OUT' GROUP BY detail_id) sale ON sale.detail_id=d.detail_id
                LEFT JOIN (SELECT detail_id,MIN(adjusted_at) AS first_in_at FROM stock_adjustment
                  WHERE quantity_change>0 GROUP BY detail_id) fin ON fin.detail_id=d.detail_id
                LEFT JOIN (SELECT detail_id,SUM(quantity_change) AS total FROM stock_adjustment GROUP BY detail_id) led
                  ON led.detail_id=d.detail_id
                WHERE (? IS NULL OR d.detail_id=?)
                ORDER BY p.product_name,d.color,d.size,d.detail_id
                """,
                                onlyDetail,
                                onlyDetail)) {
            var row = new LinkedHashMap<String, Object>();
            int detail = num(v, "detail_id");
            int stock = num(v, "stock_quantity");
            int assigned = ((Number) v.get("assigned_quantity")).intValue();
            int held = ((Number) v.get("held_quantity")).intValue();
            Integer min = v.get("min_stock_quantity") == null ? null : num(v, "min_stock_quantity");
            row.put("detail_id", detail);
            row.put("product_id", num(v, "product_id"));
            row.put("product_code", productCode(v.get("product_id")));
            row.put("product_name", v.get("product_name"));
            row.put("product_status", v.get("product_status"));
            row.put("category_id", v.get("category_id"));
            row.put("category_name", v.get("category_name"));
            row.put("color", v.get("color"));
            row.put("size", v.get("size"));
            row.put("barcode", v.get("barcode"));
            row.put("price", v.get("price"));
            row.put("status", v.get("status"));
            row.put("stock_quantity", stock);
            row.put("assigned_quantity", assigned);
            // Không bao giờ âm: nếu vị trí ghi nhiều hơn tổng tồn thì coi như không còn hàng chưa xếp.
            row.put("unassigned_quantity", Math.max(0, stock - assigned));
            row.put("held_quantity", held);
            row.put("available_quantity", Math.max(0, stock - held));
            row.put("hold_shortage", Math.max(0, held - stock));
            row.put("incoming_quantity", incoming.getOrDefault(detail, 0L));
            row.put("min_stock_quantity", min);
            String state = stock == 0 ? "OUT" : min != null && stock - held <= min ? "LOW" : "IN";
            row.put("stock_state", state);
            row.put("locations", places.getOrDefault(detail, List.of()));
            var lastSale = time(v.get("last_sale_at"));
            var firstIn = time(v.get("first_in_at"));
            row.put("last_sale_at", lastSale == null ? null : lastSale.minus(offset));
            // Days without a sale: since the last sale, else since the first recorded inbound movement;
            // unknown (null) when the ledger has neither.
            var since = lastSale != null ? lastSale : firstIn;
            row.put("days_without_sale", since == null ? null : Duration.between(since, now).toDays());
            row.put("never_sold", lastSale == null);
            row.put("ledger_gap", stock - ((Number) v.get("ledger_total")).intValue());
            if (owner(a)) {
                var c = costs.get(detail)[0];
                c.put(row, "");
                row.put("stock_value", row.remove("value"));
                row.put("unvalued_quantity", row.get("stock_value") == null ? (long) stock : 0L);
            }
            result.add(row);
        }
        return result;
    }

    private static boolean matches(Map<String, Object> r, String key) {
        if (key.isEmpty()) return true;
        String text = WarehouseOrders.searchKey(
                r.get("product_name") + " " + r.get("color") + " " + r.get("size") + " " + r.get("product_code")
                        + " #" + r.get("detail_id") + " " + Objects.toString(r.get("barcode"), ""));
        return text.contains(key);
    }

    private static boolean inState(Map<String, Object> r, String state, int slowDays) {
        int stock = (int) r.get("stock_quantity");
        return switch (state) {
            case "in" -> stock > 0;
            case "out" -> stock == 0;
            case "low" -> "LOW".equals(r.get("stock_state"));
            case "unassigned" -> (int) r.get("unassigned_quantity") > 0;
            case "noThreshold" -> r.get("min_stock_quantity") == null;
            case "slow" -> stock > 0 && r.get("days_without_sale") != null && (long) r.get("days_without_sale") >= slowDays;
            default -> true;
        };
    }

    /**
     * Inventory list. Metrics cover every variant matching search/color/size/category/location (not
     * only the current page); the state filter then narrows the rows. all=true returns every row (Excel).
     */
    public Map<String, Object> list(
            Account a,
            String q,
            String color,
            String size,
            Integer categoryId,
            Integer shelfId,
            String state,
            Integer slowDays,
            String sort,
            int page,
            int pageSize,
            boolean all) {
        policy.view(a);
        if (state != null && !state.isBlank() && !STATES.contains(state))
            throw new ApiException(400, "INVENTORY_FILTER", "Bộ lọc trạng thái tồn không hợp lệ.");
        int days = slowDays == null ? 30 : slowDays;
        if (days < 1 || days > 3650)
            throw new ApiException(400, "INVENTORY_FILTER", "Số ngày không bán phải từ 1 đến 3650.");
        String key = WarehouseOrders.searchKey(q);
        var everything = s.migrated(() -> rows(a, null));
        var base = new ArrayList<Map<String, Object>>();
        for (var r : everything) {
            if (!matches(r, key)) continue;
            if (color != null && !color.isBlank() && !color.equals(r.get("color"))) continue;
            if (size != null && !size.isBlank() && !size.equals(r.get("size"))) continue;
            if (categoryId != null && !Objects.equals(categoryId, r.get("category_id") == null ? null : num(r, "category_id")))
                continue;
            if (shelfId != null) {
                @SuppressWarnings("unchecked")
                var places = (List<Map<String, Object>>) r.get("locations");
                if (places.stream().noneMatch(p -> Objects.equals(p.get("shelf_level_id"), shelfId))) continue;
            }
            base.add(r);
        }
        var metrics = new LinkedHashMap<String, Object>();
        metrics.put("variants", base.size());
        metrics.put("stock", base.stream().mapToLong(r -> (int) r.get("stock_quantity")).sum());
        metrics.put("assigned", base.stream().mapToLong(r -> (int) r.get("assigned_quantity")).sum());
        metrics.put("unassigned", base.stream().mapToLong(r -> (int) r.get("unassigned_quantity")).sum());
        metrics.put("held", base.stream().mapToLong(r -> (int) r.get("held_quantity")).sum());
        metrics.put("available", base.stream().mapToLong(r -> (int) r.get("available_quantity")).sum());
        metrics.put("incoming", base.stream().mapToLong(r -> (long) r.get("incoming_quantity")).sum());
        for (var st : List.of("in", "out", "low", "unassigned", "noThreshold"))
            metrics.put("count_" + st, base.stream().filter(r -> inState(r, st, days)).count());
        metrics.put("count_slow", base.stream().filter(r -> inState(r, "slow", days)).count());
        metrics.put(
                "slow_unknown",
                base.stream().filter(r -> (int) r.get("stock_quantity") > 0 && r.get("days_without_sale") == null).count());
        metrics.put("hold_shortage", base.stream().filter(r -> (int) r.get("hold_shortage") > 0).count());
        metrics.put("ledger_gaps", base.stream().filter(r -> (int) r.get("ledger_gap") != 0).count());
        metrics.put(
                "missing_barcode",
                base.stream().filter(r -> r.get("barcode") == null || r.get("barcode").toString().isBlank()).count());
        if (owner(a)) {
            metrics.put(
                    "stock_value",
                    base.stream()
                            .map(r -> (BigDecimal) r.get("stock_value"))
                            .filter(Objects::nonNull)
                            .reduce(BigDecimal.ZERO, BigDecimal::add));
            metrics.put("unvalued_quantity", base.stream().mapToLong(r -> (long) r.get("unvalued_quantity")).sum());
            metrics.put(
                    "unvalued_variants",
                    base.stream().filter(r -> (long) r.get("unvalued_quantity") > 0).count());
        }
        var rows = new ArrayList<Map<String, Object>>();
        for (var r : base) if (state == null || state.isBlank() || inState(r, state, days)) rows.add(r);
        Comparator<Map<String, Object>> byName = Comparator.comparing((Map<String, Object> r) ->
                        WarehouseOrders.searchKey(r.get("product_name")))
                .thenComparing(r -> WarehouseOrders.searchKey(r.get("color")))
                .thenComparing(r -> WarehouseOrders.searchKey(r.get("size")))
                .thenComparing(r -> (int) r.get("detail_id"));
        Comparator<Map<String, Object>> byStock = Comparator.comparing(r -> (int) r.get("stock_quantity"));
        rows.sort(switch (sort == null ? "" : sort) {
            case "name_desc" -> byName.reversed();
            case "stock_asc" -> byStock.thenComparing(byName);
            case "stock_desc" -> byStock.reversed().thenComparing(byName);
            default -> byName;
        });
        int size2 = all ? Math.max(1, rows.size()) : Math.max(1, Math.min(pageSize, 100));
        int pageNo = all ? 0 : Math.max(0, page);
        int from = Math.min(rows.size(), pageNo * size2);
        var result = new LinkedHashMap<String, Object>();
        result.put("items", rows.subList(from, Math.min(rows.size(), from + size2)));
        result.put("total", rows.size());
        result.put("page", pageNo);
        result.put("size", size2);
        result.put("metrics", metrics);
        result.put("slow_days", days);
        result.put(
                "colors",
                everything.stream().map(r -> (String) r.get("color")).distinct().sorted().toList());
        result.put("sizes", everything.stream().map(r -> (String) r.get("size")).distinct().sorted().toList());
        result.put(
                "categories",
                s.jdbc().queryForList("SELECT category_id,category_name FROM category ORDER BY category_name"));
        return result;
    }

    /** Variant detail: figures, locations, orders holding stock, open purchase orders, cost. */
    public Map<String, Object> detail(Account a, int detail) {
        policy.view(a);
        var found = s.migrated(() -> rows(a, detail));
        if (found.isEmpty()) throw new ApiException(404, "NOT_FOUND", "Không tìm thấy biến thể.");
        var result = new LinkedHashMap<String, Object>(found.get(0));
        var labels = locationLabels();
        var offset = dbOffset();
        var places = new ArrayList<Map<String, Object>>();
        for (var row :
                s.jdbc()
                        .queryForList(
                                "SELECT product_location_id,shelf_level_id,quantity,description,updated_at FROM product_location"
                                        + " WHERE detail_id=? ORDER BY quantity DESC,product_location_id",
                                detail)) {
            var place = copy(row);
            place.put("label", labels.get(num(row, "product_location_id")));
            storeTime(place, offset, "updated_at");
            places.add(place);
        }
        result.put("location_rows", places);
        result.put(
                "holds",
                stored(offset, s.jdbc()
                        .queryForList(
                                """
                SELECT o.order_id,o.order_number,o.order_type,o.order_status,o.order_date,o.stock_hold_created_at,
                  i.order_item_id,i.quantity,i.reserved_quantity
                FROM order_item i JOIN orders o ON o.order_id=i.order_id
                WHERE i.detail_id=? AND i.reserved_quantity>0 ORDER BY o.order_date
                """,
                                detail), "order_date", "stock_hold_created_at"));
        // Online orders placed before holds existed: waiting for the owner but holding nothing.
        result.put(
                "unheld_pending",
                stored(offset, s.jdbc()
                        .queryForList(
                                """
                SELECT o.order_id,o.order_number,o.order_status,o.order_date,i.quantity
                FROM order_item i JOIN orders o ON o.order_id=i.order_id
                WHERE i.detail_id=? AND i.reserved_quantity=0 AND o.order_type='Online'
                  AND o.order_status='PENDING_CONFIRMATION' AND o.stock_deducted_at IS NULL ORDER BY o.order_date
                """,
                                detail), "order_date"));
        var incoming = new ArrayList<Map<String, Object>>();
        for (var l : orders.lineStates().values()) {
            if (l.detailId != detail || l.remaining() <= 0) continue;
            var row = new LinkedHashMap<String, Object>();
            row.put("order_id", l.orderId);
            row.put("order_code", WarehouseOrders.code(l.orderId));
            row.put("supplier", l.supplier);
            row.put("order_date", l.orderDate == null ? null : time(l.orderDate).minus(offset));
            row.put("ordered", l.ordered);
            row.put("received", l.received());
            row.put("remaining", l.remaining());
            incoming.add(row);
        }
        result.put("incoming", incoming);
        return result;
    }

    static List<Map<String, Object>> stored(Duration offset, List<Map<String, Object>> rows, String... fields) {
        var out = new ArrayList<Map<String, Object>>();
        for (var r : rows) {
            var c = copy(r);
            storeTime(c, offset, fields);
            out.add(c);
        }
        return out;
    }

    /** Owner sets (or clears with null) the minimum stock of a variant. 0 is a real threshold. */
    @Transactional
    public Map<String, Object> threshold(Account a, int detail, Integer min) {
        policy.owner(a);
        if (min != null && (min < 0 || min > 1_000_000))
            throw new ApiException(400, "THRESHOLD", "Ngưỡng tối thiểu phải từ 0 đến 1.000.000.");
        var old = s.migrated(() -> s.one("SELECT min_stock_quantity FROM product_detail WHERE detail_id=? FOR UPDATE", detail));
        s.jdbc().update("UPDATE product_detail SET min_stock_quantity=? WHERE detail_id=?", min, detail);
        s.audit(a.id(), "INVENTORY_THRESHOLD", detail, old.get("min_stock_quantity") + " -> " + min);
        return Map.of("detail_id", detail, "min_stock_quantity", min == null ? "" : min);
    }

    /** Where a ledger row came from, for "open the source document". */
    private static void source(Map<String, Object> m) {
        String key = Objects.toString(m.get("idempotency_key"), "");
        if (m.get("receipt_id") != null) {
            String type = (String) m.get("receipt_type");
            int id = num(m, "receipt_id");
            m.put("doc_kind", type);
            m.put("doc_id", id);
            m.put(
                    "doc_code",
                    String.format(
                            Locale.ROOT,
                            "%s%05d",
                            "PURCHASE_ORDER".equals(type) ? "PD" : "RECEIPT".equals(type) ? "PN" : "PT",
                            id));
        } else if (m.get("order_id") != null) {
            m.put("doc_kind", "Online".equals(m.get("order_type")) ? "ONLINE_ORDER" : "IN_STORE_ORDER");
            m.put("doc_id", num(m, "order_id"));
            m.put("doc_code", m.get("order_number"));
        } else if (m.get("return_request_id") != null) {
            m.put("doc_kind", "CUSTOMER_RETURN");
            m.put("doc_id", num(m, "return_request_id"));
            m.put("doc_code", "Yêu cầu trả #" + m.get("return_request_id"));
        } else if (key.startsWith("count:")) {
            int id = Integer.parseInt(key.split(":")[1]);
            m.put("doc_kind", "STOCK_COUNT");
            m.put("doc_id", id);
            m.put("doc_code", WarehouseCounts.code(id));
        }
    }

    /**
     * Stock card of a variant. kind=stock lists rows that change total stock with the balance after
     * each one (walked back from the current stock); kind=move lists location moves (total unchanged).
     */
    public Map<String, Object> history(
            Account a, int detail, String kind, String type, LocalDate from, LocalDate to, int page, int pageSize) {
        policy.view(a);
        var variant = s.one("SELECT stock_quantity FROM product_detail WHERE detail_id=?", detail);
        boolean moves = "move".equals(kind);
        var labels = locationLabels();
        var offset = dbOffset();
        var all =
                s.jdbc()
                        .queryForList(
                                """
                SELECT m.adjustment_id,m.detail_id,m.quantity_change,m.reason,m.adjusted_at,m.movement_type,
                  m.movement_quantity,m.source_location_id,m.destination_location_id,m.idempotency_key,
                  u.full_name AS actor_name,r.receipt_id,r.receipt_type,o.order_id,o.order_number,o.order_type,
                  rri.return_request_id
                FROM stock_adjustment m JOIN `user` u ON u.user_id=m.adjusted_by
                LEFT JOIN stock_receipt_item i ON i.receipt_item_id=m.receipt_item_id
                LEFT JOIN stock_receipt r ON r.receipt_id=i.receipt_id
                LEFT JOIN order_item oi ON oi.order_item_id=m.order_item_id
                LEFT JOIN orders o ON o.order_id=oi.order_id
                LEFT JOIN return_request_item rri ON rri.return_request_item_id=m.return_request_item_id
                WHERE m.detail_id=? ORDER BY m.adjusted_at DESC,m.adjustment_id DESC
                """,
                                detail);
        int balance = num(variant, "stock_quantity");
        var rows = new ArrayList<Map<String, Object>>();
        for (var raw : all) {
            var m = copy(raw);
            int change = num(m, "quantity_change");
            m.put("balance_after", balance);
            balance -= change;
            m.put("source_label", m.get("source_location_id") == null ? null : labels.get(num(m, "source_location_id")));
            m.put(
                    "destination_label",
                    m.get("destination_location_id") == null ? null : labels.get(num(m, "destination_location_id")));
            source(m);
            boolean isMove = "MOVE".equals(m.get("movement_type"));
            if (moves != isMove) continue;
            if (type != null && !type.isBlank() && !type.equals(m.get("movement_type"))) continue;
            var at = time(m.get("adjusted_at"));
            if (from != null && at.isBefore(startOf(from, offset))) continue;
            if (to != null && !at.isBefore(startOf(to.plusDays(1), offset))) continue;
            storeTime(m, offset, "adjusted_at");
            rows.add(m);
        }
        int size = Math.max(1, Math.min(pageSize, 100));
        int pageNo = Math.max(0, page);
        int start = Math.min(rows.size(), pageNo * size);
        var result = new LinkedHashMap<String, Object>();
        result.put("items", rows.subList(start, Math.min(rows.size(), start + size)));
        result.put("total", rows.size());
        result.put("page", pageNo);
        result.put("size", size);
        // Balance before the oldest recorded row; ≠ 0 means older stock changes were never recorded.
        result.put("ledger_gap", balance);
        return result;
    }

    /**
     * Period movement report (nhập–xuất–tồn) from the ledger: opening = stock now − changes since
     * from; closing = stock now − changes after to; closing = opening + increase − decrease. Moves
     * change no total. Owner rows carry the closing value at the weighted average cost of receipts
     * confirmed up to the end of the period.
     */
    public Map<String, Object> report(
            Account a, LocalDate from, LocalDate to, String q, Integer categoryId, boolean onlyMoving) {
        policy.view(a);
        if (from == null || to == null || from.isAfter(to))
            throw new ApiException(400, "REPORT_PERIOD", "Chọn kỳ báo cáo hợp lệ (từ ngày ≤ đến ngày).");
        if (to.isAfter(LocalDate.now(STORE_ZONE)))
            throw new ApiException(400, "REPORT_PERIOD", "Kỳ báo cáo không được sau hôm nay.");
        var offset = dbOffset();
        var start = startOf(from, offset);
        var end = startOf(to.plusDays(1), offset);
        boolean showCost = owner(a);
        var flows = new HashMap<Integer, Map<String, Long>>();
        for (var row :
                s.jdbc()
                        .queryForList(
                                """
                SELECT detail_id,movement_type,
                  SUM(CASE WHEN adjusted_at>=? THEN quantity_change ELSE 0 END) AS since_start,
                  SUM(CASE WHEN adjusted_at>=? THEN quantity_change ELSE 0 END) AS since_end,
                  SUM(CASE WHEN adjusted_at>=? AND adjusted_at<? AND quantity_change>0 THEN quantity_change ELSE 0 END) AS qty_in,
                  SUM(CASE WHEN adjusted_at>=? AND adjusted_at<? AND quantity_change<0 THEN -quantity_change ELSE 0 END) AS qty_out,
                  SUM(quantity_change) AS total
                FROM stock_adjustment GROUP BY detail_id,movement_type
                """,
                                start,
                                end,
                                start,
                                end,
                                start,
                                end)) {
            var f = flows.computeIfAbsent(num(row, "detail_id"), k -> new HashMap<>());
            String t = (String) row.get("movement_type");
            f.merge("since_start", ((Number) row.get("since_start")).longValue(), Long::sum);
            f.merge("since_end", ((Number) row.get("since_end")).longValue(), Long::sum);
            f.merge("total", ((Number) row.get("total")).longValue(), Long::sum);
            f.merge("in_" + t, ((Number) row.get("qty_in")).longValue(), Long::sum);
            f.merge("out_" + t, ((Number) row.get("qty_out")).longValue(), Long::sum);
        }
        var costs = showCost ? replay(start, end) : Map.<Integer, Cost[]>of();
        String key = WarehouseOrders.searchKey(q);
        var items = new ArrayList<Map<String, Object>>();
        var totals = new LinkedHashMap<String, Object>();
        String[] inTypes = {"RECEIPT", "RESTOCK", "ADJUSTMENT"};
        String[] outTypes = {"ORDER_OUT", "SUPPLIER_RETURN", "ADJUSTMENT"};
        BigDecimal value = BigDecimal.ZERO, openingValue = BigDecimal.ZERO;
        long unvalued = 0;
        int missingRows = 0;
        int gaps = 0;
        for (var v :
                s.jdbc()
                        .queryForList(
                                """
                SELECT d.detail_id,d.product_id,d.barcode,d.color,d.size,d.stock_quantity,p.product_name,p.category_id,c.category_name
                FROM product_detail d JOIN product p ON p.product_id=d.product_id
                LEFT JOIN category c ON c.category_id=p.category_id ORDER BY p.product_name,d.color,d.size,d.detail_id
                """)) {
            var row = new LinkedHashMap<String, Object>();
            int detail = num(v, "detail_id");
            row.put("detail_id", detail);
            row.put("product_code", productCode(v.get("product_id")));
            row.put("product_name", v.get("product_name"));
            row.put("category_name", v.get("category_name"));
            row.put("color", v.get("color"));
            row.put("size", v.get("size"));
            row.put("barcode", v.get("barcode"));
            if (!matches(row, key)) continue;
            if (categoryId != null && !Objects.equals(categoryId, v.get("category_id") == null ? null : num(v, "category_id")))
                continue;
            var f = flows.getOrDefault(detail, Map.of());
            long now = num(v, "stock_quantity");
            long opening = now - f.getOrDefault("since_start", 0L);
            long closing = now - f.getOrDefault("since_end", 0L);
            long plus = 0, minus = 0;
            for (var t : inTypes) {
                long x = f.getOrDefault("in_" + t, 0L);
                row.put("in_" + t, x);
                plus += x;
            }
            for (var t : outTypes) {
                long x = f.getOrDefault("out_" + t, 0L);
                row.put("out_" + t, x);
                minus += x;
            }
            if (onlyMoving && plus == 0 && minus == 0 && opening == 0 && closing == 0) continue;
            row.put("opening", opening);
            row.put("increase", plus);
            row.put("decrease", minus);
            row.put("closing", closing);
            long gap = now - f.getOrDefault("total", 0L);
            row.put("ledger_gap", gap);
            if (gap != 0) gaps++;
            if (showCost) {
                var c = costs.get(detail);
                c[0].put(row, "opening_");
                row.remove("opening_unit_cost");
                row.put("opening_value", row.remove("opening_value"));
                row.remove("opening_cost_note");
                c[1].put(row, "");
                row.put("closing_value", row.remove("value"));
                if (row.get("opening_value") == null || row.get("closing_value") == null) missingRows++;
                if (row.get("closing_value") == null) unvalued += closing;
                else value = value.add((BigDecimal) row.get("closing_value"));
                if (row.get("opening_value") != null) openingValue = openingValue.add((BigDecimal) row.get("opening_value"));
            }
            for (var k : List.of("opening", "increase", "decrease", "closing"))
                totals.merge(k, row.get(k), (x, y) -> ((Number) x).longValue() + ((Number) y).longValue());
            items.add(row);
        }
        for (var k : List.of("opening", "increase", "decrease", "closing")) totals.putIfAbsent(k, 0L);
        if (showCost) {
            totals.put("closing_value", value);
            totals.put("opening_value", openingValue);
            totals.put("unvalued_quantity", unvalued);
            totals.put("cost_missing_variants", missingRows);
        }
        totals.put("ledger_gaps", gaps);
        var result = new LinkedHashMap<String, Object>();
        result.put("from", from.toString());
        result.put("to", to.toString());
        result.put("items", items);
        result.put("totals", totals);
        result.put("cost_visible", showCost);
        return result;
    }
}
