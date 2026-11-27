package com.thors.module.promotion.repository;

import com.thors.module.promotion.dto.PromotionOrder;
import com.thors.module.promotion.dto.PromotionOrderDetail;
import com.thors.module.promotion.dto.PromotionSaleItem;
import com.thors.module.promotion.entity.Promotion;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Repository
public class PromotionRepository {

    // Đơn hủy, bị từ chối, hết hạn không tính là đã dùng mã
    private static final String COUNTED_ORDER = "order_status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED')";

    private static final String COLUMNS = """
            SELECT promotion_id, promotion_type, name, description, discount_type, discount_value, min_order_value,
                   max_discount_amount, usage_limit, apply_scope, start_date, end_date, status,
                   (SELECT COUNT(*) FROM orders o WHERE o.promotion_id = promotion.promotion_id AND o.%s) AS used_count
            FROM promotion
            """.formatted(COUNTED_ORDER);

    private static final String RUNNING_PRODUCT =
            " WHERE promotion_type = 'PRODUCT_DISCOUNT' AND status = 'ACTIVE' AND start_date <= ? AND end_date > ?";

    private static final RowMapper<Promotion> MAPPER = (rs, i) -> new Promotion(
            rs.getInt("promotion_id"),
            rs.getString("promotion_type"),
            rs.getString("name"),
            rs.getString("description"),
            rs.getString("discount_type"),
            rs.getBigDecimal("discount_value"),
            rs.getBigDecimal("min_order_value"),
            rs.getBigDecimal("max_discount_amount"),
            rs.getObject("usage_limit", Integer.class),
            rs.getInt("used_count"),
            rs.getString("apply_scope"),
            List.of(),
            rs.getTimestamp("start_date").toLocalDateTime(),
            rs.getTimestamp("end_date").toLocalDateTime(),
            rs.getString("status"));

    private final JdbcTemplate jdbc;

    public PromotionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ---- Khuyến mãi ----

    public List<Promotion> findAll() {
        return jdbc.query(COLUMNS + " ORDER BY promotion_id DESC", MAPPER);
    }

    public Optional<Promotion> findById(int id) {
        return first(COLUMNS + " WHERE promotion_id = ?", id);
    }

    public Optional<Promotion> lockById(int id) {
        return first(COLUMNS + " WHERE promotion_id = ? FOR UPDATE", id);
    }

    // Mã giảm giá online đang bật và chưa kết thúc
    public List<Promotion> findAvailableVouchers(LocalDateTime now) {
        return jdbc.query(COLUMNS + " WHERE promotion_type = 'ORDER_VOUCHER' AND status = 'ACTIVE' AND end_date > ?"
                + " ORDER BY end_date, promotion_id DESC", MAPPER, Timestamp.valueOf(now));
    }

    public Optional<Promotion> findRunningProductPromotion(int productId, LocalDateTime now) {
        Timestamp time = Timestamp.valueOf(now);
        return first(COLUMNS + RUNNING_PRODUCT
                + " AND (apply_scope = 'ALL' OR promotion_id IN (SELECT promotion_id FROM promotion_product WHERE product_id = ?))"
                + " ORDER BY promotion_id DESC LIMIT 1", time, time, productId);
    }

    // Cùng thứ tự với findRunningProductPromotion: mới nhất trước
    public List<Promotion> findRunningProductPromotions(LocalDateTime now) {
        Timestamp time = Timestamp.valueOf(now);
        return jdbc.query(COLUMNS + RUNNING_PRODUCT + " ORDER BY promotion_id DESC", MAPPER, time, time);
    }

    // Khuyến mãi sản phẩm đang bật khác excludeId, trùng thời gian và trùng sản phẩm (phạm vi ALL trùng với tất cả)
    public Optional<Promotion> findOverlappingProductPromotion(int excludeId, String scope, List<Integer> productIds,
                                                               LocalDateTime start, LocalDateTime end) {
        List<Object> args = new ArrayList<>(List.of(excludeId, Timestamp.valueOf(end), Timestamp.valueOf(start)));
        String productFilter = "";
        if (!"ALL".equals(scope)) {
            productFilter = " AND (apply_scope = 'ALL' OR promotion_id IN (SELECT promotion_id FROM promotion_product WHERE product_id IN ("
                    + placeholders(productIds.size()) + ")))";
            args.addAll(productIds);
        }
        return first(COLUMNS + " WHERE promotion_type = 'PRODUCT_DISCOUNT' AND status = 'ACTIVE'"
                + " AND promotion_id <> ? AND start_date < ? AND end_date > ?" + productFilter + " LIMIT 1", args.toArray());
    }

    // Khóa bảng khuyến mãi tới hết transaction để hai lần kiểm tra trùng sản phẩm không chạy song song
    public void lockForWrite() {
        jdbc.query("SELECT promotion_id FROM promotion FOR UPDATE", rs -> {
        });
    }

