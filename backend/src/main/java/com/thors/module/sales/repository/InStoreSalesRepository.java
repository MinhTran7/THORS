package com.thors.module.sales.repository;

import com.thors.module.promotion.dto.SalePrice;
import com.thors.module.sales.dto.InStoreSaleDetailResponse;
import com.thors.module.sales.dto.InStoreSaleListItem;
import com.thors.module.sales.dto.SellerOption;
import com.thors.module.sales.entity.SaleVariant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class InStoreSalesRepository {

    // Hàng đang giữ cho đơn khác, cùng cách tính với kho (WarehouseStore.held)
    private static final String HELD_SQL = """
            (SELECT COALESCE(SUM(oi.reserved_quantity), 0) FROM order_item oi WHERE oi.detail_id = pd.detail_id)
            """;

    // Ảnh chính của sản phẩm (cần alias pd cho product_detail)
    private static final String IMAGE_SQL = """
            (SELECT pi.image_url FROM product_image pi
             WHERE pi.product_id = pd.product_id AND pi.deleted_at IS NULL
             ORDER BY pi.is_primary DESC, pi.image_id ASC LIMIT 1) AS image_url
            """;

    private static final String SALE_FROM = """
            FROM orders o
            LEFT JOIN invoice i ON i.order_id = o.order_id
            LEFT JOIN `user` u ON u.user_id = o.created_by
            """;

    private static final String SALE_SQL = """
            SELECT o.order_id, o.order_number, i.invoice_number, o.order_date, o.order_status,
                   u.full_name AS seller_name, o.items_amount, o.manual_discount_amount, o.total_amount,
                   o.payment_method, o.payment_status
            """ + SALE_FROM;

    private static final String REQUEST_KEY_PREFIX = "pos:";

    private final JdbcTemplate jdbc;

    public InStoreSalesRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Filter(String keyword, LocalDate fromDate, LocalDate toDate, Integer sellerId, String paymentMethod) {
    }

    public record VariantStock(BigDecimal price, int available) {
    }

    public record PendingSale(int orderId, String orderNumber, int sellerId, String orderStatus, BigDecimal total) {
        public boolean awaitingPayment() {
            return "AWAITING_PAYMENT".equals(orderStatus);
        }
    }

    public record OrderLine(int orderItemId, int detailId, int quantity) {
    }

    // ---- Tạo hóa đơn ----

    public Optional<SaleVariant> lockVariant(int detailId) {
        return jdbc.query("""
                        SELECT pd.detail_id, pd.product_id, pd.stock_quantity, pd.price, pd.size, pd.color,
                               pd.status AS detail_status, p.product_name, p.status AS product_status,
                        """ + HELD_SQL + """
                               AS held
                        FROM product_detail pd JOIN product p ON p.product_id = pd.product_id
                        WHERE pd.detail_id = ?
                        FOR UPDATE
                        """,
                (rs, i) -> new SaleVariant(rs.getInt("detail_id"), rs.getInt("product_id"), rs.getString("product_name"),
                        rs.getString("size"), rs.getString("color"), rs.getBigDecimal("price"),
                        rs.getInt("stock_quantity"), rs.getInt("held"), 0,
                        "ACTIVE".equals(rs.getString("detail_status")) && "ACTIVE".equals(rs.getString("product_status"))),
                detailId).stream().findFirst();
    }

    public Optional<Integer> findOrderIdByRequest(String requestId) {
        return jdbc.queryForList("SELECT order_id FROM orders WHERE stock_hold_key = ?", Integer.class, REQUEST_KEY_PREFIX + requestId)
                .stream().findFirst();
    }

    // Đơn tại quầy dùng chung bảng orders; user_id NOT NULL nên lưu người bán
    public int insertOrder(String orderNumber, int sellerId, String paymentMethod, BigDecimal subtotal,
                           BigDecimal discount, BigDecimal total, String requestId, LocalDateTime at) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO orders (order_number, order_type, user_id, order_date, order_status, total_amount, created_by,
                                        payment_method, payment_status, items_amount, promotion_discount_amount,
                                        coupon_discount_amount, manual_discount_amount, shipping_fee, stock_hold_status, stock_hold_key)
                    VALUES (?, 'In-Store', ?, ?, 'AWAITING_PAYMENT', ?, ?, ?, 'UNPAID', ?, 0, 0, ?, 0, 'NONE', ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, orderNumber);
            ps.setInt(2, sellerId);
            ps.setTimestamp(3, Timestamp.valueOf(at));
            ps.setBigDecimal(4, total);
            ps.setInt(5, sellerId);
            ps.setString(6, paymentMethod);
            ps.setBigDecimal(7, subtotal);
            ps.setBigDecimal(8, discount);
            ps.setString(9, REQUEST_KEY_PREFIX + requestId);
            return ps;
        }, keyHolder);
        return keyHolder.getKey().intValue();
    }

    public void insertItem(int orderId, SaleVariant variant, int quantity, SalePrice price) {
        jdbc.update("""
                        INSERT INTO order_item (order_id, detail_id, quantity, unit_price, original_price, promotion_id,
                                                product_name_snapshot, size_snapshot, color_snapshot, reserved_quantity)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                orderId, variant.detailId(), quantity, price.price(), price.originalPrice(), price.promotionId(),
                variant.productName(), variant.size(), variant.color(), quantity);
    }

    public boolean deductStock(int detailId, int quantity) {
        return jdbc.update("UPDATE product_detail SET stock_quantity = stock_quantity - ? WHERE detail_id = ? AND stock_quantity >= ?",
                quantity, detailId, quantity) == 1;
    }

    public void insertPayment(int orderId, String paymentMethod, BigDecimal amount, LocalDateTime at) {
        jdbc.update("INSERT INTO payment (order_id, payment_method, payment_status, amount, paid_at) VALUES (?, ?, 'SUCCESS', ?, ?)",
                orderId, paymentMethod, amount, Timestamp.valueOf(at));
    }

    public void insertInvoice(int orderId, String invoiceNumber, int sellerId, LocalDateTime at) {
        jdbc.update("INSERT INTO invoice (order_id, invoice_number, issued_at, issued_by, issuer_type) VALUES (?, ?, ?, ?, 'USER')",
                orderId, invoiceNumber, Timestamp.valueOf(at), sellerId);
    }

    public Optional<PendingSale> lockSale(int orderId) {
        return jdbc.query("""
                        SELECT order_id, order_number, created_by, order_status, total_amount
                        FROM orders WHERE order_id = ? AND order_type = 'In-Store' FOR UPDATE
                        """,
                (rs, i) -> new PendingSale(rs.getInt("order_id"), rs.getString("order_number"), rs.getInt("created_by"),
                        rs.getString("order_status"), rs.getBigDecimal("total_amount")),
                orderId).stream().findFirst();
    }

    public List<OrderLine> findOrderLines(int orderId) {
        return jdbc.query("""
                        SELECT order_item_id, detail_id, quantity
                        FROM order_item WHERE order_id = ? ORDER BY detail_id
                        """,
                (rs, i) -> new OrderLine(rs.getInt("order_item_id"), rs.getInt("detail_id"), rs.getInt("quantity")), orderId);
    }

    public void releaseItems(int orderId) {
        jdbc.update("UPDATE order_item SET reserved_quantity = 0 WHERE order_id = ?", orderId);
    }

    public void markCompleted(int orderId, String paymentMethod, LocalDateTime at) {
        Timestamp time = Timestamp.valueOf(at);
        jdbc.update("""
                UPDATE orders
                SET order_status = 'COMPLETED', payment_status = 'PAID', payment_method = ?, stock_deducted_at = ?,
                    stock_hold_closed_at = ?, stock_hold_close_reason = 'IN_STORE_SALE'
                WHERE order_id = ?
                """, paymentMethod, time, time, orderId);
    }

    public void markCancelled(int orderId, String reason, LocalDateTime at) {
        jdbc.update("UPDATE orders SET order_status = 'CANCELLED', cancel_reason = ?, cancelled_at = ? WHERE order_id = ?",
                reason, Timestamp.valueOf(at), orderId);
    }

    public void markRefundPending(int orderId) {
        jdbc.update("UPDATE orders SET payment_status = 'REFUND_PENDING' WHERE order_id = ?", orderId);
    }

    public void failPendingPayments(int orderId, String reason) {
        jdbc.update("UPDATE payment SET payment_status = 'FAILED', failure_reason = ? WHERE order_id = ? AND payment_status = 'PENDING'",
                reason, orderId);
    }

    // ---- Lịch sử, chi tiết ----

    public long countSales(Filter filter) {
        List<Object> args = new ArrayList<>();
        return jdbc.queryForObject("SELECT COUNT(*) " + SALE_FROM + where(filter, args), Long.class, args.toArray());
    }

    public List<InStoreSaleListItem> findSales(Filter filter, int limit, long offset) {
        List<Object> args = new ArrayList<>();
        String sql = SALE_SQL + where(filter, args) + " ORDER BY o.order_date DESC, o.order_id DESC LIMIT ? OFFSET ?";
        args.add(limit);
        args.add(offset);
        return jdbc.query(sql,
                (rs, i) -> new InStoreSaleListItem(rs.getInt("order_id"), rs.getString("order_number"),
                        rs.getString("invoice_number"), rs.getTimestamp("order_date").toLocalDateTime(), rs.getString("seller_name"),
                        rs.getBigDecimal("total_amount"), rs.getString("payment_method")),
                args.toArray());
    }

    public Optional<InStoreSaleDetailResponse> findSale(int orderId) {
        return jdbc.query(SALE_SQL + " WHERE o.order_id = ? AND o.order_type = 'In-Store'",
                (rs, i) -> new InStoreSaleDetailResponse(rs.getInt("order_id"), rs.getString("order_number"),
                        rs.getString("invoice_number"), rs.getTimestamp("order_date").toLocalDateTime(), rs.getString("seller_name"),
                        rs.getBigDecimal("items_amount"), rs.getBigDecimal("manual_discount_amount"), rs.getBigDecimal("total_amount"),
                        rs.getString("order_status"), rs.getString("payment_method"), rs.getString("payment_status"),
                        findSaleItems(orderId)),
                orderId).stream().findFirst();
    }

    private List<InStoreSaleDetailResponse.SaleItemDetail> findSaleItems(int orderId) {
        return jdbc.query("""
                        SELECT oi.order_item_id, oi.product_name_snapshot, oi.size_snapshot, oi.color_snapshot,
                               oi.quantity, oi.unit_price, COALESCE(oi.original_price, oi.unit_price) AS original_price,
                               oi.quantity * oi.unit_price AS total_price,
                        """ + IMAGE_SQL + """
                        FROM order_item oi
                        LEFT JOIN product_detail pd ON pd.detail_id = oi.detail_id
                        WHERE oi.order_id = ?
                        ORDER BY oi.order_item_id
                        """,
                (rs, i) -> new InStoreSaleDetailResponse.SaleItemDetail(rs.getInt("order_item_id"),
                        rs.getString("product_name_snapshot"), rs.getString("size_snapshot"), rs.getString("color_snapshot"),
                        rs.getInt("quantity"), rs.getBigDecimal("original_price"), rs.getBigDecimal("unit_price"),
                        rs.getBigDecimal("total_price"), rs.getString("image_url")),
                orderId);
    }

    // Người bán từng bán tại quầy, cho bộ lọc lịch sử
    public List<SellerOption> findSellers() {
        return jdbc.query("""
                        SELECT DISTINCT u.user_id, u.full_name
                        FROM orders o JOIN `user` u ON u.user_id = o.created_by
                        WHERE o.order_type = 'In-Store' AND u.full_name IS NOT NULL
                        ORDER BY u.full_name
                        """,
                (rs, i) -> new SellerOption(rs.getInt("user_id"), rs.getString("full_name")));
    }

    // ---- Giá gốc, số còn bán được ----

    public Map<Integer, VariantStock> findVariantStocks(int productId) {
        Map<Integer, VariantStock> result = new LinkedHashMap<>();
        jdbc.query("SELECT pd.detail_id, pd.price, GREATEST(pd.stock_quantity - " + HELD_SQL + ", 0) AS available"
                        + " FROM product_detail pd WHERE pd.product_id = ? AND pd.price IS NOT NULL",
                rs -> {
                    result.put(rs.getInt("detail_id"), new VariantStock(rs.getBigDecimal("price"), rs.getInt("available")));
                },
                productId);
        return result;
    }

    // ---- Tiện ích ----

    // Chỉ đơn tại quầy đã hoàn tất; tìm theo mã đơn, mã hóa đơn, người bán
    private static String where(Filter f, List<Object> args) {
        StringBuilder where = new StringBuilder(" WHERE o.order_type = 'In-Store' AND o.order_status = 'COMPLETED'");
        if (f.keyword() != null) {
            String like = "%" + f.keyword().toLowerCase().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
            where.append(" AND (LOWER(o.order_number) LIKE ? OR LOWER(COALESCE(i.invoice_number, '')) LIKE ?")
                    .append(" OR LOWER(COALESCE(u.full_name, '')) LIKE ?)");
            args.addAll(List.of(like, like, like));
        }
        if (f.fromDate() != null) {
            where.append(" AND o.order_date >= ?");
            args.add(Timestamp.valueOf(f.fromDate().atStartOfDay()));
        }
        if (f.toDate() != null) {
            where.append(" AND o.order_date < ?");
            args.add(Timestamp.valueOf(f.toDate().plusDays(1).atStartOfDay()));
        }
        if (f.sellerId() != null) {
            where.append(" AND o.created_by = ?");
            args.add(f.sellerId());
        }
        if (f.paymentMethod() != null) {
            where.append(" AND o.payment_method = ?");
            args.add(f.paymentMethod());
        }
        return where.toString();
    }
}
