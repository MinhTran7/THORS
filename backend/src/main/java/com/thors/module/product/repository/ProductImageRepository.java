
package com.thors.module.product.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ProductImageRepository {

    private final JdbcTemplate jdbcTemplate;

    public ProductImageRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    // Save product image information to MySQL
    public void insertImage(
            int productId,
            String imageUrl,
            String publicId,
            boolean isPrimary
    ) {
        String sql = """
                INSERT INTO product_image
                (product_id, image_url, cloud_public_id, is_primary)
                VALUES (?, ?, ?, ?)
                """;

        jdbcTemplate.update(
                sql,
                productId,
                imageUrl,
                publicId,
                isPrimary ? 1 : 0
        );
    }
}