    public int insert(Promotion p, int createdBy) {
        KeyHolder key = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO promotion (promotion_type, name, description, discount_type, discount_value, min_order_value,
                                           max_discount_amount, usage_limit, apply_scope, start_date, end_date, status, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, p.type());
            ps.setString(2, p.name());
            ps.setString(3, p.description());
            ps.setString(4, p.discountType());
            ps.setBigDecimal(5, p.discountValue());
            ps.setBigDecimal(6, p.minOrderValue());
            ps.setBigDecimal(7, p.maxDiscountAmount());
            ps.setObject(8, p.usageLimit(), Types.INTEGER);
            ps.setString(9, p.applyScope());
            ps.setTimestamp(10, Timestamp.valueOf(p.startDate()));
            ps.setTimestamp(11, Timestamp.valueOf(p.endDate()));
            ps.setInt(12, createdBy);
            return ps;
        }, key);
        return key.getKey().intValue();
    }

    public void update(int id, Promotion p) {
        jdbc.update("""
                UPDATE promotion
                SET name = ?, description = ?, discount_type = ?, discount_value = ?, min_order_value = ?, max_discount_amount = ?,
                    usage_limit = ?, apply_scope = ?, start_date = ?, end_date = ?
                WHERE promotion_id = ?
                """, p.name(), p.description(), p.discountType(), p.discountValue(), p.minOrderValue(), p.maxDiscountAmount(),
                p.usageLimit(), p.applyScope(), Timestamp.valueOf(p.startDate()), Timestamp.valueOf(p.endDate()), id);
    }

    public void adjust(int id, LocalDateTime endDate, Integer usageLimit) {
        jdbc.update("UPDATE promotion SET end_date = ?, usage_limit = ? WHERE promotion_id = ?",
                Timestamp.valueOf(endDate), usageLimit, id);
    }

    public void updateStatus(int id, String status) {
        jdbc.update("UPDATE promotion SET status = ? WHERE promotion_id = ?", status, id);
    }

    public void endAt(int id, LocalDateTime endDate) {
        jdbc.update("UPDATE promotion SET end_date = ? WHERE promotion_id = ?", Timestamp.valueOf(endDate), id);
    }

    // promotion_product tự xóa theo (ON DELETE CASCADE)
    public void delete(int id) {
        jdbc.update("DELETE FROM promotion WHERE promotion_id = ?", id);
    }

    // ---- Sản phẩm áp dụng ----

    public List<Integer> findProductIds(int promotionId) {
        return jdbc.queryForList("SELECT product_id FROM promotion_product WHERE promotion_id = ? ORDER BY product_id",
                Integer.class, promotionId);
    }

    // Gắn sản phẩm cho cả danh sách khuyến mãi bằng một truy vấn
    public List<Promotion> withProductIds(List<Promotion> promotions) {
        if (promotions.isEmpty()) return promotions;
        Map<Integer, List<Integer>> ids = new HashMap<>();
        jdbc.query("SELECT promotion_id, product_id FROM promotion_product WHERE promotion_id IN ("
                        + placeholders(promotions.size()) + ") ORDER BY product_id",
                rs -> {
                    ids.computeIfAbsent(rs.getInt("promotion_id"), k -> new ArrayList<>()).add(rs.getInt("product_id"));
                },
                promotions.stream().map(Promotion::promotionId).toArray());
        return promotions.stream().map(p -> p.withProductIds(ids.getOrDefault(p.promotionId(), List.of()))).toList();
    }

    public int countActiveProducts(List<Integer> productIds) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM product WHERE status = 'ACTIVE' AND product_id IN ("
                + placeholders(productIds.size()) + ")", Integer.class, productIds.toArray());
    }

    public void replaceProducts(int promotionId, List<Integer> productIds) {
        jdbc.update("DELETE FROM promotion_product WHERE promotion_id = ?", promotionId);
        if (productIds.isEmpty()) return;
        jdbc.batchUpdate("INSERT INTO promotion_product (promotion_id, product_id) VALUES (?, ?)",
                productIds, productIds.size(), (ps, productId) -> {
                    ps.setInt(1, promotionId);
                    ps.setInt(2, productId);
                });
    }

    // ---- Đơn hàng dùng khuyến mãi ----

    public int countUsage(int promotionId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM orders WHERE promotion_id = ? AND " + COUNTED_ORDER + " FOR SHARE",
                Integer.class, promotionId);
    }

    // Mỗi khách dùng mỗi mã giảm giá online một lần
    public boolean hasUsed(int promotionId, int userId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM orders WHERE promotion_id = ? AND user_id = ? AND " + COUNTED_ORDER
                + " FOR SHARE", Integer.class, promotionId, userId) > 0;
    }

    public Set<Integer> findUsedPromotionIds(int userId) {
        return new HashSet<>(jdbc.queryForList("SELECT DISTINCT promotion_id FROM orders WHERE user_id = ? AND promotion_id IS NOT NULL AND "
                + COUNTED_ORDER, Integer.class, userId));
    }

    // Có đơn nào gắn khuyến mãi (kể cả đơn đã hủy): trên đơn (mã giảm giá) hoặc trên dòng hàng (khuyến mãi sản phẩm)
    public boolean hasOrders(int promotionId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM orders WHERE promotion_id = ?)
                    OR EXISTS (SELECT 1 FROM order_item WHERE promotion_id = ?)
                """, Boolean.class, promotionId, promotionId));
    }

    // Mọi đơn đã áp mã, mới nhất trước
    public List<PromotionOrder> findOrders(int promotionId) {
        return jdbc.query("""
                SELECT o.order_id, o.order_number, o.order_date, COALESCE(u.full_name, o.delivery_name) AS customer_name,
                       o.items_amount, o.promotion_discount_amount, o.total_amount, o.order_status
                FROM orders o
                LEFT JOIN `user` u ON u.user_id = o.user_id
                WHERE o.promotion_id = ?
                ORDER BY o.order_date DESC, o.order_id DESC
                """, (rs, i) -> new PromotionOrder(rs.getInt("order_id"), rs.getString("order_number"),
                        rs.getTimestamp("order_date").toLocalDateTime(), rs.getString("customer_name"),
                        rs.getBigDecimal("items_amount"), rs.getBigDecimal("promotion_discount_amount"),
                        rs.getBigDecimal("total_amount"), rs.getString("order_status")),
                promotionId);
    }

    // Dòng hàng được giảm bởi khuyến mãi sản phẩm, lọc theo kênh bán (null = tất cả)
    public List<PromotionSaleItem> findSaleItems(int promotionId, String channel) {
        return jdbc.query("""
                SELECT o.order_id, o.order_number, o.order_type, o.order_date,
                       oi.product_name_snapshot, oi.size_snapshot, oi.color_snapshot, oi.quantity, oi.original_price, oi.unit_price
                FROM order_item oi
                JOIN orders o ON o.order_id = oi.order_id
                WHERE oi.promotion_id = ? AND o.%s AND (? IS NULL OR o.order_type = ?)
                ORDER BY o.order_date DESC, o.order_id DESC, oi.order_item_id
                """.formatted(COUNTED_ORDER), (rs, i) -> new PromotionSaleItem(rs.getInt("order_id"), rs.getString("order_number"),
                        rs.getString("order_type"), rs.getTimestamp("order_date").toLocalDateTime(),
                        rs.getString("product_name_snapshot"), rs.getString("size_snapshot"), rs.getString("color_snapshot"),
                        rs.getInt("quantity"), rs.getBigDecimal("original_price"), rs.getBigDecimal("unit_price")),
                promotionId, channel, channel);
    }

    // Đơn có gắn khuyến mãi promotionId (trên đơn hoặc trên dòng hàng), kèm mọi dòng hàng của đơn
    public Optional<PromotionOrderDetail> findOrderDetail(int promotionId, int orderId) {
        // Đơn tại quầy: user_id là người bán nên chỉ lấy tên người nhận (khách lẻ thì để trống)
        return jdbc.query("""
                SELECT o.order_id, o.order_number, o.order_type, o.order_date, o.order_status, o.items_amount,
                       o.promotion_discount_amount, o.coupon_discount_amount + o.manual_discount_amount AS other_discount,
                       o.shipping_fee, o.total_amount,
                       IF(o.order_type = 'Online', COALESCE(u.full_name, o.delivery_name), o.delivery_name) AS customer_name
                FROM orders o
                LEFT JOIN `user` u ON u.user_id = o.user_id
                WHERE o.order_id = ?
                  AND (o.promotion_id = ? OR EXISTS (SELECT 1 FROM order_item oi WHERE oi.order_id = o.order_id AND oi.promotion_id = ?))
                """, (rs, i) -> new PromotionOrderDetail(rs.getInt("order_id"), rs.getString("order_number"),
                        rs.getString("order_type"), rs.getTimestamp("order_date").toLocalDateTime(), rs.getString("customer_name"),
                        rs.getString("order_status"), rs.getBigDecimal("items_amount"), rs.getBigDecimal("promotion_discount_amount"),
                        rs.getBigDecimal("other_discount"), rs.getBigDecimal("shipping_fee"), rs.getBigDecimal("total_amount"),
                        findOrderLines(promotionId, orderId)),
                orderId, promotionId, promotionId).stream().findFirst();
    }

    private List<PromotionOrderDetail.Line> findOrderLines(int promotionId, int orderId) {
        return jdbc.query("""
                SELECT product_name_snapshot, size_snapshot, color_snapshot, quantity, original_price, unit_price,
                       promotion_id <=> ? AS promoted
                FROM order_item
                WHERE order_id = ?
                ORDER BY order_item_id
                """, (rs, i) -> new PromotionOrderDetail.Line(rs.getString("product_name_snapshot"), rs.getString("size_snapshot"),
                        rs.getString("color_snapshot"), rs.getInt("quantity"), rs.getBigDecimal("original_price"),
                        rs.getBigDecimal("unit_price"), rs.getBoolean("promoted")),
                promotionId, orderId);
    }

    private Optional<Promotion> first(String sql, Object... args) {
        return jdbc.query(sql, MAPPER, args).stream().findFirst();
    }

    private static String placeholders(int count) {
        return String.join(",", Collections.nCopies(count, "?"));
    }
}
