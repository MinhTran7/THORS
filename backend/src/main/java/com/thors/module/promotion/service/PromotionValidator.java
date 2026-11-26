package com.thors.module.promotion.service;

import com.thors.common.ApiException;
import com.thors.module.promotion.dto.PromotionRequest;
import com.thors.module.promotion.entity.Promotion;
import com.thors.module.promotion.repository.PromotionRepository;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

// Chuẩn hóa và kiểm tra dữ liệu tạo/sửa khuyến mãi, trả về bản nháp Promotion (chưa có id)
@Component
public class PromotionValidator {

    private static final BigDecimal ONE_HUNDRED = new BigDecimal("100");
    // Vừa cột DECIMAL(12,0) và ô nhập 10 chữ số
    private static final BigDecimal MAX_AMOUNT = new BigDecimal("9999999999");

    private final PromotionRepository repository;

    public PromotionValidator(PromotionRepository repository) {
        this.repository = repository;
    }

    public Promotion validate(PromotionRequest r) {
        String type = upper(r.type());
        if (!Promotion.PRODUCT_DISCOUNT.equals(type) && !Promotion.ORDER_VOUCHER.equals(type)) {
            throw invalid("PROMOTION_KIND_INVALID", "Loại khuyến mãi không hợp lệ.");
        }
        boolean voucher = Promotion.ORDER_VOUCHER.equals(type);

        String name = r.name() == null ? "" : r.name().trim();
        if (name.isEmpty() || name.length() > 100) {
            throw invalid("PROMOTION_NAME_INVALID", "Tên khuyến mãi không được để trống và tối đa 100 ký tự.");
        }
        String description = r.description() == null || r.description().isBlank() ? null : r.description().trim();
        if (description != null && description.length() > 255) {
            throw invalid("PROMOTION_DESCRIPTION_INVALID", "Mô tả tối đa 255 ký tự.");
        }

        String discountType = upper(r.discountType());
        boolean percent = "PERCENT".equals(discountType);
        BigDecimal value = r.discountValue();
        if (!percent && !"FIXED".equals(discountType)) throw invalid("PROMOTION_TYPE_INVALID", "Loại giảm giá không hợp lệ.");
        if (value == null || value.signum() <= 0) throw invalid("PROMOTION_VALUE_INVALID", "Giá trị giảm giá phải lớn hơn 0.");
        if (percent && (value.compareTo(ONE_HUNDRED) > 0 || value.stripTrailingZeros().scale() > 2)) {
            throw invalid("PROMOTION_PERCENT_INVALID", "Phần trăm giảm tối đa 100% và tối đa 2 chữ số thập phân.");
        }
        if (!percent && !isAmount(value)) {
            throw invalid("PROMOTION_FIXED_INVALID", "Số tiền giảm cố định phải là số nguyên VNĐ, tối đa 9.999.999.999.");
        }

        // Chỉ mã giảm giá online có đơn tối thiểu, lượt dùng và mức giảm tối đa (khi giảm theo %)
        BigDecimal minimum = BigDecimal.ZERO;
        BigDecimal maxDiscount = null;
        Integer usageLimit = null;
        if (voucher) {
            minimum = r.minOrderValue();
            if (minimum == null || minimum.signum() <= 0 || !isAmount(minimum)) {
                throw invalid("PROMOTION_MINIMUM_INVALID", "Giá trị đơn tối thiểu phải là số nguyên VNĐ từ 1 đến 9.999.999.999.");
            }
            if (!percent && value.compareTo(minimum) >= 0) {
                throw invalid("PROMOTION_VALUE_INVALID", "Số tiền giảm phải nhỏ hơn giá trị đơn tối thiểu.");
            }
            if (percent && r.maxDiscountAmount() != null) {
                maxDiscount = r.maxDiscountAmount();
                if (maxDiscount.signum() <= 0 || !isAmount(maxDiscount)) {
                    throw invalid("PROMOTION_MAX_DISCOUNT_INVALID", "Mức giảm tối đa phải là số nguyên VNĐ từ 1 đến 9.999.999.999.");
                }
            }
            usageLimit = r.usageLimit();
            if (usageLimit == null || usageLimit < 1) {
                throw invalid("PROMOTION_USAGE_LIMIT_INVALID", "Vui lòng nhập giới hạn lượt dùng từ 1 trở lên.");
            }
        }

        // Cho lùi 15 phút để form mở lâu vẫn lưu được
        LocalDateTime start = r.startDate();
        LocalDateTime end = r.endDate();
        if (start == null || end == null || start.isBefore(LocalDateTime.now().minusMinutes(15)) || !end.isAfter(start)) {
            throw invalid("PROMOTION_DATES_INVALID",
                    "Thời gian bắt đầu phải từ hiện tại trở đi và thời gian kết thúc phải sau thời gian bắt đầu.");
        }

        String scope = voucher || r.applyScope() == null || r.applyScope().isBlank() ? "ALL" : upper(r.applyScope());
        if (!"ALL".equals(scope) && !"SELECTED".equals(scope)) {
            throw invalid("PROMOTION_SCOPE_INVALID", "Phạm vi áp dụng không hợp lệ.");
        }

        return new Promotion(null, type, name, description, discountType, value, minimum, maxDiscount, usageLimit, 0, scope,
                products(scope, r.productIds()), start, end, "ACTIVE");
    }

    public LocalDateTime extendedEnd(Promotion p, LocalDateTime requested) {
        LocalDateTime end = requested == null ? p.endDate() : requested;
        if (end.isBefore(p.endDate())) {
            throw invalid("PROMOTION_END_INVALID", "Chỉ được gia hạn, thời gian kết thúc mới phải sau thời gian cũ.");
        }
        return end;
    }

    public Integer usageLimit(Promotion p, Integer requested) {
        if (!p.isOrderVoucher() || requested == null) return p.usageLimit();
        if (requested < Math.max(1, p.usedCount())) {
            throw invalid("PROMOTION_USAGE_LIMIT_INVALID",
                    "Giới hạn lượt dùng phải từ 1 trở lên và không nhỏ hơn số lượt đã dùng (" + p.usedCount() + ").");
        }
        return requested;
    }

    public String status(String status) {
        String next = upper(status);
        if (!"ACTIVE".equals(next) && !"INACTIVE".equals(next)) {
            throw invalid("PROMOTION_STATUS_INVALID", "Trạng thái chỉ được là ACTIVE hoặc INACTIVE.");
        }
        return next;
    }

    // Phạm vi SELECTED: ít nhất một sản phẩm, không trùng, đều đang bán
    private List<Integer> products(String scope, List<Integer> ids) {
        if ("ALL".equals(scope)) return List.of();
        if (ids == null || ids.isEmpty()) {
            throw invalid("PROMOTION_PRODUCTS_REQUIRED", "Vui lòng chọn ít nhất một sản phẩm áp dụng.");
        }
        List<Integer> unique = ids.stream().filter(Objects::nonNull).distinct().toList();
        if (unique.size() != ids.size() || repository.countActiveProducts(unique) != unique.size()) {
            throw invalid("PROMOTION_PRODUCTS_INVALID", "Danh sách sản phẩm không hợp lệ hoặc có sản phẩm không còn hoạt động.");
        }
        return unique;
    }

    private static boolean isAmount(BigDecimal value) {
        return value.stripTrailingZeros().scale() <= 0 && value.compareTo(MAX_AMOUNT) <= 0;
    }

    private static String upper(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
    }

    private static ApiException invalid(String code, String message) {
        return new ApiException(400, code, message);
    }
}
