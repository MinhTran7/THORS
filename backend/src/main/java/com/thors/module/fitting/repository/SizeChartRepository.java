package com.thors.module.fitting.repository;

import com.thors.module.fitting.entity.SizeChartRow;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class SizeChartRepository {

    private static RowMapper<SizeChartRow> mapper(boolean foot) {
        return (rs, rowNum) -> new SizeChartRow(
                rs.getString("size_label"),
                rs.getBigDecimal("height_min"),
                rs.getBigDecimal("height_max"),
                rs.getBigDecimal("weight_min"),
                rs.getBigDecimal("weight_max"),
                rs.getBigDecimal("chest_min"),
                rs.getBigDecimal("chest_max"),
                rs.getBigDecimal("waist_min"),
                rs.getBigDecimal("waist_max"),
                rs.getBigDecimal("hip_min"),
                rs.getBigDecimal("hip_max"),
                foot ? rs.getBigDecimal("foot_min") : null,
                foot ? rs.getBigDecimal("foot_max") : null,
                rs.getInt("sort_order"));
    }

    private final JdbcTemplate jdbc;
    private final FittingSchema schema;

    public SizeChartRepository(JdbcTemplate jdbc, FittingSchema schema) {
        this.jdbc = jdbc;
        this.schema = schema;
    }

    /** Cột foot_min / foot_max (size giày) có từ migration 2026-11-17_foot_length. */
    public boolean supportsFoot() {
        return schema.hasColumn("product_size_chart", "foot_min");
    }

    public List<SizeChartRow> findByProduct(int productId) {
        return jdbc.query(
                "SELECT * FROM product_size_chart WHERE product_id = ? ORDER BY sort_order, size_label",
                mapper(supportsFoot()), productId);
    }

    /** Ghi đè cả bảng size của sản phẩm (xóa cũ, thêm mới) - gọi trong @Transactional. */
    public void replace(int productId, List<SizeChartRow> rows) {
        jdbc.update("DELETE FROM product_size_chart WHERE product_id = ?", productId);
        if (rows.isEmpty()) return;
        boolean foot = supportsFoot();
        jdbc.batchUpdate(
                "INSERT INTO product_size_chart (product_id, size_label, height_min, height_max, weight_min, weight_max,"
                        + " chest_min, chest_max, waist_min, waist_max, hip_min, hip_max,"
                        + (foot ? " foot_min, foot_max," : "") + " sort_order)"
                        + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?," + (foot ? " ?, ?," : "") + " ?)",
                rows.stream().map(r -> foot
                        ? new Object[] {
                                productId, r.sizeLabel(), r.heightMin(), r.heightMax(), r.weightMin(), r.weightMax(),
                                r.chestMin(), r.chestMax(), r.waistMin(), r.waistMax(), r.hipMin(), r.hipMax(),
                                r.footMin(), r.footMax(), r.sortOrder()}
                        : new Object[] {
                                productId, r.sizeLabel(), r.heightMin(), r.heightMax(), r.weightMin(), r.weightMax(),
                                r.chestMin(), r.chestMax(), r.waistMin(), r.waistMax(), r.hipMin(), r.hipMax(),
                                r.sortOrder()}).toList());
    }

    public boolean productExists(int productId) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM product WHERE product_id = ?", Integer.class, productId);
        return n != null && n > 0;
    }

    /**
     * Danh mục của sản phẩm: tên từ danh mục con lên tới gốc (tối đa 4 cấp) + đối tượng gần nhất có đặt
     * (MEN / WOMEN / ...). Dùng để chọn bảng size chuẩn.
     */
    public record CategoryInfo(int categoryId, List<String> names, String targetGroup) {
    }

    public CategoryInfo categoryInfo(int productId) {
        return jdbc.query("""
                SELECT c1.category_id,
                       c1.category_name AS n1, c2.category_name AS n2, c3.category_name AS n3, c4.category_name AS n4,
                       COALESCE(c1.target_group, c2.target_group, c3.target_group, c4.target_group) AS target_group
                FROM product p
                JOIN category c1 ON c1.category_id = p.category_id
                LEFT JOIN category c2 ON c2.category_id = c1.parent_id
                LEFT JOIN category c3 ON c3.category_id = c2.parent_id
                LEFT JOIN category c4 ON c4.category_id = c3.parent_id
                WHERE p.product_id = ?
                """, (rs, i) -> new CategoryInfo(
                        rs.getInt("category_id"),
                        java.util.stream.Stream.of(rs.getString("n1"), rs.getString("n2"), rs.getString("n3"), rs.getString("n4"))
                                .filter(java.util.Objects::nonNull).toList(),
                        rs.getString("target_group")),
                productId).stream().findFirst().orElse(null);
    }

    /** Các sản phẩm khác cùng danh mục (để áp dụng chung một bảng size). */
    public List<Integer> otherProductsInCategory(int categoryId, int excludeProductId) {
        return jdbc.queryForList(
                "SELECT product_id FROM product WHERE category_id = ? AND product_id <> ?",
                Integer.class, categoryId, excludeProductId);
    }

    /** Các size đang có của sản phẩm (mọi màu, kể cả đang ẩn) - để kiểm tra size Owner nhập. */
    public List<String> sizesOf(int productId) {
        return jdbc.queryForList(
                "SELECT DISTINCT size FROM product_detail WHERE product_id = ? ORDER BY size", String.class, productId);
    }
}
