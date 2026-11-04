package com.thors.module.shop.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Sản phẩm đang có khuyến mãi (công khai), dùng cho banner trang chủ. */
@Repository
public class ShopPromotionRepository {

    // Giả định bảng promotion_product(promotion_id, product_id). Nếu tên cột khác, sửa ở đây.
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
               pr.discount_value AS discountValue,
               pr.max_discount_amount AS maxDiscountAmount
        FROM promotion pr
        INNER JOIN promotion_product pp ON pp.promotion_id = pr.promotion_id
        INNER JOIN product p ON p.product_id = pp.product_id AND p.status = 'ACTIVE'
        INNER JOIN category c ON c.category_id = p.category_id AND c.status = 'ACTIVE'
        INNER JOIN product_detail pd
            ON pd.product_id = p.product_id AND pd.status = 'ACTIVE' AND pd.online_sales_enabled = 1
        WHERE pr.status = 'ACTIVE' AND CURDATE() BETWEEN pr.start_date AND pr.end_date
        GROUP BY p.product_id, p.product_name, c.category_name,
                 pr.promotion_id, pr.name, pr.discount_type, pr.discount_value, pr.max_discount_amount
        ORDER BY pr.promotion_id DESC
        LIMIT 60
        """;

    private final JdbcTemplate jdbcTemplate;

    public ShopPromotionRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** Mỗi sản phẩm chỉ giữ khuyến mãi giảm nhiều nhất; kèm giá sau giảm và nhãn giảm giá. */
    public List<Map<String, Object>> findPromotedProducts(int limit) {
        Map<Object, Map<String, Object>> best = new LinkedHashMap<>();
        Map<Object, BigDecimal> bestDiscount = new HashMap<>();

        for (Map<String, Object> row : jdbcTemplate.queryForList(SQL)) {
            BigDecimal minPrice = dec(row.get("minPrice"));
            String type = String.valueOf(row.get("discountType"));
            BigDecimal value = dec(row.get("discountValue"));
            BigDecimal max = row.get("maxDiscountAmount") == null ? null : dec(row.get("maxDiscountAmount"));

            BigDecimal discount;
            if ("PERCENT".equals(type)) {
                discount = minPrice.multiply(value).divide(BigDecimal.valueOf(100), 0, RoundingMode.DOWN);
                if (max != null && discount.compareTo(max) > 0) discount = max;
            } else {
                discount = value;
            }
            if (discount.compareTo(minPrice) > 0) discount = minPrice;
            if (discount.signum() <= 0) continue;

            Object id = row.get("productId");
            BigDecimal current = bestDiscount.get(id);
            if (current != null && current.compareTo(discount) >= 0) continue;

            Map<String, Object> item = new LinkedHashMap<>(row);
            item.put("salePrice", minPrice.subtract(discount));
            item.put("discountLabel", "PERCENT".equals(type)
                    ? "-" + value.stripTrailingZeros().toPlainString() + "%"
                    : "-" + String.format("%,d", discount.longValue()).replace(',', '.') + " ₫");
            best.put(id, item);
            bestDiscount.put(id, discount);
        }
        return best.values().stream().limit(Math.max(limit, 1)).toList();
    }

    private static BigDecimal dec(Object value) {
        return new BigDecimal(String.valueOf(value));
    }
}