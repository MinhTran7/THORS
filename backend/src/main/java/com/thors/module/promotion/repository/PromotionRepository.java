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
import java.util.Collections;
import java.util.List;
import java.util.Optional;

@Repository
public class PromotionRepository {

    private static final String SELECT_COLUMNS = """
            SELECT promotion_id,
                   name,
                   description,
                   discount_value,
                   start_date,
                   end_date,
                   status,
                   created_by,
                   discount_type,
                   min_order_value,
                   max_discount_amount,
                   usage_limit,
                   apply_scope
            FROM promotion
            """;

    private final JdbcTemplate jdbc;
    private final PromotionMapper mapper = new PromotionMapper();

    public PromotionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Promotion> findAll() {
        return jdbc.query(
                SELECT_COLUMNS + " ORDER BY promotion_id DESC",
                mapper
        );
    }

    public List<Promotion> findAvailable(LocalDateTime now) {
        return jdbc.query(
                SELECT_COLUMNS + """
                         WHERE status = 'ACTIVE'
                           AND start_date <= ?
                           AND end_date > ?
                         ORDER BY end_date ASC, promotion_id DESC
                        """,
                mapper,
                Timestamp.valueOf(now),
                Timestamp.valueOf(now)
        );
    }

    public Optional<Promotion> findById(int id) {
        return jdbc.query(
                SELECT_COLUMNS + " WHERE promotion_id = ?",
                mapper,
                id
        ).stream().findFirst();
    }

    public Optional<Promotion> findAvailableById(
            int id,
            LocalDateTime now
    ) {
        return jdbc.query(
                SELECT_COLUMNS + """
                         WHERE promotion_id = ?
                           AND status = 'ACTIVE'
                           AND start_date <= ?
                           AND end_date > ?
                        """,
                mapper,
                id,
                Timestamp.valueOf(now),
                Timestamp.valueOf(now)
        ).stream().findFirst();
    }

    public int create(
            String name,
            String description,
            String discountType,
            BigDecimal discountValue,
            BigDecimal minOrderValue,
            BigDecimal maxDiscountAmount,
            LocalDateTime startDate,
            LocalDateTime endDate,
            Integer usageLimit,
            String applyScope,
            int createdBy
    ) {
        KeyHolder keyHolder = new GeneratedKeyHolder();

        int inserted = jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    """
                    INSERT INTO promotion (
                        name,
                        description,
                        discount_type,
                        discount_value,
                        min_order_value,
                        max_discount_amount,
                        start_date,
                        end_date,
                        usage_limit,
                        apply_scope,
                        status,
                        created_by
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
                    """,
                    Statement.RETURN_GENERATED_KEYS
            );

            statement.setString(1, name);
            statement.setString(2, description);
            statement.setString(3, discountType);
            statement.setBigDecimal(4, discountValue);
            statement.setBigDecimal(5, minOrderValue);
            statement.setBigDecimal(6, maxDiscountAmount);
            statement.setTimestamp(7, Timestamp.valueOf(startDate));
            statement.setTimestamp(8, Timestamp.valueOf(endDate));

            if (usageLimit == null) {
                statement.setNull(9, java.sql.Types.INTEGER);
            } else {
                statement.setInt(9, usageLimit);
            }

            statement.setString(10, applyScope);
            statement.setInt(11, createdBy);

            return statement;
        }, keyHolder);

        if (inserted != 1 || keyHolder.getKey() == null) {
            throw new IllegalStateException(
                    "Không thể lấy ID của khuyến mãi vừa tạo."
            );
        }

        return keyHolder.getKey().intValue();
    }

    public int update(
            int id,
            String name,
            String description,
            String discountType,
            BigDecimal discountValue,
            BigDecimal minOrderValue,
            BigDecimal maxDiscountAmount,
            LocalDateTime startDate,
            LocalDateTime endDate,
            Integer usageLimit,
            String applyScope
    ) {
        return jdbc.update(
                """
                UPDATE promotion
                SET name = ?,
                    description = ?,
                    discount_type = ?,
                    discount_value = ?,
                    min_order_value = ?,
                    max_discount_amount = ?,
                    start_date = ?,
                    end_date = ?,
                    usage_limit = ?,
                    apply_scope = ?
                WHERE promotion_id = ?
                """,
                name,
                description,
                discountType,
                discountValue,
                minOrderValue,
                maxDiscountAmount,
                Timestamp.valueOf(startDate),
                Timestamp.valueOf(endDate),
                usageLimit,
                applyScope,
                id
        );
    }

    public List<Integer> findProductIds(int promotionId) {
        return jdbc.queryForList(
                """
                SELECT product_id
                FROM promotion_product
                WHERE promotion_id = ?
                ORDER BY product_id
                """,
                Integer.class,
                promotionId
        );
    }

    public void replacePromotionProducts(
            int promotionId,
            List<Integer> productIds
    ) {
        jdbc.update(
                "DELETE FROM promotion_product WHERE promotion_id = ?",
                promotionId
        );

        if (productIds == null || productIds.isEmpty()) {
            return;
        }

        jdbc.batchUpdate(
                """
                INSERT INTO promotion_product (promotion_id, product_id)
                VALUES (?, ?)
                """,
                productIds,
                productIds.size(),
                (statement, productId) -> {
                    statement.setInt(1, promotionId);
                    statement.setInt(2, productId);
                }
        );
    }

    public int countActiveProducts(List<Integer> productIds) {
        if (productIds == null || productIds.isEmpty()) {
            return 0;
        }

        String placeholders = String.join(
                ",",
                Collections.nCopies(productIds.size(), "?")
        );

        Integer count = jdbc.queryForObject(
                """
                SELECT COUNT(*)
                FROM product
                WHERE status = 'ACTIVE'
                  AND product_id IN (
                """ + placeholders + ")",
                Integer.class,
                productIds.toArray()
        );

        return count == null ? 0 : count;
    }

    public int updateStatus(int id, String status) {
        return jdbc.update(
                "UPDATE promotion SET status = ? WHERE promotion_id = ?",
                status,
                id
        );
    }
}