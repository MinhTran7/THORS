package com.thors.module.shop.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

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

    // Số lượng đã bán của sản phẩm p (đơn đã giao hoặc hoàn tất, gồm cả bán tại quầy;
    // không tính đơn hủy, hết hạn, bị từ chối)
    private static final String SOLD_QTY = """
        SELECT COALESCE(SUM(oi.quantity), 0)
        FROM order_item oi
        JOIN product_detail d ON d.detail_id = oi.detail_id
        JOIN orders o ON o.order_id = oi.order_id
        WHERE d.product_id = p.product_id
          AND o.order_status IN ('DELIVERED', 'COMPLETED')
        """;

    private final JdbcTemplate jdbcTemplate;

    public ShopRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    // parentId: danh mục cha (null = danh mục lớn), để web dựng menu danh mục lớn -> danh mục con
    public List<Map<String, Object>> findCategories() {
        return jdbcTemplate.queryForList("""
            SELECT category_id AS categoryId, category_name AS categoryName, parent_id AS parentId
            FROM category
            WHERE status = 'ACTIVE'
            ORDER BY category_name
            """);
    }

    public List<Map<String, Object>> findProducts(String q, Integer categoryId, String sort, int page, int size) {
        return findProducts(q, categoryId, null, sort, page, size);
    }

    public List<Map<String, Object>> findProducts(String q, Integer categoryId, Integer promotionId, String sort, int page, int size) {
        List<Object> args = new ArrayList<>();
        String filter = buildFilter(q, categoryId, promotionId, args);

        String orderBy = switch (sort == null ? "" : sort) {
            case "price_asc" -> "MIN(pd.price) ASC, p.product_id DESC";
            case "price_desc" -> "MIN(pd.price) DESC, p.product_id DESC";
            // Bán chạy: bán được nhiều nhất đứng đầu
            case "best_selling" -> "(" + SOLD_QTY + ") DESC, p.product_id DESC";
            default -> "p.product_id DESC";
        };
        // Bán chạy: chỉ lấy sản phẩm đã bán được ít nhất 1 cái
        if ("best_selling".equals(sort)) {
            filter += " AND (" + SOLD_QTY + ") > 0 ";
        }

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
        return countProducts(q, categoryId, null);
    }

    public int countProducts(String q, Integer categoryId, Integer promotionId) {
        List<Object> args = new ArrayList<>();
        String filter = buildFilter(q, categoryId, promotionId, args);
        Integer total = jdbcTemplate.queryForObject(
                "SELECT COUNT(DISTINCT p.product_id) " + FROM_WHERE + filter, Integer.class, args.toArray());
        return total == null ? 0 : total;
    }

    public Map<String, Object> findProduct(int productId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
            SELECT p.product_id AS productId,
                   p.product_name AS productName,
                   p.description AS description,
                   p.category_id AS categoryId,
                   c.category_name AS categoryName
            """ + FROM_WHERE + " AND p.product_id = ? GROUP BY p.product_id, p.product_name, p.description, p.category_id, c.category_name",
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

    private String buildFilter(String q, Integer categoryId, Integer promotionId, List<Object> args) {
        StringBuilder sb = new StringBuilder();
        if (q != null && !q.isBlank()) {
            String text = q.trim();
            if (text.length() > 100) text = text.substring(0, 100);
            String like = "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
            sb.append(" AND p.product_name LIKE ? ");
            args.add(like);
        }
        if (categoryId != null && categoryId > 0) {
            // Lấy cả sản phẩm thuộc danh mục con, cháu... (vd chọn "Giày" ra cả Giày nam, Giày cao gót)
            sb.append("""
                 AND p.category_id IN (
                    WITH RECURSIVE sub AS (
                        SELECT category_id FROM category WHERE category_id = ?
                        UNION ALL
                        SELECT ch.category_id FROM category ch JOIN sub ON ch.parent_id = sub.category_id
                    )
                    SELECT category_id FROM sub
                 )
                """);
            args.add(categoryId);
        }
        if (promotionId != null && promotionId > 0) {
            sb.append(" AND ((SELECT apply_scope FROM promotion WHERE promotion_id = ?) = 'ALL' OR p.product_id IN (SELECT product_id FROM promotion_product WHERE promotion_id = ?)) ");
            args.add(promotionId);
            args.add(promotionId);
        }
        return sb.toString();
    }
}
