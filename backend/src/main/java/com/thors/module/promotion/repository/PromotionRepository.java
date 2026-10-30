
package com.thors.module.promotion.repository;

import com.thors.module.promotion.entity.Promotion;
import com.thors.module.promotion.mapper.PromotionMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
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
                   usage_limit
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

    public List<Promotion> findAvailable(LocalDate today) {
        return jdbc.query(
                SELECT_COLUMNS + """
                         WHERE status = 'ACTIVE'
                           AND start_date <= ?
                           AND end_date >= ?
                         ORDER BY end_date ASC, promotion_id DESC
                        """,
                mapper,
                today,
                today
        );
    }

    public Optional<Promotion> findById(int id) {
        return jdbc.query(
                SELECT_COLUMNS + " WHERE promotion_id = ?",
                mapper,
                id
        ).stream().findFirst();
    }

    public Optional<Promotion> findAvailableById(int id, LocalDate today) {
        return jdbc.query(
                SELECT_COLUMNS + """
                         WHERE promotion_id = ?
                           AND status = 'ACTIVE'
                           AND start_date <= ?
                           AND end_date >= ?
                        """,
                mapper,
                id,
                today,
                today
        ).stream().findFirst();
    }

    public int update(
            int id,
            String name,
            String description,
            String discountType,
            BigDecimal discountValue,
            BigDecimal minOrderValue,
            BigDecimal maxDiscountAmount,
            LocalDate startDate,
            LocalDate endDate,
            Integer usageLimit
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
                    usage_limit = ?
                WHERE promotion_id = ?
                """,
                name,
                description,
                discountType,
                discountValue,
                minOrderValue,
                maxDiscountAmount,
                startDate,
                endDate,
                usageLimit,
                id
        );
    }

    public int updateStatus(int id, String status) {
        return jdbc.update(
                "UPDATE promotion SET status = ? WHERE promotion_id = ?",
                status,
                id
        );
    }
}
