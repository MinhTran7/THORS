package com.thors.module.promotion.repository;

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
import java.util.List;
import java.util.Optional;

@Repository
public class PromotionRepository {

    // used_count: số đơn đã dùng mã (trừ đơn hủy, bị từ chối, hết hạn)
    private static final String SELECT_COLUMNS = """
            SELECT promotion_id, name, description, discount_value, start_date, end_date, status, created_by,
                   discount_type, min_order_value, usage_limit, apply_scope,
                   (SELECT COUNT(*) FROM orders o
                    WHERE o.promotion_id = promotion.promotion_id
                      AND o.order_status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED')) AS used_count
            FROM promotion
            """;

    // Khuyến mãi sản phẩm (không có đơn tối thiểu) đang bật và đang chạy tại thời điểm ?
    private static final String RUNNING_PRODUCT = """
             WHERE status = 'ACTIVE' AND COALESCE(min_order_value, 0) = 0 AND start_date <= ? AND end_date > ?
            """;

    private final JdbcTemplate jdbc;
    private final PromotionMapper mapper = new PromotionMapper();

    public PromotionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Promotion> findAll() {
        return jdbc.query(SELECT_COLUMNS + " ORDER BY promotion_id DESC", mapper);
    }

    public List<Promotion> findAvailable(LocalDateTime now) {
        return jdbc.query(SELECT_COLUMNS + " WHERE status = 'ACTIVE' AND end_date > ? ORDER BY end_date ASC, promotion_id DESC",
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

    public Optional<Promotion> findAvailableById(int id, LocalDateTime now) {
        Timestamp time = Timestamp.valueOf(now);
        return first(SELECT_COLUMNS + " WHERE promotion_id = ? AND status = 'ACTIVE' AND start_date <= ? AND end_date > ?", id, time, time);
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

    public int create(String name, String description, String discountType, BigDecimal discountValue,
                      BigDecimal minOrderValue, LocalDateTime startDate, LocalDateTime endDate, Integer usageLimit,
                      String applyScope, int createdBy) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO promotion (name, description, discount_type, discount_value, min_order_value, start_date,
                                           end_date, usage_limit, apply_scope, status, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, name);
            ps.setString(2, description);
            ps.setString(3, discountType);
            ps.setBigDecimal(4, discountValue);
            ps.setBigDecimal(5, minOrderValue);
            ps.setTimestamp(6, Timestamp.valueOf(startDate));
            ps.setTimestamp(7, Timestamp.valueOf(endDate));
            ps.setObject(8, usageLimit, java.sql.Types.INTEGER);
            ps.setString(9, applyScope);
            ps.setInt(10, createdBy);
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

    public int updateStatus(int id, String status) {
        return jdbc.update("UPDATE promotion SET status = ? WHERE promotion_id = ?", status, id);
    }

    public List<Integer> findProductIds(int promotionId) {
        return jdbc.queryForList("SELECT product_id FROM promotion_product WHERE promotion_id = ? ORDER BY product_id",
                Integer.class, promotionId);
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
                    + placeholders(productIds.size()) + ")))";
            args.addAll(productIds);
        }
        return first(SELECT_COLUMNS + """
                 WHERE status = 'ACTIVE' AND COALESCE(min_order_value, 0) = 0
                   AND promotion_id <> ? AND start_date < ? AND end_date > ?
                """ + productFilter + " LIMIT 1", args.toArray());
    }

    private Optional<Promotion> first(String sql, Object... args) {
        return jdbc.query(sql, mapper, args).stream().findFirst();
    }

    private static String placeholders(int count) {
        return String.join(",", Collections.nCopies(count, "?"));
    }
}
