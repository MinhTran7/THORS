package com.thors.module.sales.repository;

import com.thors.module.promotion.dto.SalePrice;
import com.thors.module.sales.dto.InStoreSaleDetailResponse;
import com.thors.module.sales.dto.InStoreSaleListItem;
import com.thors.module.sales.dto.PriceRange;
import com.thors.module.sales.dto.SellerOption;
import com.thors.module.sales.dto.VariantSale;
import com.thors.module.sales.entity.SaleVariant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
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

    // Hàng đang giữ cho đơn khác: phần giữ của đơn Facebook/online và đơn online đang trong hạn thanh toán
    private static final String HELD_SQL = """
            (SELECT COALESCE(SUM(IF(oi.reserved_quantity > 0, oi.reserved_quantity, oi.quantity)), 0)
             FROM order_item oi JOIN orders o ON o.order_id = oi.order_id
             WHERE oi.detail_id = pd.detail_id
               AND (oi.reserved_quantity > 0
                    OR (o.order_type = 'Online' AND o.order_status = 'AWAITING_PAYMENT' AND o.payment_expires_at > NOW())))
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
            SELECT o.order_id, o.order_number, i.invoice_number, o.order_date,
                   u.full_name AS seller_name, COALESCE(o.manual_discount_amount, 0) AS manual_discount, o.total_amount,
                   o.payment_method, o.payment_status
            """ + SALE_FROM;

    private static final String REQUEST_KEY_PREFIX = "pos:";

    private final JdbcTemplate jdbc;

    public InStoreSalesRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Filter(String keyword, LocalDate fromDate, LocalDate toDate, Integer sellerId, String paymentMethod) {
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
                        rs.getInt("stock_quantity"), rs.getInt("held"),
                        "ACTIVE".equals(rs.getString("detail_status")) && "ACTIVE".equals(rs.getString("product_status"))),
                detailId).stream().findFirst();
    }

    // Đơn đã tạo từ cùng một lần bấm thanh toán (requestId), nhận ra qua khóa thẻ kho của đơn đó
    public Optional<Integer> findOrderIdByRequest(String requestId) {
        return jdbc.queryForList("""
                        SELECT oi.order_id
                        FROM stock_adjustment sa JOIN order_item oi ON oi.order_item_id = sa.order_item_id
                        WHERE sa.idempotency_key LIKE ?
                        LIMIT 1
                        """,
                Integer.class, REQUEST_KEY_PREFIX + requestId + ":%").stream().findFirst();
    }

    public static String stockKey(String requestId, int detailId) {
        return REQUEST_KEY_PREFIX + requestId + ":" + detailId;
    }

    // Đơn tại quầy dùng chung bảng orders; user_id NOT NULL nên lưu người bán
    public int insertOrder(String orderNumber, int sellerId, String paymentMethod, BigDecimal subtotal,
                           BigDecimal discount, BigDecimal total, LocalDateTime at) {
        Timestamp time = Timestamp.valueOf(at);
        return insertAndGetKey(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO orders (order_number, order_type, user_id, order_date, order_status, payment_expires_at,
                                        total_amount, created_by, stock_deducted_at, payment_method, payment_status,
                                        items_amount, promotion_discount_amount, coupon_discount_amount, manual_discount_amount,
                                        shipping_fee, stock_hold_status, stock_hold_closed_at, stock_hold_close_reason)
                    VALUES (?, 'In-Store', ?, ?, 'COMPLETED', NULL, ?, ?, ?, ?, 'PAID', ?, 0, 0, ?, 0, 'NONE', ?, 'IN_STORE_SALE')
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, orderNumber);
            ps.setInt(2, sellerId);
            ps.setTimestamp(3, time);
            ps.setBigDecimal(4, total);
            ps.setInt(5, sellerId);
            ps.setTimestamp(6, time);
            ps.setString(7, paymentMethod);
            ps.setBigDecimal(8, subtotal);
            ps.setBigDecimal(9, discount);
            ps.setTimestamp(10, time);
            return ps;
        });
    }

    public int insertItem(int orderId, SaleVariant variant, int quantity, SalePrice price) {
        return insertAndGetKey(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO order_item (order_id, detail_id, quantity, unit_price, original_price, promotion_id,
                                            product_name_snapshot, size_snapshot, color_snapshot, reserved_quantity)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, orderId);
            ps.setInt(2, variant.detailId());
            ps.setInt(3, quantity);
            ps.setBigDecimal(4, price.price());
            ps.setBigDecimal(5, price.originalPrice());
            ps.setObject(6, price.promotionId());
            ps.setString(7, variant.productName());
            ps.setString(8, variant.size());
            ps.setString(9, variant.color());
            return ps;
        });
    }

    public boolean deductStock(int detailId, int quantity) {
        return jdbc.update(
                "UPDATE product_detail SET stock_quantity = stock_quantity - ? WHERE detail_id = ? AND stock_quantity >= ? AND status = 'ACTIVE'",
                quantity, detailId, quantity) == 1;
    }

    // Thẻ kho "Xuất bán"
    public void insertStockOut(int detailId, int quantity, String reason, int sellerId, int orderItemId, String idempotencyKey) {
        jdbc.update("""
                        INSERT INTO stock_adjustment (detail_id, quantity_change, reason, adjusted_by, movement_type,
                                                      movement_quantity, order_item_id, idempotency_key)
                        VALUES (?, ?, ?, ?, 'ORDER_OUT', ?, ?, ?)
                        """,
                detailId, -quantity, reason, sellerId, quantity, orderItemId, idempotencyKey);
    }

    public void insertPayment(int orderId, String paymentMethod, BigDecimal amount, LocalDateTime at) {
        jdbc.update("INSERT INTO payment (order_id, payment_method, payment_status, amount, paid_at) VALUES (?, ?, 'SUCCESS', ?, ?)",
                orderId, paymentMethod, amount, Timestamp.valueOf(at));
    }

    public void insertInvoice(int orderId, String invoiceNumber, int sellerId, LocalDateTime at) {
        jdbc.update("INSERT INTO invoice (order_id, invoice_number, issued_at, issued_by, issuer_type) VALUES (?, ?, ?, ?, 'USER')",
                orderId, invoiceNumber, Timestamp.valueOf(at), sellerId);
    }

    // ---- Lịch sử, chi tiết ----

    public long countSales(Filter filter) {
        List<Object> args = new ArrayList<>();
        Long total = jdbc.queryForObject("SELECT COUNT(*) " + SALE_FROM + where(filter, args), Long.class, args.toArray());
        return total == null ? 0 : total;
    }

    public List<InStoreSaleListItem> findSales(Filter filter, int limit, long offset) {
        List<Object> args = new ArrayList<>();
        String sql = SALE_SQL + where(filter, args) + " ORDER BY o.order_date DESC, o.order_id DESC LIMIT ? OFFSET ?";
        args.add(limit);
        args.add(offset);
        return jdbc.query(sql,
                (rs, i) -> new InStoreSaleListItem(rs.getInt("order_id"), rs.getString("order_number"),
                        rs.getString("invoice_number"), orderDate(rs), rs.getString("seller_name"),
                        rs.getBigDecimal("total_amount"), rs.getString("payment_method")),
                args.toArray());
    }

    public Optional<InStoreSaleDetailResponse> findSale(int orderId) {
        List<InStoreSaleDetailResponse.SaleItemDetail> items = findSaleItems(orderId);
        return jdbc.query(SALE_SQL + " WHERE o.order_id = ? AND o.order_type = 'In-Store'",
                (rs, i) -> InStoreSaleDetailResponse.of(rs.getInt("order_id"), rs.getString("order_number"),
                        rs.getString("invoice_number"), orderDate(rs), rs.getString("seller_name"),
                        rs.getBigDecimal("manual_discount"), rs.getBigDecimal("total_amount"),
                        rs.getString("payment_method"), rs.getString("payment_status"), items),
                orderId).stream().findFirst();
    }

    private List<InStoreSaleDetailResponse.SaleItemDetail> findSaleItems(int orderId) {
        return jdbc.query("""
                        SELECT oi.order_item_id, oi.product_name_snapshot, oi.size_snapshot, oi.color_snapshot,
                               oi.quantity, oi.unit_price, COALESCE(oi.original_price, oi.unit_price) AS original_price,
                        """ + IMAGE_SQL + """
                        FROM order_item oi
                        LEFT JOIN product_detail pd ON pd.detail_id = oi.detail_id
                        WHERE oi.order_id = ?
                        ORDER BY oi.order_item_id
                        """,
                (rs, i) -> {
                    BigDecimal unitPrice = rs.getBigDecimal("unit_price");
                    int quantity = rs.getInt("quantity");
                    return new InStoreSaleDetailResponse.SaleItemDetail(rs.getInt("order_item_id"),
                            rs.getString("product_name_snapshot"), rs.getString("size_snapshot"), rs.getString("color_snapshot"),
                            quantity, rs.getBigDecimal("original_price"), unitPrice,
                            unitPrice.multiply(BigDecimal.valueOf(quantity)), rs.getString("image_url"));
                },
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

    public Map<Integer, VariantSale> findVariantStocks(int productId) {
        Map<Integer, VariantSale> result = new LinkedHashMap<>();
        jdbc.query("SELECT pd.detail_id, pd.price, GREATEST(pd.stock_quantity - " + HELD_SQL + ", 0) AS available"
                        + " FROM product_detail pd WHERE pd.product_id = ? AND pd.price IS NOT NULL",
                rs -> {
                    result.put(rs.getInt("detail_id"), new VariantSale(rs.getBigDecimal("price"), rs.getInt("available")));
                },
                productId);
        return result;
    }

    public Map<Integer, PriceRange> findPriceRanges() {
        Map<Integer, PriceRange> ranges = new LinkedHashMap<>();
        jdbc.query("SELECT product_id, MIN(price) AS min_price, MAX(price) AS max_price FROM product_detail"
                        + " WHERE status = 'ACTIVE' AND price IS NOT NULL GROUP BY product_id",
                rs -> {
                    BigDecimal min = rs.getBigDecimal("min_price");
                    BigDecimal max = rs.getBigDecimal("max_price");
                    ranges.put(rs.getInt("product_id"), new PriceRange(min, max, min, max));
                });
        return ranges;
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

    private int insertAndGetKey(PreparedStatementCreator creator) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(creator, keyHolder);
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("Không lấy được ID vừa tạo.");
        }
        return key.intValue();
    }

    private static LocalDateTime orderDate(ResultSet rs) throws SQLException {
        Timestamp ts = rs.getTimestamp("order_date");
        return ts != null ? ts.toLocalDateTime() : null;
    }
}
