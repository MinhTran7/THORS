
package com.thors.module.promotion.service;

import com.thors.common.ApiException;
import com.thors.module.promotion.dto.UpdatePromotionRequest;
import com.thors.module.promotion.entity.Promotion;
import com.thors.module.promotion.repository.PromotionRepository;
import com.thors.security.SessionAccess;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Service
public class PromotionService {

    private static final BigDecimal ZERO = BigDecimal.ZERO;
    private static final BigDecimal ONE_HUNDRED = new BigDecimal("100");

    private final PromotionRepository repository;
    private final SessionAccess sessionAccess;

    public PromotionService(
            PromotionRepository repository,
            SessionAccess sessionAccess
    ) {
        this.repository = repository;
        this.sessionAccess = sessionAccess;
    }

    public List<Promotion> getAll() {
        String role = currentRole();

        if ("OWNER".equals(role)) {
            return repository.findAll();
        }

        if ("CUSTOMER".equals(role)) {
            return repository.findAvailable(LocalDate.now());
        }

        throw forbidden();
    }

    public Promotion getById(int id) {
        String role = currentRole();

        if ("OWNER".equals(role)) {
            return repository.findById(id)
                    .orElseThrow(this::notFound);
        }

        if ("CUSTOMER".equals(role)) {
            return repository.findAvailableById(id, LocalDate.now())
                    .orElseThrow(this::notFound);
        }

        throw forbidden();
    }

    @Transactional
    public void update(int id, UpdatePromotionRequest request) {
        requireOwner();

        if (request == null) {
            throw badRequest(
                    "PROMOTION_REQUIRED",
                    "Vui lòng nhập thông tin khuyến mãi."
            );
        }

        repository.findById(id).orElseThrow(this::notFound);

        String name = request.name() == null
                ? ""
                : request.name().trim();

        String description = request.description() == null
                ? null
                : request.description().trim();

        String type = request.discountType() == null
                ? ""
                : request.discountType().trim().toUpperCase();

        BigDecimal value = request.discountValue();
        BigDecimal minimum = request.minOrderValue();
        BigDecimal maximum = request.maxDiscountAmount();
        LocalDate startDate = request.startDate();
        LocalDate endDate = request.endDate();
        Integer usageLimit = request.usageLimit();

        validateName(name);
        validateDescription(description);
        validateDiscount(type, value);
        validateOrderValues(minimum, maximum);
        validateDates(startDate, endDate);
        validateUsageLimit(usageLimit);

        if (description != null && description.isBlank()) {
            description = null;
        }

        int updated = repository.update(
                id,
                name,
                description,
                type,
                value,
                minimum,
                maximum,
                startDate,
                endDate,
                usageLimit
        );

        if (updated == 0) {
            throw notFound();
        }
    }

    @Transactional
    public void changeStatus(int id, String status) {
        requireOwner();

        if (!"ACTIVE".equals(status) && !"INACTIVE".equals(status)) {
            throw badRequest(
                    "PROMOTION_STATUS_INVALID",
                    "Trạng thái chỉ được là ACTIVE hoặc INACTIVE."
            );
        }

        repository.findById(id).orElseThrow(this::notFound);
        repository.updateStatus(id, status);
    }

    private void validateName(String name) {
        if (name.isBlank() || name.length() > 100) {
            throw badRequest(
                    "PROMOTION_NAME_INVALID",
                    "Tên khuyến mãi không được để trống và tối đa 100 ký tự."
            );
        }
    }

    private void validateDescription(String description) {
        if (description != null && description.length() > 255) {
            throw badRequest(
                    "PROMOTION_DESCRIPTION_INVALID",
                    "Mô tả tối đa 255 ký tự."
            );
        }
    }

    private void validateDiscount(String type, BigDecimal value) {
        if (!"PERCENT".equals(type) && !"FIXED".equals(type)) {
            throw badRequest(
                    "PROMOTION_TYPE_INVALID",
                    "Loại giảm giá không hợp lệ."
            );
        }

        if (value == null || value.compareTo(ZERO) < 0) {
            throw badRequest(
                    "PROMOTION_VALUE_INVALID",
                    "Giá trị giảm phải lớn hơn hoặc bằng 0."
            );
        }

        if ("PERCENT".equals(type)
                && value.compareTo(ONE_HUNDRED) > 0) {
            throw badRequest(
                    "PROMOTION_PERCENT_INVALID",
                    "Phần trăm giảm không được vượt quá 100%."
            );
        }

        if ("FIXED".equals(type)
                && value.stripTrailingZeros().scale() > 0) {
            throw badRequest(
                    "PROMOTION_FIXED_INVALID",
                    "Số tiền giảm cố định phải là số nguyên VNĐ."
            );
        }
    }

    private void validateOrderValues(
            BigDecimal minimum,
            BigDecimal maximum
    ) {
        if (minimum == null || minimum.compareTo(ZERO) < 0) {
            throw badRequest(
                    "PROMOTION_MINIMUM_INVALID",
                    "Giá trị đơn hàng tối thiểu phải lớn hơn hoặc bằng 0."
            );
        }

        if (maximum != null && maximum.compareTo(ZERO) < 0) {
            throw badRequest(
                    "PROMOTION_MAXIMUM_INVALID",
                    "Mức giảm tối đa không được âm."
            );
        }
    }

    private void validateDates(LocalDate startDate, LocalDate endDate) {
        if (startDate == null
                || endDate == null
                || !endDate.isAfter(startDate)) {
            throw badRequest(
                    "PROMOTION_DATES_INVALID",
                    "Ngày kết thúc phải sau ngày bắt đầu."
            );
        }
    }

    private void validateUsageLimit(Integer usageLimit) {
        if (usageLimit != null && usageLimit < 1) {
            throw badRequest(
                    "PROMOTION_USAGE_LIMIT_INVALID",
                    "Giới hạn lượt sử dụng phải từ 1 trở lên hoặc để trống."
            );
        }
    }

    private String currentRole() {
        return sessionAccess.current().role();
    }

    private void requireOwner() {
        if (!"OWNER".equals(currentRole())) {
            throw forbidden();
        }
    }

    private ApiException notFound() {
        return new ApiException(
                404,
                "PROMOTION_NOT_FOUND",
                "Không tìm thấy khuyến mãi."
        );
    }

    private ApiException forbidden() {
        return new ApiException(
                403,
                "FORBIDDEN",
                "Bạn không có quyền thực hiện thao tác này."
        );
    }

    private ApiException badRequest(String code, String message) {
        return new ApiException(400, code, message);
    }
}
