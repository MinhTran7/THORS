
package com.thors.module.product.repository;

import com.thors.module.product.dto.CreateProductRequest;
import com.thors.module.product.entity.Product;
import com.thors.module.product.mapper.ProductMapper;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;

import java.util.List;
import java.util.Map;
import java.util.Objects;

@Repository
public class ProductRepository {

    private final JdbcTemplate jdbcTemplate;

    public ProductRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    // ==========================================
    // VIEW PRODUCT LIST
    // ==========================================

    public List<Product> findAll() {

        String sql = """
            SELECT
                p.product_id,
                p.category_id,
                c.category_name,
                p.product_name,
                p.description,
                p.status,

                (
                    SELECT pi.image_url
                    FROM product_image pi
                    WHERE pi.product_id = p.product_id
                      AND pi.deleted_at IS NULL
                    ORDER BY pi.is_primary DESC, pi.image_id ASC
                    LIMIT 1
                ) AS primary_image_url,

                stats.min_price,
                stats.max_price,
                COALESCE(stats.total_stock, 0) AS total_stock,
                COALESCE(stats.variant_count, 0) AS variant_count,
                COALESCE(stats.online_variant_count, 0)
                    AS online_variant_count

            FROM product p

            INNER JOIN category c
                ON p.category_id = c.category_id

            LEFT JOIN (
                SELECT
                    product_id,
                    MIN(price) AS min_price,
                    MAX(price) AS max_price,
                    SUM(stock_quantity) AS total_stock,
                    COUNT(*) AS variant_count,
                    SUM(
                        CASE
                            WHEN online_sales_enabled = 1
                                 AND status = 'ACTIVE'
                            THEN 1
                            ELSE 0
                        END
                    ) AS online_variant_count
                FROM product_detail
                GROUP BY product_id
            ) stats
                ON p.product_id = stats.product_id

            ORDER BY p.product_id DESC
            """;

        return jdbcTemplate.query(
                sql,
                new ProductMapper()
        );
    }

    // ==========================================
    // VIEW PRODUCT DETAIL
    // ==========================================

    public Product findById(int productId) {

        String sql = """
            SELECT
                p.product_id,
                p.category_id,
                c.category_name,
                p.product_name,
                p.description,
                p.status,

                (
                    SELECT pi.image_url
                    FROM product_image pi
                    WHERE pi.product_id = p.product_id
                      AND pi.deleted_at IS NULL
                    ORDER BY pi.is_primary DESC, pi.image_id ASC
                    LIMIT 1
                ) AS primary_image_url,

                stats.min_price,
                stats.max_price,
                COALESCE(stats.total_stock, 0) AS total_stock,
                COALESCE(stats.variant_count, 0) AS variant_count,
                COALESCE(stats.online_variant_count, 0)
                    AS online_variant_count

            FROM product p

            INNER JOIN category c
                ON p.category_id = c.category_id

            LEFT JOIN (
                SELECT
                    product_id,
                    MIN(price) AS min_price,
                    MAX(price) AS max_price,
                    SUM(stock_quantity) AS total_stock,
                    COUNT(*) AS variant_count,
                    SUM(
                        CASE
                            WHEN online_sales_enabled = 1
                                 AND status = 'ACTIVE'
                            THEN 1
                            ELSE 0
                        END
                    ) AS online_variant_count
                FROM product_detail
                GROUP BY product_id
            ) stats
                ON p.product_id = stats.product_id

            WHERE p.product_id = ?
            """;

        List<Product> products = jdbcTemplate.query(
                sql,
                new ProductMapper(),
                productId
        );

        return products.isEmpty()
                ? null
                : products.get(0);
    }

    // ==========================================
    // VIEW PRODUCT VARIANTS
    // ==========================================

    public List<Map<String, Object>> findVariantsByProductId(
            int productId
    ) {

        String sql = """
            SELECT
                detail_id AS detailId,
                size,
                color,
                price,
                stock_quantity AS stockQuantity,
                online_sales_enabled AS onlineSalesEnabled,
                status
            FROM product_detail
            WHERE product_id = ?
            ORDER BY detail_id ASC
            """;

        return jdbcTemplate.queryForList(
                sql,
                productId
        );
    }

    // ==========================================
    // VIEW PRODUCT IMAGES
    // ==========================================

