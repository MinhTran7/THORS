
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
        try {
            return jdbcTemplate.query(listSql(true, true), new ProductMapper());
        } catch (org.springframework.jdbc.BadSqlGrammarException e) {
            // Database chưa chạy migration 2026-11-10_product_sku.sql (chưa có product.sku)
            // và/hoặc 2026-11-06_inventory.sql (chưa có min_stock_quantity): lùi dần, vẫn trả danh sách
            try {
                return jdbcTemplate.query(listSql(true, false), new ProductMapper());
            } catch (org.springframework.jdbc.BadSqlGrammarException e2) {
                return jdbcTemplate.query(listSql(false, false), new ProductMapper());
            }
        }
    }

    /**
     * Danh sách sản phẩm. Tồn kho, giá chỉ tính biến thể đang hoạt động; "có thể bán", "hết hàng",
     * "sắp hết" dùng cùng công thức màn hình Tồn kho (WarehouseInventory): có thể bán = tồn − đang giữ
     * cho đơn; hết hàng khi tồn = 0; sắp hết khi có ngưỡng tối thiểu và có thể bán ≤ ngưỡng.
     */
    private static String listSql(boolean withThreshold, boolean withSku) {
        String lowExpr = withThreshold
                ? """
                  SUM(CASE WHEN d.status = 'ACTIVE' AND d.stock_quantity > 0
                           AND d.min_stock_quantity IS NOT NULL
                           AND d.stock_quantity - COALESCE(h.held, 0) <= d.min_stock_quantity
                      THEN 1 ELSE 0 END)"""
                : "0";

        return """
            SELECT
                p.product_id,
                %s
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
                    AS online_variant_count,
                COALESCE(stats.active_variant_count, 0) AS active_variant_count,
                COALESCE(stats.sellable_stock, 0) AS sellable_stock,
                COALESCE(stats.out_variant_count, 0) AS out_variant_count,
                COALESCE(stats.low_variant_count, 0) AS low_variant_count,
                stats.search_text

            FROM product p

            INNER JOIN category c
                ON p.category_id = c.category_id

            LEFT JOIN (
                SELECT
                    d.product_id,
                    MIN(CASE WHEN d.status = 'ACTIVE' THEN d.price END) AS min_price,
                    MAX(CASE WHEN d.status = 'ACTIVE' THEN d.price END) AS max_price,
                    SUM(CASE WHEN d.status = 'ACTIVE' THEN d.stock_quantity ELSE 0 END) AS total_stock,
                    COUNT(*) AS variant_count,
                    SUM(CASE WHEN d.status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_variant_count,
                    SUM(
                        CASE
                            WHEN d.online_sales_enabled = 1
                                 AND d.status = 'ACTIVE'
                            THEN 1
                            ELSE 0
                        END
                    ) AS online_variant_count,
                    SUM(CASE WHEN d.status = 'ACTIVE'
                             THEN GREATEST(d.stock_quantity - COALESCE(h.held, 0), 0) ELSE 0 END) AS sellable_stock,
                    SUM(CASE WHEN d.status = 'ACTIVE' AND d.stock_quantity = 0 THEN 1 ELSE 0 END) AS out_variant_count,
                    %s AS low_variant_count,
                    GROUP_CONCAT(CONCAT_WS(' ', d.barcode, d.size, d.color) SEPARATOR ' ') AS search_text
                FROM product_detail d
                LEFT JOIN (
                    SELECT detail_id, SUM(reserved_quantity) AS held
                    FROM order_item
                    WHERE reserved_quantity > 0
                    GROUP BY detail_id
                ) h ON h.detail_id = d.detail_id
                GROUP BY d.product_id
            ) stats
                ON p.product_id = stats.product_id

            ORDER BY p.product_id DESC
            """.formatted(withSku ? "p.sku," : "", lowExpr);
    }

    // ==========================================
    // BÁN ONLINE (online_sales_enabled)
    // ==========================================

    /** Bật/tắt bán online cho mọi biến thể đang hoạt động (bật: chỉ biến thể đã có giá). */
    public int updateProductOnline(int productId, boolean enabled) {
        return jdbcTemplate.update(
                enabled
                        ? """
                          UPDATE product_detail SET online_sales_enabled = 1
                          WHERE product_id = ? AND status = 'ACTIVE' AND price IS NOT NULL
                          """
                        : "UPDATE product_detail SET online_sales_enabled = 0 WHERE product_id = ?",
                productId
        );
    }

    public int updateVariantOnline(int productId, int detailId, boolean enabled) {
        return jdbcTemplate.update(
                "UPDATE product_detail SET online_sales_enabled = ? WHERE detail_id = ? AND product_id = ?",
                enabled ? 1 : 0,
                detailId,
                productId
        );
    }

    /** Số biến thể đang hoạt động, đã có giá (mới bật bán online được). */
    public int countSellableVariants(int productId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM product_detail WHERE product_id = ? AND status = 'ACTIVE' AND price IS NOT NULL",
                Integer.class,
                productId
        );
        return count != null ? count : 0;
    }

    /** Ngưỡng tồn tối thiểu từng biến thể; DB chưa chạy migration thì trả map rỗng. */
    public Map<Integer, Integer> findMinStockByProductId(int productId) {
        Map<Integer, Integer> result = new java.util.HashMap<>();
        try {
            jdbcTemplate.query(
                    "SELECT detail_id, min_stock_quantity FROM product_detail WHERE product_id = ?",
                    rs -> {
                        int min = rs.getInt("min_stock_quantity");
                        if (!rs.wasNull()) {
                            result.put(rs.getInt("detail_id"), min);
                        }
                    },
                    productId
            );
        } catch (org.springframework.jdbc.BadSqlGrammarException e) {
            return Map.of();
        }
        return result;
    }

    // ==========================================
    // CHẶN XÓA SẢN PHẨM
    // ==========================================

    /**
     * Lý do không xóa được sản phẩm (đã phát sinh dữ liệu khác trỏ tới). Rỗng = xóa được.
     * Gồm mọi bảng có khóa ngoại tới product / product_detail mà không thuộc phần dữ liệu riêng
     * của sản phẩm (ảnh, giỏ hàng, image_search được dọn ở deleteProductCascaded).
     */
    public List<String> findDeleteBlockers(int productId) {
        List<String> reasons = new java.util.ArrayList<>();
        addBlocker(reasons, "đơn hàng",
                "SELECT COUNT(*) FROM order_item oi JOIN product_detail pd ON oi.detail_id = pd.detail_id WHERE pd.product_id = ?",
                productId);
        addBlocker(reasons, "phiếu nhập / đặt hàng nhập",
                "SELECT COUNT(*) FROM stock_receipt_item sri JOIN product_detail pd ON sri.detail_id = pd.detail_id WHERE pd.product_id = ?",
                productId);
        addBlocker(reasons, "vị trí trên kệ",
                "SELECT COUNT(*) FROM product_location pl JOIN product_detail pd ON pl.detail_id = pd.detail_id WHERE pd.product_id = ?",
                productId);
        addBlocker(reasons, "lịch sử điều chỉnh kho",
                "SELECT COUNT(*) FROM stock_adjustment sa JOIN product_detail pd ON sa.detail_id = pd.detail_id WHERE pd.product_id = ?",
                productId);
        // promotion_product có ON DELETE CASCADE: xóa sản phẩm thì tự gỡ khỏi khuyến mãi, không chặn
        addBlocker(reasons, "phiếu kiểm kê",
                "SELECT COUNT(*) FROM stock_count_item sci JOIN product_detail pd ON sci.detail_id = pd.detail_id WHERE pd.product_id = ?",
                productId);
        return reasons;
    }

    private void addBlocker(List<String> reasons, String label, String sql, int productId) {
        try {
            Integer count = jdbcTemplate.queryForObject(sql, Integer.class, productId);
            if (count != null && count > 0) {
                reasons.add(label);
            }
        } catch (org.springframework.jdbc.BadSqlGrammarException e) {
            // Bảng chưa tồn tại (chưa chạy migration tương ứng) => không có dữ liệu chặn
        }
    }

    // ==========================================
    // VIEW PRODUCT DETAIL
    // ==========================================

    public Product findById(int productId) {
        try {
            return findById(productId, true);
        } catch (org.springframework.jdbc.BadSqlGrammarException e) {
            // DB chưa có cột product.sku
            return findById(productId, false);
        }
    }

    private Product findById(int productId, boolean withSku) {

        String sql = """
            SELECT
                p.product_id,
                %s
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
            """.formatted(withSku ? "p.sku," : "");

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
                barcode AS code,
                size,
                color,
                price,
                stock_quantity AS stockQuantity,
                -- có thể bán = tồn − đang giữ cho đơn (cùng công thức màn hình Tồn kho)
                GREATEST(pd.stock_quantity - COALESCE((
                    SELECT SUM(oi2.reserved_quantity) FROM order_item oi2
                    WHERE oi2.detail_id = pd.detail_id AND oi2.reserved_quantity > 0
                ), 0), 0) AS sellableQuantity,
                online_sales_enabled AS onlineSalesEnabled,
                status,
                -- locked = 1: biến thể đã có tồn hoặc lịch sử bán/kho, không được đổi size/màu
                -- (đổi sẽ làm hàng thật trên kệ, mã vạch và lịch sử bị lệch tên)
                (
                    pd.stock_quantity > 0
                    OR EXISTS (SELECT 1 FROM order_item oi WHERE oi.detail_id = pd.detail_id)
                    OR EXISTS (SELECT 1 FROM stock_adjustment sa WHERE sa.detail_id = pd.detail_id)
                    OR EXISTS (SELECT 1 FROM stock_receipt_item sri WHERE sri.detail_id = pd.detail_id)
                    OR EXISTS (SELECT 1 FROM product_location pl WHERE pl.detail_id = pd.detail_id)
                ) AS locked
            FROM product_detail pd
            WHERE pd.product_id = ?
            ORDER BY pd.detail_id ASC
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

        // sku = null khi DB chưa có cột product.sku (ProductService đã kiểm tra) -> câu lệnh cũ
        boolean withSku = request.getSku() != null;

        String sql = withSku
            ? """
            INSERT INTO product
                (
                    category_id,
                    product_name,
                    description,
                    status,
                    sku
                )
            VALUES (?, ?, ?, 'ACTIVE', ?)
            """
            : """
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

            if (withSku) {
                ps.setString(4, request.getSku());
            }

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
                    status,
                    barcode
                )
            VALUES (?, ?, ?, ?, 0, 0, 'ACTIVE', ?)
            """;

        jdbcTemplate.update(
                sql,
                productId,
                variant.getSize(),
                variant.getColor(),
                variant.getPrice(),
                variant.getCode()
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
        insertNewVariant(productId, size, color, price, null);
    }

    /** Thêm biến thể mới khi sửa sản phẩm, kèm mã biến thể (cột barcode; null = chưa có). */
    public void insertNewVariant(
            int productId,
            String size,
            String color,
            java.math.BigDecimal price,
            String code
    ) {
        String sql = """
            INSERT INTO product_detail (
                product_id,
                size,
                color,
                price,
                stock_quantity,
                online_sales_enabled,
                status,
                barcode
            )
            VALUES (?, ?, ?, ?, 0, 0, 'ACTIVE', ?)
            """;

        jdbcTemplate.update(
                sql,
                productId,
                size,
                color,
                price,
                code
        );
    }

    /** Đổi mã sản phẩm (SKU). */
    public int updateProductSku(int productId, String sku) {
        return jdbcTemplate.update("UPDATE product SET sku = ? WHERE product_id = ?", sku, productId);
    }

    public int updateProductStatus(int productId, String status) {
        String sql = """
        UPDATE product
        SET status = ?
        WHERE product_id = ?
        """;

        return jdbcTemplate.update(sql, status, productId);
    }

    public int countTransactionsByProductId(int productId) {
        String sql = """
            SELECT 
                (SELECT COUNT(*) FROM order_item oi JOIN product_detail pd ON oi.detail_id = pd.detail_id WHERE pd.product_id = ?) +
                (SELECT COUNT(*) FROM stock_receipt_item sri JOIN product_detail pd ON sri.detail_id = pd.detail_id WHERE pd.product_id = ?) +
                (SELECT COUNT(*) FROM product_location pl JOIN product_detail pd ON pl.detail_id = pd.detail_id WHERE pd.product_id = ?) +
                (SELECT COUNT(*) FROM stock_adjustment sa JOIN product_detail pd ON sa.detail_id = pd.detail_id WHERE pd.product_id = ?)
            AS total_count
            """;

        Integer count = jdbcTemplate.queryForObject(sql, Integer.class, productId, productId, productId, productId);
        return count != null ? count : 0;
    }

    public List<String> findCloudinaryPublicIds(int productId) {
        String sql = """
            SELECT cloud_public_id 
            FROM product_image 
            WHERE product_id = ? AND cloud_public_id IS NOT NULL AND cloud_public_id != ''
            """;
        return jdbcTemplate.queryForList(sql, String.class, productId);
    }

    public void deleteProductCascaded(int productId) {
        // 1. Clean cart_item
        jdbcTemplate.update("""
            DELETE FROM cart_item 
            WHERE detail_id IN (SELECT detail_id FROM product_detail WHERE product_id = ?)
            """, productId);

        // 2. Unlink image_search
        jdbcTemplate.update("""
            UPDATE image_search 
            SET selected_product_id = NULL 
            WHERE selected_product_id = ?
            """, productId);

        // 3. Delete product_image
        jdbcTemplate.update("DELETE FROM product_image WHERE product_id = ?", productId);

        // 4. Delete product_detail
        jdbcTemplate.update("DELETE FROM product_detail WHERE product_id = ?", productId);

        // 5. Delete product
        jdbcTemplate.update("DELETE FROM product WHERE product_id = ?", productId);
    }

}
