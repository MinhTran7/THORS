package com.thors.module.promotion.dto;

import java.time.LocalDateTime;

// Sửa khi đang chạy: chỉ gia hạn ngày kết thúc và điều chỉnh lượt dùng (mã giảm giá online)
public record PromotionAdjustRequest(
        LocalDateTime endDate,
        Integer usageLimit
) {
}
