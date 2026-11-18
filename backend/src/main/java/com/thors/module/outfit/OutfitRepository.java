package com.thors.module.outfit;

import com.thors.module.fitting.repository.FittingSchema;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Dữ liệu cho phối đồ: sản phẩm đang bán online, thẻ của sản phẩm (product_style), hồ sơ phong cách của khách
 * (các cột phong cách trong body_profile). Bảng / cột chưa có (chưa chạy migration) -> coi như chưa có dữ liệu.
 */
@Repository
public class OutfitRepository {

    private final JdbcTemplate jdbc;
    private final FittingSchema schema;

    public OutfitRepository(JdbcTemplate jdbc, FittingSchema schema) {
        this.jdbc = jdbc;
        this.schema = schema;
    }

    public record ProductRow(int productId, String productName) {
    }

    public record StyleRow(String occasions, String styles) {
    }

    public record StyleProfileRow(Integer birthYear, String occupation, String preferredStyles, String avoidColors) {
    }

    private boolean hasProductStyle() {
        return schema.hasColumn("product_style", "occasions");
    }

    private boolean hasStyleProfile() {
        return schema.hasColumn("body_profile", "preferred_styles");
    }

    /** Sản phẩm đang hoạt động, có ít nhất 1 biến thể bán online. */
    public List<ProductRow> activeProducts() {
        return jdbc.query("""
                SELECT p.product_id, p.product_name FROM product p
                WHERE p.status = 'ACTIVE'
                  AND EXISTS (SELECT 1 FROM product_detail d WHERE d.product_id = p.product_id
                              AND d.status = 'ACTIVE' AND d.online_sales_enabled = 1)
                ORDER BY p.product_id
                """, (rs, i) -> new ProductRow(rs.getInt("product_id"), rs.getString("product_name")));
    }

    public Map<Integer, StyleRow> allStyles() {
        Map<Integer, StyleRow> map = new HashMap<>();
        if (!hasProductStyle()) return map;
        jdbc.query("SELECT product_id, occasions, styles FROM product_style",
                rs -> {
                    map.put(rs.getInt("product_id"), new StyleRow(rs.getString("occasions"), rs.getString("styles")));
                });
        return map;
    }

    public Optional<StyleRow> styleOf(int productId) {
        if (!hasProductStyle()) return Optional.empty();
        return jdbc.query("SELECT occasions, styles FROM product_style WHERE product_id = ?",
                (rs, i) -> new StyleRow(rs.getString("occasions"), rs.getString("styles")), productId).stream().findFirst();
    }

    /** Lưu thẻ; cả hai rỗng -> xóa dòng (quay về tự đoán theo tên). Trả false nếu chưa chạy migration. */
    public boolean saveStyle(int productId, String occasions, String styles) {
        if (!hasProductStyle()) return false;
        if (occasions == null && styles == null) {
            jdbc.update("DELETE FROM product_style WHERE product_id = ?", productId);
            return true;
        }
        jdbc.update("""
                INSERT INTO product_style (product_id, occasions, styles) VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE occasions = VALUES(occasions), styles = VALUES(styles)
                """, productId, occasions, styles);
        return true;
    }

    public String productName(int productId) {
        return jdbc.queryForList("SELECT product_name FROM product WHERE product_id = ?", String.class, productId)
                .stream().findFirst().orElse("");
    }

    public boolean productExists(int productId) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM product WHERE product_id = ?", Integer.class, productId);
        return n != null && n > 0;
    }

    public Optional<StyleProfileRow> styleProfile(int userId) {
        if (!hasStyleProfile()) return Optional.empty();
        return jdbc.query("""
                SELECT birth_year, occupation, preferred_styles, avoid_colors FROM body_profile WHERE user_id = ?
                """, (rs, i) -> new StyleProfileRow(
                        rs.getObject("birth_year") == null ? null : rs.getInt("birth_year"),
                        rs.getString("occupation"), rs.getString("preferred_styles"), rs.getString("avoid_colors")),
                userId).stream().findFirst();
    }

    /**
     * Ghi hồ sơ phong cách vào dòng body_profile có sẵn của khách. Trả số dòng cập nhật
     * (0 = khách chưa lưu số đo), -1 = chưa chạy migration.
     */
    public int saveStyleProfile(int userId, StyleProfileRow p) {
        if (!hasStyleProfile()) return -1;
        return jdbc.update("""
                UPDATE body_profile SET birth_year = ?, occupation = ?, preferred_styles = ?, avoid_colors = ?
                WHERE user_id = ?
                """, p.birthYear(), p.occupation(), p.preferredStyles(), p.avoidColors(), userId);
    }
}
