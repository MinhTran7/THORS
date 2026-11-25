package com.thors.module.promotion.dto;

import com.thors.module.promotion.entity.Promotion;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

// Khuyến mãi trả cho trang quản lý, kèm trạng thái theo thời gian và các thao tác được phép
public record PromotionView(
        int promotionId,
        String type,
        String name,
        String description,
        String discountType,
        BigDecimal discountValue,
        BigDecimal minOrderValue,
        Integer usageLimit,
        Integer usedCount,
        String applyScope,
        List<Integer> productIds,
        LocalDateTime startDate,
        LocalDateTime endDate,
        String status,
        String schedule,
        boolean canEdit,
        boolean canAdjust,
        boolean canEnable,
        boolean canDisable,
        boolean canEndEarly,
        boolean canDelete
) {
    public static PromotionView of(Promotion p, LocalDateTime now) {
        return new PromotionView(p.promotionId(), p.type(), p.name(), p.description(), p.discountType(),
                p.discountValue(), p.minOrderValue(), p.usageLimit(), p.usedCount(), p.applyScope(), p.productIds(),
                p.startDate(), p.endDate(), p.status(), p.schedule(now).name(), p.canEdit(now), p.canAdjust(now),
                p.canEnable(now), p.canDisable(now), p.canEndEarly(now), p.canDelete(now));
    }
}