    public List<Map<String, Object>> findImagesByProductId(
            int productId
    ) {

        String sql = """
            SELECT
                image_id AS imageId,
                image_url AS imageUrl,
                is_primary AS isPrimary
            FROM product_image
            WHERE product_id = ?
              AND deleted_at IS NULL
            ORDER BY is_primary DESC, image_id ASC
            """;

        return jdbcTemplate.queryForList(
                sql,
                productId
        );
    }

    // ==========================================
    // ADD PRODUCT
    // ==========================================

    public int insertProduct(CreateProductRequest request) {

        String sql = """
            INSERT INTO product
                (
                    category_id,
                    product_name,
                    description,
                    status
                )
            VALUES (?, ?, ?, 'ACTIVE')
            """;

        KeyHolder keyHolder = new GeneratedKeyHolder();

        jdbcTemplate.update(connection -> {

            PreparedStatement ps = connection.prepareStatement(
                    sql,
                    Statement.RETURN_GENERATED_KEYS
            );

            ps.setInt(
                    1,
                    request.getCategoryId()
            );

            ps.setString(
                    2,
                    request.getProductName()
            );

            ps.setString(
                    3,
                    request.getDescription()
            );

            return ps;

        }, keyHolder);

        return Objects.requireNonNull(
                keyHolder.getKey(),
                "Unable to retrieve generated product ID."
        ).intValue();
    }

    // ==========================================
    // ADD PRODUCT VARIANT
    // ==========================================

    public void insertVariant(
            int productId,
            CreateProductRequest.VariantRequest variant
    ) {

        String sql = """
            INSERT INTO product_detail
                (
                    product_id,
                    size,
                    color,
                    price,
                    stock_quantity,
                    online_sales_enabled,
                    status
                )
            VALUES (?, ?, ?, ?, 0, 0, 'ACTIVE')
            """;

        jdbcTemplate.update(
                sql,
                productId,
                variant.getSize(),
                variant.getColor(),
                variant.getPrice()
        );
    }

    public Map<String, Object> getProductStatistics(int lowStockThreshold) {

        String sql = """
        SELECT
            COUNT(*) AS activeProducts,

            COALESCE(SUM(
                CASE
                    WHEN total_stock < ? THEN 1
                    ELSE 0
                END
            ), 0) AS lowStockProducts,

            COALESCE(SUM(total_stock), 0) AS availableUnits

        FROM (
            SELECT
                p.product_id,
                COALESCE(SUM(
                    CASE
                        WHEN pd.status = 'ACTIVE'
                        THEN pd.stock_quantity
                        ELSE 0
                    END
                ), 0) AS total_stock

            FROM product p

            LEFT JOIN product_detail pd
                ON p.product_id = pd.product_id

            WHERE p.status = 'ACTIVE'

            GROUP BY p.product_id
        ) product_stock
        """;

        return jdbcTemplate.queryForMap(sql, lowStockThreshold);
    }

    // ==========================================
    // UPDATE PRODUCT INFORMATION
    // ==========================================

    public int updateProduct(
            int productId,
            int categoryId,
            String productName,
            String description
    ) {
        String sql = """
            UPDATE product
            SET category_id = ?,
                product_name = ?,
                description = ?
            WHERE product_id = ?
            """;

        return jdbcTemplate.update(
                sql,
                categoryId,
                productName,
                description,
                productId
        );
    }

    // ==========================================
    // UPDATE EXISTING PRODUCT VARIANT
    // ==========================================

    public int updateVariant(
            int productId,
            int detailId,
            String size,
            String color,
            java.math.BigDecimal price
    ) {
        String sql = """
            UPDATE product_detail
            SET size = ?,
                color = ?,
                price = ?
            WHERE detail_id = ?
              AND product_id = ?
            """;

        return jdbcTemplate.update(
                sql,
                size,
                color,
                price,
                detailId,
                productId
        );
    }

    // ==========================================
    // INSERT NEW VARIANT DURING UPDATE
    // ==========================================

    public void insertNewVariant(
            int productId,
            String size,
            String color,
            java.math.BigDecimal price
    ) {
        String sql = """
            INSERT INTO product_detail (
                product_id,
                size,
                color,
                price,
                stock_quantity,
                online_sales_enabled,
                status
            )
            VALUES (?, ?, ?, ?, 0, 0, 'ACTIVE')
            """;

        jdbcTemplate.update(
                sql,
                productId,
                size,
                color,
                price
        );
    }

    public int updateProductStatus(int productId, String status) {
        String sql = """
        UPDATE product
        SET status = ?
        WHERE product_id = ?
        """;

        return jdbcTemplate.update(sql, status, productId);
    }

}
