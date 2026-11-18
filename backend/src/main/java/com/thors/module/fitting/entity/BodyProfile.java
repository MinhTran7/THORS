package com.thors.module.fitting.entity;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Một dòng của bảng body_profile: số đo cơ thể của một khách (1 khách - 1 hồ sơ). */
public record BodyProfile(
        int userId,
        String gender,
        BigDecimal heightCm,
        BigDecimal weightKg,
        BigDecimal chestCm,
        BigDecimal waistCm,
        BigDecimal hipCm,
        BigDecimal footLengthCm,
        String fitPreference,
        LocalDateTime updatedAt) {
}
