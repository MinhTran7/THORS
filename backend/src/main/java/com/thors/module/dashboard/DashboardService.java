package com.thors.module.dashboard;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Số liệu bảng điều khiển, tính trực tiếp từ dữ liệu đơn hàng và kho (không lưu bảng tổng hợp riêng).
 *
 * <ul>
 *   <li><b>Kênh bán</b>: Tại quầy = order_type 'In-Store'; Website = đơn Online do chính khách hàng
 *       (role CUSTOMER) tạo; Facebook = đơn Online do nhân viên tạo từ màn hình Social POS.
 *   <li><b>Doanh thu</b>: tổng total_amount của đơn đã thu tiền (payment_status PAID / REFUND_PENDING /
 *       PARTIALLY_REFUNDED / REFUNDED; COD được chuyển PAID khi giao thành công) trừ số tiền đã hoàn
 *       (payment.refunded_amount). Lọc theo ngày đặt đơn.
 *   <li><b>Tồn kho</b>: cùng công thức với màn hình Tồn kho ({@code WarehouseInventory}): theo từng biến
 *       thể, có thể bán = tồn − đang giữ cho đơn; Hết hàng khi tồn = 0; Sắp hết khi có ngưỡng tối thiểu
 *       và có thể bán ≤ ngưỡng. Chỉ tính sản phẩm và biến thể đang hoạt động.
 * </ul>
 *
 * <p>Owner xem toàn cửa hàng. Family Member chỉ xem doanh số của đơn do chính mình tạo (bán tại quầy,
 * Facebook) cùng cảnh báo kho; không xem đơn chờ xử lý, thành viên.
 */
@Service
@Transactional(readOnly = true)
public class DashboardService {

    static final int MAX_RANGE_DAYS = 366;
    private static final int TOP_PRODUCTS = 5;
    private static final int STOCK_ALERTS = 6;

    private static final String CHANNEL_SQL =
            "CASE WHEN o.order_type = 'In-Store' THEN 'IN_STORE'"
                    + " WHEN cr.role_name = 'CUSTOMER' THEN 'WEB' ELSE 'FACEBOOK' END";

    private static final String PAID_SQL =
            "o.payment_status IN ('PAID','REFUND_PENDING','PARTIALLY_REFUNDED','REFUNDED')";

    private static final String REFUNDS_JOIN =
            " LEFT JOIN (SELECT order_id, SUM(refunded_amount) AS refunded FROM payment GROUP BY order_id) rf"
                    + " ON rf.order_id = o.order_id";

    private static final List<String> CHANNELS = List.of("IN_STORE", "WEB", "FACEBOOK");

    private final JdbcTemplate jdbc;

