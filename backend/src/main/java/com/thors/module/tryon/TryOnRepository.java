package com.thors.module.tryon;

import com.thors.module.tryon.TryOnModels.BodyType;
import com.thors.module.tryon.TryOnModels.Model;
import com.thors.module.tryon.TryOnPlan.Step;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

/**
 * Bảng tryon_job, tryon_job_item (migration 2026-11-18_tryon_job.sql) và tryon_model
 * (2026-11-18_tryon_model.sql). Giờ lưu theo UTC như cả hệ thống.
 */
@Repository
public class TryOnRepository {

    private final JdbcTemplate jdbc;

    public TryOnRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** mode: PHOTO (ảnh khách) | MODEL (người mẫu dựng sẵn) | GENERATE (AI tạo người mẫu). */
    public record JobRow(long jobId, int userId, String status, String mode, Integer modelId, String provider,
                         String personHash, String personImageUrl, String resultImageUrl, String errorMessage,
                         LocalDateTime createdAt, LocalDateTime finishedAt, LocalDateTime expiresAt,
                         LocalDateTime purgedAt) {
    }

    public record ItemRow(int position, int productId, String garment, String productName, String imageUrl) {
    }

    /** Sản phẩm để mặc thử: tên + ảnh chính (ảnh có is_primary trước). Rỗng = không có / đã ngừng bán. */
    public record ProductRow(int productId, String name, String imageUrl) {
    }

    /** Người mẫu đầy đủ (trang quản lý của Owner). */
    public record ModelRow(int modelId, String gender, String bodyType, int heightCm, String imageUrl,
                           String source, String note, boolean active, LocalDateTime createdAt) {
        public Model toModel() {
            return new Model(modelId, gender, BodyType.valueOf(bodyType), heightCm, imageUrl);
        }
    }

