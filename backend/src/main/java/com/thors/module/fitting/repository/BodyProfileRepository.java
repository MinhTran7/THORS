package com.thors.module.fitting.repository;

import com.thors.module.fitting.dto.BodyProfileRequest;
import com.thors.module.fitting.entity.BodyProfile;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class BodyProfileRepository {

    private final JdbcTemplate jdbc;
    private final FittingSchema schema;

    public BodyProfileRepository(JdbcTemplate jdbc, FittingSchema schema) {
        this.jdbc = jdbc;
        this.schema = schema;
    }

    /** Cột foot_length_cm có từ migration 2026-11-17_foot_length; chưa chạy thì coi như null. */
    private boolean hasFoot() {
        return schema.hasColumn("body_profile", "foot_length_cm");
    }

    private RowMapper<BodyProfile> mapper(boolean foot) {
        return (rs, rowNum) -> new BodyProfile(
                rs.getInt("user_id"),
                rs.getString("gender"),
                rs.getBigDecimal("height_cm"),
                rs.getBigDecimal("weight_kg"),
                rs.getBigDecimal("chest_cm"),
                rs.getBigDecimal("waist_cm"),
                rs.getBigDecimal("hip_cm"),
                foot ? rs.getBigDecimal("foot_length_cm") : null,
                rs.getString("fit_preference"),
                rs.getTimestamp("updated_at").toLocalDateTime());
    }

    public Optional<BodyProfile> findByUserId(int userId) {
        return jdbc.query("SELECT * FROM body_profile WHERE user_id = ?", mapper(hasFoot()), userId)
                .stream().findFirst();
    }

    /**
     * Thêm mới hoặc cập nhật trong một câu lệnh: user_id là khóa chính nên nếu khách đã có hồ sơ,
     * MySQL chuyển sang nhánh ON DUPLICATE KEY UPDATE (ghi đè số đo cũ).
     */
    public void upsert(int userId, BodyProfileRequest p) {
        if (hasFoot()) {
            jdbc.update("""
                    INSERT INTO body_profile (user_id, gender, height_cm, weight_kg, chest_cm, waist_cm, hip_cm,
                        foot_length_cm, fit_preference)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        gender = VALUES(gender), height_cm = VALUES(height_cm), weight_kg = VALUES(weight_kg),
                        chest_cm = VALUES(chest_cm), waist_cm = VALUES(waist_cm), hip_cm = VALUES(hip_cm),
                        foot_length_cm = VALUES(foot_length_cm), fit_preference = VALUES(fit_preference)
                    """,
                    userId, p.gender(), p.heightCm(), p.weightKg(), p.chestCm(), p.waistCm(), p.hipCm(),
                    p.footLengthCm(), p.fitPreference());
            return;
        }
        jdbc.update("""
                INSERT INTO body_profile (user_id, gender, height_cm, weight_kg, chest_cm, waist_cm, hip_cm, fit_preference)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    gender = VALUES(gender), height_cm = VALUES(height_cm), weight_kg = VALUES(weight_kg),
                    chest_cm = VALUES(chest_cm), waist_cm = VALUES(waist_cm), hip_cm = VALUES(hip_cm),
                    fit_preference = VALUES(fit_preference)
                """,
                userId, p.gender(), p.heightCm(), p.weightKg(), p.chestCm(), p.waistCm(), p.hipCm(),
                p.fitPreference());
    }

    public void delete(int userId) {
        jdbc.update("DELETE FROM body_profile WHERE user_id = ?", userId);
    }
}