    public DashboardService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Map<String, Object> summary(Account actor, LocalDate from, LocalDate to) {
        boolean owner = "OWNER".equals(actor.role());
        if (!owner && !"FAMILY_MEMBER".equals(actor.role())) {
            throw new ApiException(403, "FORBIDDEN", "Bạn không có quyền xem bảng điều khiển.");
        }

        LocalDate today = LocalDate.now();
        LocalDate end = to != null ? to : today;
        LocalDate start = from != null ? from : end.minusDays(6);
        if (start.isAfter(end)) {
            throw new ApiException(400, "DATE_RANGE", "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
        }
        if (ChronoUnit.DAYS.between(start, end) + 1 > MAX_RANGE_DAYS) {
            throw new ApiException(400, "DATE_RANGE", "Chỉ xem được tối đa " + MAX_RANGE_DAYS + " ngày mỗi lần.");
        }

        // Owner: cả cửa hàng; Family Member: chỉ đơn do mình tạo
        Integer onlyCreator = owner ? null : actor.id();
        LocalDateTime fromTime = start.atStartOfDay();
        LocalDateTime toTime = end.plusDays(1).atStartOfDay();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("scope", owner ? "SHOP" : "MINE");
        result.put("from", start.toString());
        result.put("to", end.toString());
        result.put("generatedAt", LocalDateTime.now().toString());
        result.put("sales", sales(fromTime, toTime, onlyCreator));
        result.put("daily", daily(start, end, fromTime, toTime, onlyCreator));
        result.put("topProducts", topProducts(fromTime, toTime, onlyCreator));
        result.put("stock", stock());
        if (owner) {
            result.put("pending", pending());
            result.put("shop", shop());
        }
        return result;
    }

    // ------------------------------------------------------------------
    // Doanh thu & số đơn theo kênh
    // ------------------------------------------------------------------

    private Map<String, Object> sales(LocalDateTime from, LocalDateTime to, Integer onlyCreator) {
        List<Object> args = new ArrayList<>(List.of(from, to));
        String sql =
                "SELECT " + CHANNEL_SQL + " AS channel,"
                        + " COUNT(*) AS created,"
                        + " SUM(CASE WHEN o.order_status IN ('CANCELLED','REJECTED','EXPIRED') THEN 1 ELSE 0 END) AS cancelled,"
                        + " SUM(CASE WHEN " + PAID_SQL + " THEN 1 ELSE 0 END) AS paid_orders,"
                        + " COALESCE(SUM(CASE WHEN " + PAID_SQL + " THEN o.total_amount ELSE 0 END), 0) AS gross,"
                        + " COALESCE(SUM(CASE WHEN " + PAID_SQL + " THEN COALESCE(rf.refunded, 0) ELSE 0 END), 0) AS refunded"
                        + " FROM orders o"
                        + " JOIN `user` cu ON cu.user_id = o.created_by"
                        + " JOIN role cr ON cr.role_id = cu.role_id"
                        + REFUNDS_JOIN
                        + " WHERE o.order_date >= ? AND o.order_date < ?"
                        + creatorFilter(onlyCreator, args)
                        + " GROUP BY channel";

        Map<String, Map<String, Object>> byChannel = new LinkedHashMap<>();
        for (String channel : CHANNELS) {
            byChannel.put(channel, channelRow(0, 0, 0, BigDecimal.ZERO, BigDecimal.ZERO));
        }

        long created = 0, cancelled = 0, paidOrders = 0;
        BigDecimal gross = BigDecimal.ZERO, refunded = BigDecimal.ZERO;

        for (Map<String, Object> row : jdbc.queryForList(sql, args.toArray())) {
            long c = num(row.get("created"));
            long x = num(row.get("cancelled"));
            long p = num(row.get("paid_orders"));
            BigDecimal g = money(row.get("gross"));
            BigDecimal r = money(row.get("refunded"));
            byChannel.put(String.valueOf(row.get("channel")), channelRow(c, x, p, g, r));
            created += c;
            cancelled += x;
            paidOrders += p;
            gross = gross.add(g);
            refunded = refunded.add(r);
        }

        Map<String, Object> sales = new LinkedHashMap<>();
        sales.put("netRevenue", gross.subtract(refunded));
        sales.put("grossRevenue", gross);
        sales.put("refunded", refunded);
        sales.put("ordersCreated", created);
        sales.put("ordersCancelled", cancelled);
        sales.put("paidOrders", paidOrders);
        sales.put("averageOrderValue", paidOrders == 0
                ? BigDecimal.ZERO
                : gross.divide(BigDecimal.valueOf(paidOrders), 0, java.math.RoundingMode.HALF_UP));
        sales.put("byChannel", byChannel);
        return sales;
    }

    private static Map<String, Object> channelRow(
            long created, long cancelled, long paid, BigDecimal gross, BigDecimal refunded) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("ordersCreated", created);
        row.put("ordersCancelled", cancelled);
        row.put("paidOrders", paid);
        row.put("netRevenue", gross.subtract(refunded));
        return row;
    }

    // ------------------------------------------------------------------
    // Doanh thu thuần theo ngày (đủ mọi ngày trong khoảng, ngày không bán = 0)
    // ------------------------------------------------------------------

    private List<Map<String, Object>> daily(
            LocalDate start, LocalDate end, LocalDateTime from, LocalDateTime to, Integer onlyCreator) {
        List<Object> args = new ArrayList<>(List.of(from, to));
        String sql =
                "SELECT CAST(o.order_date AS DATE) AS sale_day, " + CHANNEL_SQL + " AS channel,"
                        + " COALESCE(SUM(o.total_amount - COALESCE(rf.refunded, 0)), 0) AS net"
                        + " FROM orders o"
                        + " JOIN `user` cu ON cu.user_id = o.created_by"
                        + " JOIN role cr ON cr.role_id = cu.role_id"
                        + REFUNDS_JOIN
                        + " WHERE " + PAID_SQL
                        + " AND o.order_date >= ? AND o.order_date < ?"
                        + creatorFilter(onlyCreator, args)
                        + " GROUP BY CAST(o.order_date AS DATE), channel";

        Map<LocalDate, Map<String, Object>> days = new LinkedHashMap<>();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("date", d.toString());
            for (String channel : CHANNELS) {
                row.put(channel, BigDecimal.ZERO);
            }
            row.put("total", BigDecimal.ZERO);
            days.put(d, row);
        }