    /** Đã chạy đủ 2 migration (3 bảng + cột mode). */
    public boolean tablesReady() {
        Integer tables = jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.tables
                WHERE table_schema = DATABASE() AND table_name IN ('tryon_job', 'tryon_job_item', 'tryon_model')
                """, Integer.class);
        Integer mode = jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = DATABASE() AND table_name = 'tryon_job' AND column_name = 'mode'
                """, Integer.class);
        return tables != null && tables == 3 && mode != null && mode == 1;
    }

    // ---------------------------------------------------------------- Sản phẩm

    public Optional<ProductRow> product(int productId) {
        return jdbc.query("""
                SELECT p.product_id, p.product_name,
                       (SELECT pi.image_url FROM product_image pi
                         WHERE pi.product_id = p.product_id AND pi.deleted_at IS NULL
                         ORDER BY pi.is_primary DESC, pi.image_id ASC LIMIT 1) AS image_url
                FROM product p
                WHERE p.product_id = ? AND p.status = 'ACTIVE'
                """, (rs, i) -> new ProductRow(rs.getInt("product_id"), rs.getString("product_name"),
                rs.getString("image_url")), productId).stream().findFirst();
    }

    // ---------------------------------------------------------------- Job

    /** Số job khách đã tạo kể từ mốc thời gian (để giới hạn lượt / ngày). Lần lỗi không tính lượt. */
    public int countSince(int userId, LocalDateTime since) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM tryon_job WHERE user_id = ? AND created_at >= ? AND status <> 'FAILED'",
                Integer.class, userId, Timestamp.valueOf(since));
        return n == null ? 0 : n;
    }

    public long insertJob(int userId, String mode, Integer modelId, String provider, String personHash,
                          String personImageUrl, LocalDateTime expiresAt, List<Step> steps) {
        var keys = new GeneratedKeyHolder();
        jdbc.update(c -> {
            PreparedStatement ps = c.prepareStatement("""
                    INSERT INTO tryon_job (user_id, status, mode, model_id, provider, person_hash, person_image_url, expires_at)
                    VALUES (?, 'PENDING', ?, ?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, userId);
            ps.setString(2, mode);
            ps.setObject(3, modelId);
            ps.setString(4, provider);
            ps.setString(5, personHash);
            ps.setString(6, personImageUrl);
            ps.setTimestamp(7, Timestamp.valueOf(expiresAt));
            return ps;
        }, keys);
        long jobId = keys.getKey().longValue();
        for (int i = 0; i < steps.size(); i++) {
            Step s = steps.get(i);
            jdbc.update("INSERT INTO tryon_job_item (job_id, position, product_id, garment) VALUES (?, ?, ?, ?)",
                    jobId, i + 1, s.productId(), s.garment().name());
        }
        return jobId;
    }

    public Optional<JobRow> find(long jobId) {
        return jdbc.query("SELECT * FROM tryon_job WHERE job_id = ?", (rs, i) -> map(rs), jobId)
                .stream().findFirst();
    }

    public List<ItemRow> items(long jobId) {
        return jdbc.query("""
                SELECT i.position, i.product_id, i.garment, p.product_name,
                       (SELECT pi.image_url FROM product_image pi
                         WHERE pi.product_id = p.product_id AND pi.deleted_at IS NULL
                         ORDER BY pi.is_primary DESC, pi.image_id ASC LIMIT 1) AS image_url
                FROM tryon_job_item i
                JOIN product p ON p.product_id = i.product_id
                WHERE i.job_id = ?
                ORDER BY i.position
                """, (rs, i) -> new ItemRow(rs.getInt("position"), rs.getInt("product_id"), rs.getString("garment"),
                rs.getString("product_name"), rs.getString("image_url")), jobId);
    }

    /** Ảnh của khách: cùng khách + cùng ảnh gốc + cùng các món (đúng thứ tự) đã có kết quả. */
    public Optional<Long> findReusablePhoto(int userId, String personHash, List<Step> steps) {
        return reusable("j.mode = 'PHOTO' AND j.user_id = ? AND j.person_hash = ?", steps, userId, personHash);
    }

    /** Người mẫu dựng sẵn: kết quả dùng chung cho MỌI khách (không có dữ liệu cá nhân). */
    public Optional<Long> findReusableModel(int modelId, List<Step> steps) {
        return reusable("j.mode = 'MODEL' AND j.model_id = ?", steps, modelId);
    }

    private Optional<Long> reusable(String where, List<Step> steps, Object... args) {
        String key = itemsKey(steps);
        Object[] all = java.util.Arrays.copyOf(args, args.length + 1);
        all[args.length] = key;
        return jdbc.query("""
                SELECT j.job_id
                FROM tryon_job j
                JOIN tryon_job_item i ON i.job_id = j.job_id
                WHERE %s AND j.status = 'DONE' AND j.purged_at IS NULL AND j.expires_at > UTC_TIMESTAMP()
                GROUP BY j.job_id
                HAVING GROUP_CONCAT(CONCAT(i.product_id, ':', i.garment) ORDER BY i.position SEPARATOR ',') = ?
                ORDER BY j.job_id DESC
                LIMIT 1
                """.formatted(where), (rs, i) -> rs.getLong(1), all).stream().findFirst();
    }

    static String itemsKey(List<Step> steps) {
        return String.join(",", steps.stream().map(s -> s.productId() + ":" + s.garment().name()).toList());
    }

    /** Các lần thử gần đây của khách còn ảnh (chưa hết hạn / chưa xóa), mới nhất trước. */
    public List<JobRow> recentOfUser(int userId, int limit) {
        return jdbc.query("""
                SELECT * FROM tryon_job
                WHERE user_id = ? AND purged_at IS NULL AND expires_at > UTC_TIMESTAMP() AND status <> 'FAILED'
                ORDER BY job_id DESC LIMIT ?
                """, (rs, i) -> map(rs), userId, limit);
    }

    /** Lấy job đang chờ để xử lý (chỉ 1 luồng nhận được nhờ điều kiện status = 'PENDING'). */
    public boolean markRunning(long jobId) {
        return jdbc.update("UPDATE tryon_job SET status = 'RUNNING' WHERE job_id = ? AND status = 'PENDING'", jobId) == 1;
    }

    /** false = job đã bị hủy / khách đã xóa ảnh trong lúc đang vẽ -> ảnh kết quả phải xóa đi. */
    public boolean markDone(long jobId, String resultImageUrl) {
        return jdbc.update("""
                UPDATE tryon_job SET status = 'DONE', result_image_url = ?, error_message = NULL,
                       finished_at = UTC_TIMESTAMP()
                WHERE job_id = ? AND status = 'RUNNING' AND purged_at IS NULL
                """, resultImageUrl, jobId) == 1;
    }

    public void markFailed(long jobId, String message) {
        jdbc.update("""
                UPDATE tryon_job SET status = 'FAILED', error_message = ?, finished_at = UTC_TIMESTAMP()
                WHERE job_id = ? AND status IN ('PENDING', 'RUNNING')
                """, truncate(message), jobId);
    }

    /** Job treo quá lâu (máy chủ khởi động lại giữa chừng...) -> báo lỗi để khách thử lại. */
    public List<JobRow> stuckBefore(LocalDateTime before) {
        return jdbc.query("""
                SELECT * FROM tryon_job WHERE status IN ('PENDING', 'RUNNING') AND created_at < ?
                """, (rs, i) -> map(rs), Timestamp.valueOf(before));
    }

    /** Job hết hạn mà ảnh chưa xóa. */
    public List<JobRow> expired(int limit) {
        return jdbc.query("""
                SELECT * FROM tryon_job
                WHERE purged_at IS NULL AND expires_at <= UTC_TIMESTAMP() AND status IN ('DONE', 'FAILED')
                ORDER BY expires_at LIMIT ?
                """, (rs, i) -> map(rs), limit);
    }

    /** Ảnh khách đang dùng ở job khác chưa xóa (khách "thử bộ khác" dùng lại ảnh cũ) -> chưa được xóa file. */
    public boolean personImageStillUsed(String personImageUrl, long exceptJobId) {
        Integer n = jdbc.queryForObject("""
                SELECT COUNT(*) FROM tryon_job
                WHERE person_image_url = ? AND job_id <> ? AND purged_at IS NULL
                """, Integer.class, personImageUrl, exceptJobId);
        return n != null && n > 0;
    }

    public void markPurged(long jobId) {
        jdbc.update("""
                UPDATE tryon_job SET person_image_url = NULL, result_image_url = NULL, purged_at = UTC_TIMESTAMP()
                WHERE job_id = ?
                """, jobId);
    }

    /** Job còn ảnh CỦA KHÁCH (chế độ ảnh của tôi / AI tạo người mẫu riêng) - để "Xóa ảnh của tôi". */
    public List<JobRow> personalOfUser(int userId) {
        return jdbc.query("""
                SELECT * FROM tryon_job WHERE user_id = ? AND purged_at IS NULL AND mode IN ('PHOTO', 'GENERATE')
                """, (rs, i) -> map(rs), userId);
    }

    /** Kết quả dùng chung của một người mẫu (xóa người mẫu -> xóa luôn kết quả). */
    public List<JobRow> jobsOfModel(int modelId) {
        return jdbc.query("SELECT * FROM tryon_job WHERE model_id = ? AND purged_at IS NULL", (rs, i) -> map(rs), modelId);
    }

    // ---------------------------------------------------------------- Người mẫu

    public List<ModelRow> models(boolean activeOnly) {
        return jdbc.query("SELECT * FROM tryon_model" + (activeOnly ? " WHERE active = 1" : "")
                + " ORDER BY gender, FIELD(body_type, 'SLIM', 'REGULAR', 'FULL'), height_cm, model_id", (rs, i) -> mapModel(rs));
    }

    public Optional<ModelRow> model(int modelId) {
        return jdbc.query("SELECT * FROM tryon_model WHERE model_id = ?", (rs, i) -> mapModel(rs), modelId)
                .stream().findFirst();
    }

    public int insertModel(String gender, String bodyType, int heightCm, String imageUrl, String source, String note,
                           int createdBy) {
        var keys = new GeneratedKeyHolder();
        jdbc.update(c -> {
            PreparedStatement ps = c.prepareStatement("""
                    INSERT INTO tryon_model (gender, body_type, height_cm, image_url, source, note, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, gender);
            ps.setString(2, bodyType);
            ps.setInt(3, heightCm);
            ps.setString(4, imageUrl);
            ps.setString(5, source);
            ps.setString(6, note);
            ps.setInt(7, createdBy);
            return ps;
        }, keys);
        return keys.getKey().intValue();
    }

    public void setModelActive(int modelId, boolean active) {
        jdbc.update("UPDATE tryon_model SET active = ? WHERE model_id = ?", active ? 1 : 0, modelId);
    }

    public void deleteModel(int modelId) {
        jdbc.update("DELETE FROM tryon_model WHERE model_id = ?", modelId);
    }

    // ---------------------------------------------------------------- Đọc dòng

    private static JobRow map(ResultSet rs) throws SQLException {
        Integer modelId = rs.getObject("model_id", Integer.class);
        return new JobRow(rs.getLong("job_id"), rs.getInt("user_id"), rs.getString("status"), rs.getString("mode"),
                modelId, rs.getString("provider"), rs.getString("person_hash"),
                rs.getString("person_image_url"), rs.getString("result_image_url"), rs.getString("error_message"),
                time(rs, "created_at"), time(rs, "finished_at"), time(rs, "expires_at"), time(rs, "purged_at"));
    }

    private static ModelRow mapModel(ResultSet rs) throws SQLException {
        return new ModelRow(rs.getInt("model_id"), rs.getString("gender"), rs.getString("body_type"),
                rs.getInt("height_cm"), rs.getString("image_url"), rs.getString("source"), rs.getString("note"),
                rs.getBoolean("active"), time(rs, "created_at"));
    }

    private static LocalDateTime time(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toLocalDateTime();
    }

    private static String truncate(String s) {
        if (s == null) return null;
        return s.length() <= 255 ? s : s.substring(0, 252) + "...";
    }
}
