package com.thors.module.shop.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Truy vấn công khai cho trang cửa hàng: chỉ trả sản phẩm đang bán online. */
@Repository
public class ShopRepository {

    private static final String FROM_WHERE = """
        FROM product p
        INNER JOIN category c
            ON c.category_id = p.category_id AND c.status = 'ACTIVE'
        INNER JOIN product_detail pd
            ON pd.product_id = p.product_id
           AND pd.status = 'ACTIVE'
           AND pd.online_sales_enabled = 1
        WHERE p.status = 'ACTIVE'
        """;

    private final JdbcTemplate jdbcTemplate;

    public ShopRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<Map<String, Object>> findCategories() {
        return jdbcTemplate.queryForList("""
            SELECT category_id AS categoryId, category_name AS categoryName
            FROM category
            WHERE status = 'ACTIVE'
            ORDER BY category_name
            """);
    }

    public List<Map<String, Object>> findProducts(String q, Integer categoryId, String sort, int page, int size) {
        List<Object> args = new ArrayList<>();
        String filter = buildFilter(q, categoryId, args);

        String orderBy = switch (sort == null ? "" : sort) {
            case "price_asc" -> "MIN(pd.price) ASC, p.product_id DESC";
            case "price_desc" -> "MIN(pd.price) DESC, p.product_id DESC";
            default -> "p.product_id DESC";
        };

        String sql = """
            SELECT p.product_id AS productId,
                   p.product_name AS productName,
                   c.category_name AS categoryName,
                   (SELECT pi.image_url FROM product_image pi
                     WHERE pi.product_id = p.product_id AND pi.deleted_at IS NULL
                     ORDER BY pi.is_primary DESC, pi.image_id ASC LIMIT 1) AS imageUrl,
                   MIN(pd.price) AS minPrice,
                   MAX(pd.price) AS maxPrice,
                   SUM(pd.stock_quantity) AS totalStock
            """ + FROM_WHERE + filter + """
            GROUP BY p.product_id, p.product_name, c.category_name
            ORDER BY """ + " " + orderBy + " LIMIT ? OFFSET ?";

        args.add(size);
        args.add(page * size);
        return jdbcTemplate.queryForList(sql, args.toArray());
    }

    public int countProducts(String q, Integer categoryId) {
        List<Object> args = new ArrayList<>();
        String filter = buildFilter(q, categoryId, args);
        Integer total = jdbcTemplate.queryForObject(
                "SELECT COUNT(DISTINCT p.product_id) " + FROM_WHERE + filter, Integer.class, args.toArray());
        return total == null ? 0 : total;
    }

    /** Null nếu sản phẩm không tồn tại hoặc không được bán online. */
    public Map<String, Object> findProduct(int productId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
            SELECT p.product_id AS productId,
                   p.product_name AS productName,
                   p.description AS description,
                   c.category_name AS categoryName
            """ + FROM_WHERE + " AND p.product_id = ? GROUP BY p.product_id, p.product_name, p.description, c.category_name",
                productId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public List<String> findImageUrls(int productId) {
        return jdbcTemplate.queryForList("""
            SELECT image_url FROM product_image
            WHERE product_id = ? AND deleted_at IS NULL
            ORDER BY is_primary DESC, image_id ASC
            """, String.class, productId);
    }

    /** Tồn có thể bán = tồn vật lý trừ lượng đang giữ cho đơn hàng. */
    public List<Map<String, Object>> findVariants(int productId) {
        return jdbcTemplate.queryForList("""
            SELECT pd.detail_id AS detailId,
                   pd.size AS size,
                   pd.color AS color,
                   pd.price AS price,
                   GREATEST(
                       pd.stock_quantity - COALESCE((
                           SELECT SUM(oi.reserved_quantity)
                           FROM order_item oi
                           INNER JOIN orders o ON o.order_id = oi.order_id
                           WHERE oi.detail_id = pd.detail_id
                             AND o.stock_hold_status IN ('TEMPORARY', 'PAID')
                       ), 0),
                       0
                   ) AS stock
            FROM product_detail pd
            WHERE pd.product_id = ?
              AND pd.status = 'ACTIVE'
              AND pd.online_sales_enabled = 1
            ORDER BY pd.detail_id ASC
            """, productId);
    }

    private String buildFilter(String q, Integer categoryId, List<Object> args) {
        StringBuilder sb = new StringBuilder();
        if (q != null && !q.isBlank()) {
            String text = q.trim();
            if (text.length() > 100) text = text.substring(0, 100);
            String like = "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
            sb.append(" AND p.product_name LIKE ? ");
            args.add(like);
        }
        if (categoryId != null && categoryId > 0) {
            sb.append(" AND p.category_id = ? ");
            args.add(categoryId);
        }
        return sb.toString();
    }
}