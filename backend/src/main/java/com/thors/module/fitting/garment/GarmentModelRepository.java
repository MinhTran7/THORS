package com.thors.module.fitting.garment;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Bảng product_garment_model (migration 2026-11-23_product_garment_model.sql). size_morphs / color_map là JSON,
 * đọc / ghi nguyên chuỗi - GarmentModelService chuyển đổi và kiểm tra.
 */
@Repository
public class GarmentModelRepository {

    private final JdbcTemplate jdbc;
    // Chỉ ghi nhớ khi bảng ĐÃ có: chạy migration xong không cần khởi động lại backend
    private final AtomicBoolean ready = new AtomicBoolean(false);

    public GarmentModelRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Dòng của bảng (JSON để nguyên chuỗi). */
    public record Row(
            int productId,
            String glbUrl,
            String glbPublicId,
            int fileSizeBytes,
            String slot,
            String gender,
            String fabricMaterial,
            String sizeMorphsJson,
            String colorMapJson,
            boolean active,
            LocalDateTime updatedAt) {
    }

    /** Một biến thể của sản phẩm (để kiểm tra size / màu khai báo có thật không). */
    public record Variant(String size, String color) {
    }

    public boolean tableReady() {
        if (ready.get()) return true;
        Integer n = jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.tables
                WHERE table_schema = DATABASE() AND table_name = 'product_garment_model'
                """, Integer.class);
        boolean has = n != null && n > 0;
        if (has) ready.set(true);
        return has;
    }

    public boolean productExists(int productId) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM product WHERE product_id = ?", Integer.class, productId);
        return n != null && n > 0;
    }

    public List<Variant> variants(int productId) {
        return jdbc.query("SELECT DISTINCT size, color FROM product_detail WHERE product_id = ?",
                (rs, i) -> new Variant(rs.getString("size"), rs.getString("color")), productId);
    }

    public Optional<Row> find(int productId) {
        return jdbc.query("SELECT * FROM product_garment_model WHERE product_id = ?", this::map, productId)
                .stream().findFirst();
    }

    /** Mô hình đang bật của các sản phẩm đang bán (sản phẩm ẩn / ngừng bán thì không trả). */
    public List<Row> activeForShop(Collection<Integer> productIds) {
        if (productIds.isEmpty()) return List.of();
        String marks = String.join(",", productIds.stream().map(id -> "?").toList());
        return jdbc.query("""
                SELECT g.* FROM product_garment_model g
                JOIN product p ON p.product_id = g.product_id
                WHERE g.active = 1 AND p.status = 'ACTIVE' AND g.product_id IN (""" + marks + ")",
                this::map, productIds.toArray());
    }

    /** Thêm mới hoặc ghi đè mô hình của sản phẩm (1 sản phẩm - 1 mô hình). */
    public void upsert(int productId, String glbUrl, String glbPublicId, int fileSizeBytes, String slot, String gender,
                       String fabricMaterial, String sizeMorphsJson, String colorMapJson, Integer createdBy) {
        jdbc.update("""
                INSERT INTO product_garment_model (product_id, glb_url, glb_public_id, file_size_bytes, slot, gender,
                                                   fabric_material, size_morphs, color_map, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?)
                ON DUPLICATE KEY UPDATE glb_url = VALUES(glb_url), glb_public_id = VALUES(glb_public_id),
                    file_size_bytes = VALUES(file_size_bytes), slot = VALUES(slot), gender = VALUES(gender),
                    fabric_material = VALUES(fabric_material), size_morphs = VALUES(size_morphs),
                    color_map = VALUES(color_map), created_by = VALUES(created_by)
                """, productId, glbUrl, glbPublicId, fileSizeBytes, slot, gender, fabricMaterial, sizeMorphsJson,
                colorMapJson, createdBy);
    }

    public int setActive(int productId, boolean active) {
        return jdbc.update("UPDATE product_garment_model SET active = ? WHERE product_id = ?", active, productId);
    }

    public int delete(int productId) {
        return jdbc.update("DELETE FROM product_garment_model WHERE product_id = ?", productId);
    }

    /** public_id của mọi file đang được dùng (để dọn file trên Cloudinary không còn dòng nào trỏ tới). */
    public List<String> publicIdsInUse() {
        return jdbc.queryForList("SELECT glb_public_id FROM product_garment_model", String.class);
    }

    private Row map(ResultSet rs, int i) throws SQLException {
        var updated = rs.getTimestamp("updated_at");
        return new Row(
                rs.getInt("product_id"),
                rs.getString("glb_url"),
                rs.getString("glb_public_id"),
                rs.getInt("file_size_bytes"),
                rs.getString("slot"),
                rs.getString("gender"),
                rs.getString("fabric_material"),
                rs.getString("size_morphs"),
                rs.getString("color_map"),
                rs.getBoolean("active"),
                updated == null ? null : updated.toLocalDateTime());
    }
}
