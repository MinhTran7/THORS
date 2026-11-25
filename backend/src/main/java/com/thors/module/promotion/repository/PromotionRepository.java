package com.thors.module.promotion.repository;

import com.thors.module.promotion.dto.PromotionOrder;
import com.thors.module.promotion.entity.Promotion;
import com.thors.module.promotion.mapper.PromotionMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
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

    // used_count: số đơn đã dùng mã (trừ đơn hủy, bị từ chối, hết hạn)
    private static final String SELECT_COLUMNS = """
            SELECT promotion_id, promotion_type, name, description, discount_value, start_date, end_date, status,
                   created_by, discount_type, min_order_value, usage_limit, apply_scope,
                   (SELECT COUNT(*) FROM orders o
                    WHERE o.promotion_id = promotion.promotion_id
                      AND o.order_status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED')) AS used_count
            FROM promotion
            """;

    // Khuyến mãi sản phẩm đang bật và đang chạy tại thời điểm ?
    private static final String RUNNING_PRODUCT = """
             WHERE promotion_type = 'PRODUCT_DISCOUNT' AND status = 'ACTIVE' AND start_date <= ? AND end_date > ?
            """;

    private final JdbcTemplate jdbc;
    private final PromotionMapper mapper = new PromotionMapper();

    public PromotionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ---- Đọc ----

    public List<Promotion> findAll() {
        return jdbc.query(SELECT_COLUMNS + " ORDER BY promotion_id DESC", mapper);
    }

    // Mã giảm giá online đang bật và chưa kết thúc (cho khách)
    public List<Promotion> findAvailableVouchers(LocalDateTime now) {
        return jdbc.query(SELECT_COLUMNS + " WHERE promotion_type = 'ORDER_VOUCHER' AND status = 'ACTIVE' AND end_date > ?"
                        + " ORDER BY end_date ASC, promotion_id DESC",
                mapper, Timestamp.valueOf(now));
    }

    public Optional<Promotion> findById(int id) {
        return first(SELECT_COLUMNS + " WHERE promotion_id = ?", id);
    }

    public Optional<Promotion> lockById(int id) {
        return first(SELECT_COLUMNS + " WHERE promotion_id = ? FOR UPDATE", id);
    }

    public int countUsage(int promotionId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM orders WHERE promotion_id = ? AND order_status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED') FOR SHARE",
                Integer.class, promotionId);
        return count == null ? 0 : count;
    }

    // Mỗi khách chỉ dùng mỗi mã giảm giá online 1 lần (đơn hủy, bị từ chối, hết hạn không tính)
    public boolean hasUsed(int promotionId, int userId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM orders WHERE promotion_id = ? AND user_id = ? AND order_status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED') FOR SHARE",
                Integer.class, promotionId, userId);
        return count != null && count > 0;
    }

    public Set<Integer> findUsedPromotionIds(int userId) {
        return new HashSet<>(jdbc.queryForList(
                "SELECT DISTINCT promotion_id FROM orders WHERE user_id = ? AND promotion_id IS NOT NULL AND order_status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED')",
                Integer.class, userId));
    }

    // Mọi đơn có gắn khuyến mãi (kể cả đơn đã hủy), dùng khi xóa
    public int countOrders(int promotionId) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM orders WHERE promotion_id = ?", Integer.class, promotionId);
        return count == null ? 0 : count;
    }

    public Optional<Promotion> findRunningProductPromotion(int productId, LocalDateTime now) {
        Timestamp time = Timestamp.valueOf(now);
        return first(SELECT_COLUMNS + RUNNING_PRODUCT
                        + " AND (apply_scope = 'ALL' OR promotion_id IN (SELECT promotion_id FROM promotion_product WHERE product_id = ?))"
                        + " ORDER BY promotion_id DESC LIMIT 1",
                time, time, productId);
    }

    // Mọi khuyến mãi sản phẩm đang chạy, mới nhất trước (cùng thứ tự với findRunningProductPromotion)
    public List<Promotion> findRunningProductPromotions(LocalDateTime now) {
        Timestamp time = Timestamp.valueOf(now);
        return jdbc.query(SELECT_COLUMNS + RUNNING_PRODUCT + " ORDER BY promotion_id DESC", mapper, time, time);
    }

    public List<Integer> findProductIds(int promotionId) {
        return jdbc.queryForList("SELECT product_id FROM promotion_product WHERE promotion_id = ? ORDER BY product_id",
                Integer.class, promotionId);
    }

    // Sản phẩm của nhiều khuyến mãi trong một lần đọc: promotionId -> danh sách productId
    public Map<Integer, List<Integer>> findProductIdsByPromotion(List<Integer> promotionIds) {
        Map<Integer, List<Integer>> result = new HashMap<>();
        if (promotionIds.isEmpty()) {
            return result;
        }
        jdbc.query("SELECT promotion_id, product_id FROM promotion_product WHERE promotion_id IN ("
                        + placeholders(promotionIds.size()) + ") ORDER BY product_id",
                rs -> {
                    result.computeIfAbsent(rs.getInt("promotion_id"), k -> new ArrayList<>()).add(rs.getInt("product_id"));
                },
                promotionIds.toArray());
        return result;
    }

    // Gắn danh sách sản phẩm vào khuyến mãi (cả danh sách: một truy vấn)
    public Promotion withProductIds(Promotion p) {
        return p.withProductIds(findProductIds(p.promotionId()));
    }

    public List<Promotion> withProductIds(List<Promotion> promotions) {
        Map<Integer, List<Integer>> ids = findProductIdsByPromotion(promotions.stream().map(Promotion::promotionId).toList());
        return promotions.stream().map(p -> p.withProductIds(ids.getOrDefault(p.promotionId(), List.of()))).toList();
    }

    // Các đơn đã áp mã, mới nhất trước
    public List<PromotionOrder> findOrders(int promotionId) {
        return jdbc.query("""
                SELECT o.order_id, o.order_number, o.order_date, COALESCE(u.full_name, o.delivery_name) AS customer_name,
                       o.items_amount, o.promotion_discount_amount, o.total_amount, o.order_status
                FROM orders o
                LEFT JOIN `user` u ON u.user_id = o.user_id
                WHERE o.promotion_id = ?
                ORDER BY o.order_date DESC, o.order_id DESC
                """,
                (rs, i) -> new PromotionOrder(rs.getInt("order_id"), rs.getString("order_number"),
                        rs.getTimestamp("order_date") == null ? null : rs.getTimestamp("order_date").toLocalDateTime(),
                        rs.getString("customer_name"), rs.getBigDecimal("items_amount"),
                        rs.getBigDecimal("promotion_discount_amount"), rs.getBigDecimal("total_amount"),
                        rs.getString("order_status")),
                promotionId);
    }

    public int countActiveProducts(List<Integer> productIds) {
        if (productIds == null || productIds.isEmpty()) {
            return 0;
        }
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM product WHERE status = 'ACTIVE' AND product_id IN (" + placeholders(productIds.size()) + ")",
                Integer.class, productIds.toArray());
        return count == null ? 0 : count;
    }

    // Khuyến mãi sản phẩm đang bật, trùng thời gian và trùng sản phẩm (phạm vi ALL trùng với mọi khuyến mãi)
    public Optional<Promotion> findOverlappingProductPromotion(int excludeId, String applyScope, List<Integer> productIds,
                                                               LocalDateTime startDate, LocalDateTime endDate) {
        List<Object> args = new ArrayList<>(List.of(excludeId, Timestamp.valueOf(endDate), Timestamp.valueOf(startDate)));
        String productFilter = "";
        if (!"ALL".equals(applyScope)) {
            productFilter = " AND (apply_scope = 'ALL' OR promotion_id IN (SELECT promotion_id FROM promotion_product WHERE product_id IN ("
                    + placeholders(productIds.size()) + ") FOR SHARE))";
            args.addAll(productIds);
        }
        return first(SELECT_COLUMNS + """
                 WHERE promotion_type = 'PRODUCT_DISCOUNT' AND status = 'ACTIVE'
                   AND promotion_id <> ? AND start_date < ? AND end_date > ?
                """ + productFilter + " LIMIT 1 FOR SHARE", args.toArray());
    }

    // ---- Ghi ----

    // Khóa bảng khuyến mãi tới hết transaction: hai thao tác tạo/sửa/bật cùng lúc không cùng qua bước kiểm tra trùng
    public void lockForWrite() {
        jdbc.query("SELECT promotion_id FROM promotion FOR UPDATE", rs -> {
        });
    }

    public int create(String type, String name, String description, String discountType, BigDecimal discountValue,
                      BigDecimal minOrderValue, LocalDateTime startDate, LocalDateTime endDate, Integer usageLimit,
                      String applyScope, int createdBy) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO promotion (promotion_type, name, description, discount_type, discount_value, min_order_value,
                                           start_date, end_date, usage_limit, apply_scope, status, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, type);
            ps.setString(2, name);
            ps.setString(3, description);
            ps.setString(4, discountType);
            ps.setBigDecimal(5, discountValue);
            ps.setBigDecimal(6, minOrderValue);
            ps.setTimestamp(7, Timestamp.valueOf(startDate));
            ps.setTimestamp(8, Timestamp.valueOf(endDate));
            ps.setObject(9, usageLimit, java.sql.Types.INTEGER);
            ps.setString(10, applyScope);
            ps.setInt(11, createdBy);
            return ps;
        }, keyHolder);

        if (keyHolder.getKey() == null) {
            throw new IllegalStateException("Không thể lấy ID của khuyến mãi vừa tạo.");
        }
        return keyHolder.getKey().intValue();
    }

    public int update(int id, String name, String description, String discountType, BigDecimal discountValue,
                      BigDecimal minOrderValue, LocalDateTime startDate, LocalDateTime endDate, Integer usageLimit,
                      String applyScope) {
        return jdbc.update("""
                UPDATE promotion
                SET name = ?, description = ?, discount_type = ?, discount_value = ?, min_order_value = ?,
                    start_date = ?, end_date = ?, usage_limit = ?, apply_scope = ?
                WHERE promotion_id = ?
                """,
                name, description, discountType, discountValue, minOrderValue, Timestamp.valueOf(startDate),
                Timestamp.valueOf(endDate), usageLimit, applyScope, id);
    }

    // Sửa khi đang chạy: ngày kết thúc và giới hạn lượt dùng
    public int adjust(int id, LocalDateTime endDate, Integer usageLimit) {
        return jdbc.update("UPDATE promotion SET end_date = ?, usage_limit = ? WHERE promotion_id = ?",
                Timestamp.valueOf(endDate), usageLimit, id);
    }

    public int updateStatus(int id, String status) {
        return jdbc.update("UPDATE promotion SET status = ? WHERE promotion_id = ?", status, id);
    }

    public int endAt(int id, LocalDateTime endDate) {
        return jdbc.update("UPDATE promotion SET end_date = ? WHERE promotion_id = ?", Timestamp.valueOf(endDate), id);
    }

    // promotion_product tự xóa theo (ON DELETE CASCADE)
    public int delete(int id) {
        return jdbc.update("DELETE FROM promotion WHERE promotion_id = ?", id);
    }

    public void replacePromotionProducts(int promotionId, List<Integer> productIds) {
        jdbc.update("DELETE FROM promotion_product WHERE promotion_id = ?", promotionId);
        if (productIds == null || productIds.isEmpty()) {
            return;
        }
        jdbc.batchUpdate("INSERT INTO promotion_product (promotion_id, product_id) VALUES (?, ?)",
                productIds, productIds.size(), (ps, productId) -> {
                    ps.setInt(1, promotionId);
                    ps.setInt(2, productId);
                });
    }

    private Optional<Promotion> first(String sql, Object... args) {
        return jdbc.query(sql, mapper, args).stream().findFirst();
    }

    private static String placeholders(int count) {
        return String.join(",", Collections.nCopies(count, "?"));
    }
}
