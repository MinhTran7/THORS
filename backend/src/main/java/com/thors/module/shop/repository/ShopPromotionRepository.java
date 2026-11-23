package com.thors.module.shop.repository;

import com.thors.module.promotion.entity.Promotion;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Repository
public class ShopPromotionRepository {

    private static final String SQL = """
        SELECT p.product_id AS productId,
               p.product_name AS productName,
               c.category_name AS categoryName,
               (SELECT pi.image_url FROM product_image pi
                 WHERE pi.product_id = p.product_id AND pi.deleted_at IS NULL
                 ORDER BY pi.is_primary DESC, pi.image_id ASC LIMIT 1) AS imageUrl,
               MIN(pd.price) AS minPrice,
               MAX(pd.price) AS maxPrice,
               pr.name AS promotionName,
               pr.discount_type AS discountType,
               pr.discount_value AS discountValue
        FROM promotion pr
        INNER JOIN product p ON p.status = 'ACTIVE'
            AND (pr.apply_scope = 'ALL' OR EXISTS (
                SELECT 1 FROM promotion_product pp
                WHERE pp.promotion_id = pr.promotion_id AND pp.product_id = p.product_id))
        INNER JOIN category c ON c.category_id = p.category_id AND c.status = 'ACTIVE'
        INNER JOIN product_detail pd
            ON pd.product_id = p.product_id AND pd.status = 'ACTIVE' AND pd.online_sales_enabled = 1
        WHERE pr.status = 'ACTIVE'
          AND COALESCE(pr.min_order_value, 0) = 0
          AND pr.start_date <= ?
          AND pr.end_date > ?
        GROUP BY p.product_id, p.product_name, c.category_name,
                 pr.promotion_id, pr.name, pr.discount_type, pr.discount_value
        ORDER BY pr.promotion_id DESC, p.product_id DESC
        """;

    private final JdbcTemplate jdbcTemplate;

    public ShopPromotionRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<Map<String, Object>> findPromotedProducts() {
        Timestamp now = Timestamp.valueOf(LocalDateTime.now());
        Map<Object, Map<String, Object>> items = new LinkedHashMap<>();
        for (Map<String, Object> row : jdbcTemplate.queryForList(SQL, now, now)) {
            if (items.containsKey(row.get("productId"))) continue;
            String type = String.valueOf(row.get("discountType"));
            BigDecimal value = (BigDecimal) row.get("discountValue");
            BigDecimal minPrice = (BigDecimal) row.get("minPrice");
            row.put("salePrice", minPrice.subtract(Promotion.discountOf(minPrice, type, value)));
            row.put("discountLabel", "PERCENT".equals(type)
                    ? "-" + value.stripTrailingZeros().toPlainString() + "%"
                    : "-" + String.format("%,d", value.longValue()).replace(',', '.') + " ₫");
            items.put(row.get("productId"), row);
        }
        return List.copyOf(items.values());
    }
}
