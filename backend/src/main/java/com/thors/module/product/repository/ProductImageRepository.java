
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

    // Số ảnh đang dùng (chưa xóa mềm) của sản phẩm
    public int countActiveImages(int productId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM product_image WHERE product_id = ? AND deleted_at IS NULL",
                Integer.class,
                productId
        );
        return count != null ? count : 0;
    }

    // Ảnh đang dùng có thuộc sản phẩm này không
    public boolean existsActiveImage(int productId, int imageId) {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*) FROM product_image
                WHERE image_id = ? AND product_id = ? AND deleted_at IS NULL
                """,
                Integer.class,
                imageId,
                productId
        );
        return count != null && count > 0;
    }

    // Xóa mềm ảnh (schema quy ước giữ lịch sử bằng deleted_at); bỏ cờ ảnh chính
    public int softDeleteImage(int productId, int imageId) {
        return jdbcTemplate.update(
                """
                UPDATE product_image
                SET deleted_at = CURRENT_TIMESTAMP, is_primary = 0
                WHERE image_id = ? AND product_id = ? AND deleted_at IS NULL
                """,
                imageId,
                productId
        );
    }

    // Đặt đúng một ảnh chính cho sản phẩm
    public void setPrimaryImage(int productId, int imageId) {
        jdbcTemplate.update(
                "UPDATE product_image SET is_primary = 0 WHERE product_id = ? AND deleted_at IS NULL",
                productId
        );
        jdbcTemplate.update(
                "UPDATE product_image SET is_primary = 1 WHERE image_id = ? AND product_id = ? AND deleted_at IS NULL",
                imageId,
                productId
        );
    }

    // Nếu sản phẩm không còn ảnh chính (vd. vừa xóa ảnh chính) thì lấy ảnh cũ nhất còn lại làm ảnh chính
    public void ensurePrimaryImage(int productId) {
        Integer primaryCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*) FROM product_image
                WHERE product_id = ? AND deleted_at IS NULL AND is_primary = 1
                """,
                Integer.class,
                productId
        );
        if (primaryCount != null && primaryCount > 0) {
            return;
        }
        java.util.List<Integer> ids = jdbcTemplate.queryForList(
                """
                SELECT image_id FROM product_image
                WHERE product_id = ? AND deleted_at IS NULL
                ORDER BY image_id ASC
                LIMIT 1
                """,
                Integer.class,
                productId
        );
        if (!ids.isEmpty()) {
            setPrimaryImage(productId, ids.get(0));
        }
    }
}