        for (Map<String, Object> r : jdbc.queryForList(sql, args.toArray())) {
            LocalDate day = toDate(r.get("sale_day"));
            Map<String, Object> row = days.get(day);
            if (row == null) {
                continue;
            }
            BigDecimal net = money(r.get("net"));
            row.put(String.valueOf(r.get("channel")), net);
            row.put("total", ((BigDecimal) row.get("total")).add(net));
        }
        return new ArrayList<>(days.values());
    }

    // ------------------------------------------------------------------
    // Sản phẩm bán chạy (theo số lượng trên đơn đã thu tiền)
    // ------------------------------------------------------------------

    private List<Map<String, Object>> topProducts(LocalDateTime from, LocalDateTime to, Integer onlyCreator) {
        List<Object> args = new ArrayList<>(List.of(from, to));
        String sql =
                "SELECT pd.product_id AS productId, p.product_name AS productName,"
                        + " SUM(oi.quantity) AS quantity,"
                        + " SUM(oi.quantity * oi.unit_price) AS itemsAmount"
                        + " FROM order_item oi"
                        + " JOIN orders o ON o.order_id = oi.order_id"
                        + " JOIN product_detail pd ON pd.detail_id = oi.detail_id"
                        + " JOIN product p ON p.product_id = pd.product_id"
                        + " WHERE " + PAID_SQL
                        + " AND o.order_date >= ? AND o.order_date < ?"
                        + creatorFilter(onlyCreator, args)
                        + " GROUP BY pd.product_id, p.product_name"
                        + " ORDER BY quantity DESC, itemsAmount DESC"
                        + " LIMIT " + TOP_PRODUCTS;
        return canonical(jdbc.queryForList(sql, args.toArray()), TOP_PRODUCT_KEYS);
    }

    // Khóa JSON cố định (H2 trả nhãn cột chữ thường, MySQL giữ nguyên chữ hoa/thường của alias)
    private static final List<String> TOP_PRODUCT_KEYS =
            List.of("productId", "productName", "quantity", "itemsAmount");
    private static final List<String> ALERT_KEYS =
            List.of("detailId", "productName", "size", "color", "stockQuantity", "sellable", "minStock", "state");

    private static List<Map<String, Object>> canonical(List<Map<String, Object>> rows, List<String> keys) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> clean = new LinkedHashMap<>();
            for (String key : keys) {
                // ColumnMapRowMapper trả map không phân biệt hoa/thường nên get theo tên chuẩn là đủ
                clean.put(key, row.get(key));
            }
            result.add(clean);
        }
        return result;
    }

    // ------------------------------------------------------------------
    // Cảnh báo kho — cùng công thức WarehouseInventory
    // ------------------------------------------------------------------

    private static final String HELD_JOIN =
            " LEFT JOIN (SELECT detail_id, SUM(reserved_quantity) AS held FROM order_item"
                    + " WHERE reserved_quantity > 0 GROUP BY detail_id) h ON h.detail_id = d.detail_id";

    private static final String ACTIVE_VARIANTS =
            " FROM product_detail d JOIN product p ON p.product_id = d.product_id"
                    + HELD_JOIN
                    + " WHERE p.status = 'ACTIVE' AND d.status = 'ACTIVE'";

    private Map<String, Object> stock() {
        Map<String, Object> stock = new LinkedHashMap<>();
        try {
            Map<String, Object> row = jdbc.queryForMap(
                    "SELECT COUNT(*) AS variants,"
                            + " SUM(CASE WHEN d.stock_quantity = 0 THEN 1 ELSE 0 END) AS out_count,"
                            + " SUM(CASE WHEN d.stock_quantity > 0 AND d.min_stock_quantity IS NOT NULL"
                            + "   AND d.stock_quantity - COALESCE(h.held, 0) <= d.min_stock_quantity THEN 1 ELSE 0 END) AS low_count,"
                            + " SUM(CASE WHEN d.min_stock_quantity IS NULL THEN 1 ELSE 0 END) AS no_threshold,"
                            + " COALESCE(SUM(GREATEST(d.stock_quantity - COALESCE(h.held, 0), 0)), 0) AS sellable"
                            + ACTIVE_VARIANTS);
            stock.put("thresholdSupported", true);
            stock.put("variants", num(row.get("variants")));
            stock.put("outOfStock", num(row.get("out_count")));
            stock.put("lowStock", num(row.get("low_count")));
            stock.put("noThreshold", num(row.get("no_threshold")));
            stock.put("sellableUnits", num(row.get("sellable")));
            stock.put("alerts", canonical(jdbc.queryForList(
                    "SELECT d.detail_id AS detailId, p.product_name AS productName, d.size, d.color,"
                            + " d.stock_quantity AS stockQuantity,"
                            + " GREATEST(d.stock_quantity - COALESCE(h.held, 0), 0) AS sellable,"
                            + " d.min_stock_quantity AS minStock,"
                            + " CASE WHEN d.stock_quantity = 0 THEN 'OUT' ELSE 'LOW' END AS state"
                            + ACTIVE_VARIANTS
                            + " AND (d.stock_quantity = 0 OR (d.min_stock_quantity IS NOT NULL"
                            + "   AND d.stock_quantity - COALESCE(h.held, 0) <= d.min_stock_quantity))"
                            + " ORDER BY (d.stock_quantity = 0) DESC, sellable ASC, p.product_name"
                            + " LIMIT " + STOCK_ALERTS), ALERT_KEYS));
        } catch (BadSqlGrammarException e) {
            // Database chưa chạy migration 2026-11-06_inventory.sql (chưa có cột min_stock_quantity):
            // vẫn báo hết hàng, không báo "sắp hết" vì chưa có ngưỡng.
            Map<String, Object> row = jdbc.queryForMap(
                    "SELECT COUNT(*) AS variants,"
                            + " SUM(CASE WHEN d.stock_quantity = 0 THEN 1 ELSE 0 END) AS out_count,"
                            + " COALESCE(SUM(GREATEST(d.stock_quantity - COALESCE(h.held, 0), 0)), 0) AS sellable"
                            + ACTIVE_VARIANTS);
            stock.put("thresholdSupported", false);
            stock.put("variants", num(row.get("variants")));
            stock.put("outOfStock", num(row.get("out_count")));
            stock.put("lowStock", null);
            stock.put("noThreshold", null);
            stock.put("sellableUnits", num(row.get("sellable")));
            stock.put("alerts", canonical(jdbc.queryForList(
                    "SELECT d.detail_id AS detailId, p.product_name AS productName, d.size, d.color,"
                            + " d.stock_quantity AS stockQuantity, 0 AS sellable, NULL AS minStock, 'OUT' AS state"
                            + ACTIVE_VARIANTS
                            + " AND d.stock_quantity = 0 ORDER BY p.product_name LIMIT " + STOCK_ALERTS), ALERT_KEYS));
        }
        return stock;
    }

    // ------------------------------------------------------------------
    // Đơn online đang chờ Owner xử lý (không phụ thuộc khoảng ngày)
    // ------------------------------------------------------------------

    private Map<String, Object> pending() {
        Map<String, Object> row = jdbc.queryForMap(
                "SELECT"
                        + " SUM(CASE WHEN order_status = 'PENDING_CONFIRMATION' THEN 1 ELSE 0 END) AS confirm_count,"
                        + " SUM(CASE WHEN order_status = 'AWAITING_PICKUP' THEN 1 ELSE 0 END) AS pickup_count,"
                        + " SUM(CASE WHEN order_status = 'AWAITING_PAYMENT' THEN 1 ELSE 0 END) AS payment_count"
                        + " FROM orders WHERE order_type = 'Online'");
        Map<String, Object> pending = new LinkedHashMap<>();
        pending.put("pendingConfirmation", num(row.get("confirm_count")));
        pending.put("awaitingPickup", num(row.get("pickup_count")));
        pending.put("awaitingPayment", num(row.get("payment_count")));
        return pending;
    }

    // ------------------------------------------------------------------
    // Thông tin cửa hàng (đếm thật, không phải chữ cố định)
    // ------------------------------------------------------------------

    private Map<String, Object> shop() {
        Map<String, Object> shop = new LinkedHashMap<>();
        shop.put("activeProducts", count("SELECT COUNT(*) FROM product WHERE status = 'ACTIVE'"));
        shop.put("activeCategories", count("SELECT COUNT(*) FROM category WHERE status = 'ACTIVE'"));
        shop.put("onlineVariants", count(
                "SELECT COUNT(*) FROM product_detail d JOIN product p ON p.product_id = d.product_id"
                        + " WHERE p.status = 'ACTIVE' AND d.status = 'ACTIVE' AND d.online_sales_enabled = 1"));
        shop.put("activeMembers", count(
                "SELECT COUNT(*) FROM `user` u JOIN role r ON r.role_id = u.role_id"
                        + " WHERE r.role_name IN ('FAMILY_MEMBER','STAFF') AND u.account_status = 'ACTIVE'"));
        return shop;
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private static String creatorFilter(Integer onlyCreator, List<Object> args) {
        if (onlyCreator == null) {
            return "";
        }
        args.add(onlyCreator);
        return " AND o.created_by = ?";
    }

    private long count(String sql) {
        Long value = jdbc.queryForObject(sql, Long.class);
        return value != null ? value : 0;
    }

    private static long num(Object value) {
        return value instanceof Number n ? n.longValue() : 0;
    }

    private static BigDecimal money(Object value) {
        if (value instanceof BigDecimal b) {
            return b;
        }
        if (value instanceof Number n) {
            return BigDecimal.valueOf(n.longValue());
        }
        return BigDecimal.ZERO;
    }

    private static LocalDate toDate(Object value) {
        if (value instanceof java.sql.Date d) {
            return d.toLocalDate();
        }
        if (value instanceof LocalDate d) {
            return d;
        }
        if (value instanceof java.time.LocalDateTime t) {
            return t.toLocalDate();
        }
        return LocalDate.parse(String.valueOf(value).substring(0, 10));
    }
}
