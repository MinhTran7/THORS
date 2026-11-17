package com.thors.module.fitting.dto;

import java.math.BigDecimal;

/**
 * Dữ liệu khách gửi lên khi lưu số đo. chestCm / waistCm / hipCm / footLengthCm được bỏ trống;
 * fitPreference bỏ trống = REGULAR.
 */
public record BodyProfileRequest(
        String gender,
        BigDecimal heightCm,
        BigDecimal weightKg,
        BigDecimal chestCm,
        BigDecimal waistCm,
        BigDecimal hipCm,
        BigDecimal footLengthCm,
        String fitPreference) {
}
