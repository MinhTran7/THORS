package com.thors.module.fitting.dto;

import com.thors.module.fitting.entity.BodyProfile;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Số đo trả về cho frontend (không kèm user_id: khách chỉ xem được hồ sơ của chính mình). */
public record BodyProfileResponse(
        String gender,
        BigDecimal heightCm,
        BigDecimal weightKg,
        BigDecimal chestCm,
        BigDecimal waistCm,
        BigDecimal hipCm,
        BigDecimal footLengthCm,
        String fitPreference,
        LocalDateTime updatedAt) {

    public static BodyProfileResponse from(BodyProfile p) {
        return new BodyProfileResponse(
                p.gender(), p.heightCm(), p.weightKg(), p.chestCm(), p.waistCm(), p.hipCm(), p.footLengthCm(),
                p.fitPreference(), p.updatedAt());
    }
}
