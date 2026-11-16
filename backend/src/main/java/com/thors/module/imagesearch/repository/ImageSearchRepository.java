package com.thors.module.imagesearch.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Chỉ đọc. Cùng điều kiện "sản phẩm khách nhìn thấy trên web" với ShopRepository:
 * sản phẩm ACTIVE, danh mục ACTIVE, có biến thể ACTIVE đang bật bán online.
 */
@Repository
public class ImageSearchRepository {

    private static final String VISIBLE = """
        p.status = 'ACTIVE'
        AND EXISTS (SELECT 1 FROM category c WHERE c.category_id = p.category_id AND c.status = 'ACTIVE')
        AND EXISTS (SELECT 1 FROM product_detail pd
                    WHERE pd.product_id = p.product_id AND pd.status = 'ACTIVE' AND pd.online_sales_enabled = 1)
        """;

    /** Một ảnh sản phẩm cần có vector. */
    public record CatalogImage(long imageId, int productId, String imageUrl) {}

    private final JdbcTemplate jdbcTemplate;

    public ImageSearchRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<CatalogImage> findCatalogImages() {
        return jdbcTemplate.query("""
            SELECT pi.image_id, pi.product_id, pi.image_url
            FROM product_image pi
            INNER JOIN product p ON p.product_id = pi.product_id
            WHERE pi.deleted_at IS NULL AND pi.image_url IS NOT NULL AND
            """ + VISIBLE + " ORDER BY pi.product_id, pi.is_primary DESC, pi.image_id",
                (rs, i) -> new CatalogImage(rs.getLong("image_id"), rs.getInt("product_id"), rs.getString("image_url")));
    }

    /** Thông tin hiển thị thẻ sản phẩm (tên, danh mục, ảnh chính, giá thấp/cao nhất) của các sản phẩm còn hiện trên web. */
    public List<Map<String, Object>> findProductCards(Collection<Integer> productIds) {
        if (productIds.isEmpty()) {
            return Collections.emptyList();
        }
        String marks = String.join(",", Collections.nCopies(productIds.size(), "?"));
        return jdbcTemplate.queryForList("""
            SELECT p.product_id AS productId,
                   p.product_name AS productName,
                   (SELECT c.category_name FROM category c WHERE c.category_id = p.category_id) AS categoryName,
                   (SELECT pi.image_url FROM product_image pi
                     WHERE pi.product_id = p.product_id AND pi.deleted_at IS NULL
                     ORDER BY pi.is_primary DESC, pi.image_id ASC LIMIT 1) AS imageUrl,
                   (SELECT MIN(pd.price) FROM product_detail pd
                     WHERE pd.product_id = p.product_id AND pd.status = 'ACTIVE' AND pd.online_sales_enabled = 1) AS minPrice,
                   (SELECT MAX(pd.price) FROM product_detail pd
                     WHERE pd.product_id = p.product_id AND pd.status = 'ACTIVE' AND pd.online_sales_enabled = 1) AS maxPrice
            FROM product p
            WHERE p.product_id IN (""" + marks + ") AND " + VISIBLE,
                productIds.toArray());
    }
}
