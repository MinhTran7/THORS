package com.thors.module.promotion.service;

import com.thors.common.ApiException;
import com.thors.module.notification.service.NotificationPublisher;
import com.thors.module.notification.service.NotificationTypes;
import com.thors.module.promotion.dto.PromotionRequest;
import com.thors.module.promotion.entity.Promotion;
import com.thors.module.promotion.repository.PromotionRepository;
import com.thors.security.SessionAccess;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.function.BiFunction;

@Service
public class PromotionService {

    private static final BigDecimal ONE_HUNDRED = new BigDecimal("100");
    // Giới hạn số tiền (giảm cố định, đơn tối thiểu): vừa cột DECIMAL(12) và ô nhập 10 chữ số
    private static final BigDecimal MAX_AMOUNT = new BigDecimal("9999999999");
    private static final DateTimeFormatter NOTICE_TIME = DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy");

    private final PromotionRepository repository;
    private final SessionAccess sessionAccess;
    private final NotificationPublisher notifications;

    public PromotionService(PromotionRepository repository, SessionAccess sessionAccess, NotificationPublisher notifications) {
        this.repository = repository;
        this.sessionAccess = sessionAccess;
        this.notifications = notifications;
    }

    // ---- Xem ----

    // Owner xem tất cả; khách chỉ xem khuyến mãi còn hiệu lực và còn lượt
    public List<Promotion> getAll() {
        return switch (sessionAccess.current().role()) {
            case "OWNER" -> repository.findAll().stream().map(this::withProductIds).toList();
            case "CUSTOMER" -> repository.findAvailable(LocalDateTime.now()).stream()
                    .filter(promotion -> !promotion.isExhausted())
                    .map(this::withProductIds)
                    .toList();
            default -> throw forbidden();
        };
    }

    public Promotion getById(int id) {
        return withProductIds(switch (sessionAccess.current().role()) {
            case "OWNER" -> repository.findById(id).orElseThrow(PromotionService::notFound);
            case "CUSTOMER" -> repository.findAvailableById(id, LocalDateTime.now()).orElseThrow(PromotionService::notFound);
            default -> throw forbidden();
        });
    }

    // ---- Giá sau khuyến mãi ----

    public BigDecimal salePrice(int productId, BigDecimal price) {
        return repository.findRunningProductPromotion(productId, LocalDateTime.now())
                .map(promotion -> price.subtract(promotion.discountOf(price)))
                .orElse(price);
    }

    // Tính giá cho nhiều sản phẩm: chỉ đọc các khuyến mãi đang chạy một lần, kết quả giống salePrice
    public BiFunction<Integer, BigDecimal, BigDecimal> salePricer() {
        List<Promotion> running = repository.findRunningProductPromotions(LocalDateTime.now()).stream()
                .map(this::withProductIds)
                .toList();
        return (productId, price) -> running.stream()
                .filter(p -> "ALL".equals(p.applyScope()) || p.productIds().contains(productId))
                .findFirst()
                .map(p -> price.subtract(p.discountOf(price)))
                .orElse(price);
    }

    // ---- Tạo, sửa, bật/tắt ----

    @Transactional
    public Promotion create(PromotionRequest request) {
        requireOwner();
        Draft d = validate(request);
        checkProductOverlap(0, d.minimum(), d.scope(), d.productIds(), d.start(), d.end());

        int id = repository.create(d.name(), d.description(), d.type(), d.value(), d.minimum(), d.start(), d.end(),
                d.usageLimit(), d.scope(), sessionAccess.current().id());
        repository.replacePromotionProducts(id, d.productIds());
        notifyCustomersCreated(id, d);
        return withProductIds(repository.findById(id).orElseThrow(PromotionService::notFound));
    }

    // Chỉ sửa được khuyến mãi sắp diễn ra
    @Transactional
    public void update(int id, PromotionRequest request) {
        requireOwner();
        Promotion existing = repository.findById(id).orElseThrow(PromotionService::notFound);
        if (!LocalDateTime.now().isBefore(existing.startDate())) {
            throw badRequest("PROMOTION_STARTED", "Khuyến mãi đã bắt đầu nên không thể chỉnh sửa.");
        }

        Draft d = validate(request);
        if ("ACTIVE".equals(existing.status())) {
            checkProductOverlap(id, d.minimum(), d.scope(), d.productIds(), d.start(), d.end());
        }
        if (repository.update(id, d.name(), d.description(), d.type(), d.value(), d.minimum(), d.start(), d.end(),
                d.usageLimit(), d.scope()) == 0) {
            throw notFound();
        }
        repository.replacePromotionProducts(id, d.productIds());
    }

    // Bật lại: chưa kết thúc và không trùng sản phẩm; tắt: không được khi đang diễn ra
    @Transactional
    public void changeStatus(int id, String status) {
        requireOwner();
        String next = status == null ? "" : status.trim().toUpperCase(Locale.ROOT);
        if (!"ACTIVE".equals(next) && !"INACTIVE".equals(next)) {
            throw badRequest("PROMOTION_STATUS_INVALID", "Trạng thái chỉ được là ACTIVE hoặc INACTIVE.");
        }

        Promotion promotion = repository.findById(id).orElseThrow(PromotionService::notFound);
        LocalDateTime now = LocalDateTime.now();
        if ("ACTIVE".equals(next)) {
            if (!promotion.endDate().isAfter(now)) {
                throw badRequest("PROMOTION_ENDED", "Khuyến mãi đã kết thúc nên không thể bật lại.");
            }
            checkProductOverlap(id, promotion.minOrderValue(), promotion.applyScope(), repository.findProductIds(id),
                    promotion.startDate(), promotion.endDate());
        } else if ("ACTIVE".equals(promotion.status()) && !now.isBefore(promotion.startDate()) && now.isBefore(promotion.endDate())) {
            throw badRequest("PROMOTION_RUNNING", "Khuyến mãi đang diễn ra nên không thể tắt.");
        }
        repository.updateStatus(id, next);
    }

    // ---- Kiểm tra dữ liệu ----

    // Dữ liệu khuyến mãi đã chuẩn hóa và kiểm tra (dùng chung cho tạo và sửa)
    private record Draft(String name, String description, String type, BigDecimal value, BigDecimal minimum,
                         LocalDateTime start, LocalDateTime end, Integer usageLimit, String scope, List<Integer> productIds) {
    }

    private Draft validate(PromotionRequest r) {
        if (r == null) {
            throw badRequest("PROMOTION_REQUIRED", "Vui lòng nhập thông tin khuyến mãi.");
        }

        String name = r.name() == null ? "" : r.name().trim();
        if (name.isEmpty() || name.length() > 100) {
            throw badRequest("PROMOTION_NAME_INVALID", "Tên khuyến mãi không được để trống và tối đa 100 ký tự.");
        }

        String description = r.description() == null || r.description().isBlank() ? null : r.description().trim();
        if (description != null && description.length() > 255) {
            throw badRequest("PROMOTION_DESCRIPTION_INVALID", "Mô tả tối đa 255 ký tự.");
        }

        String type = r.discountType() == null ? "" : r.discountType().trim().toUpperCase(Locale.ROOT);
        BigDecimal value = r.discountValue();
        if (!"PERCENT".equals(type) && !"FIXED".equals(type)) {
            throw badRequest("PROMOTION_TYPE_INVALID", "Loại giảm giá không hợp lệ.");
        }
        if (value == null || value.signum() <= 0) {
            throw badRequest("PROMOTION_VALUE_INVALID", "Giá trị giảm giá phải lớn hơn 0.");
        }
        if ("PERCENT".equals(type) && (value.compareTo(ONE_HUNDRED) > 0 || value.stripTrailingZeros().scale() > 2)) {
            throw badRequest("PROMOTION_PERCENT_INVALID", "Phần trăm giảm tối đa 100% và tối đa 2 chữ số thập phân.");
        }
        if ("FIXED".equals(type) && !isWholeAmount(value)) {
            throw badRequest("PROMOTION_FIXED_INVALID", "Số tiền giảm cố định phải là số nguyên VNĐ, tối đa 9.999.999.999.");
        }

        // Có đơn tối thiểu = mã giảm đơn hàng (áp dụng cả cửa hàng, bắt buộc giới hạn lượt dùng)
        BigDecimal minimum = r.minOrderValue();
        if (minimum == null || minimum.signum() < 0 || !isWholeAmount(minimum)) {
            throw badRequest("PROMOTION_MINIMUM_INVALID", "Giá trị đơn tối thiểu phải là số nguyên VNĐ từ 0 đến 9.999.999.999.");
        }
        boolean orderVoucher = minimum.signum() > 0;
        if (orderVoucher && "FIXED".equals(type) && value.compareTo(minimum) >= 0) {
            throw badRequest("PROMOTION_VALUE_INVALID", "Số tiền giảm phải nhỏ hơn giá trị đơn tối thiểu.");
        }

        LocalDateTime start = r.startDate();
        LocalDateTime end = r.endDate();
        if (start == null || end == null || start.isBefore(LocalDateTime.now().minusMinutes(15)) || !end.isAfter(start)) {
            throw badRequest("PROMOTION_DATES_INVALID",
                    "Thời gian bắt đầu phải từ hiện tại trở đi và thời gian kết thúc phải sau thời gian bắt đầu.");
        }

        Integer usageLimit = orderVoucher ? r.usageLimit() : null;
        if (orderVoucher && (usageLimit == null || usageLimit < 1)) {
            throw badRequest("PROMOTION_USAGE_LIMIT_INVALID", "Vui lòng nhập giới hạn lượt dùng từ 1 trở lên.");
        }

        String scope = orderVoucher || r.applyScope() == null || r.applyScope().isBlank()
                ? "ALL" : r.applyScope().trim().toUpperCase(Locale.ROOT);
        if (!"ALL".equals(scope) && !"SELECTED".equals(scope)) {
            throw badRequest("PROMOTION_SCOPE_INVALID", "Phạm vi áp dụng không hợp lệ.");
        }

        return new Draft(name, description, type, value, minimum, start, end, usageLimit, scope, validateProducts(scope, r.productIds()));
    }

    private List<Integer> validateProducts(String scope, List<Integer> ids) {
        if ("ALL".equals(scope)) {
            return List.of();
        }
        if (ids == null || ids.isEmpty()) {
            throw badRequest("PROMOTION_PRODUCTS_REQUIRED", "Vui lòng chọn ít nhất một sản phẩm áp dụng.");
        }
        List<Integer> unique = ids.stream().filter(Objects::nonNull).distinct().toList();
        if (unique.size() != ids.size() || repository.countActiveProducts(unique) != unique.size()) {
            throw badRequest("PROMOTION_PRODUCTS_INVALID", "Danh sách sản phẩm không hợp lệ hoặc có sản phẩm không còn hoạt động.");
        }
        return unique;
    }

    // Một sản phẩm không được thuộc hai khuyến mãi sản phẩm trùng thời gian
    private void checkProductOverlap(int id, BigDecimal minimum, String scope, List<Integer> productIds,
                                     LocalDateTime start, LocalDateTime end) {
        if (minimum != null && minimum.signum() > 0) {
            return;
        }
        repository.findOverlappingProductPromotion(id, scope, productIds, start, end).ifPresent(other -> {
            throw badRequest("PROMOTION_PRODUCT_OVERLAP", "Có sản phẩm đang thuộc khuyến mãi “" + other.name() + "” trong cùng thời gian.");
        });
    }

    // Số tiền VNĐ nguyên, không vượt MAX_AMOUNT
    private static boolean isWholeAmount(BigDecimal value) {
        return value.stripTrailingZeros().scale() <= 0 && value.compareTo(MAX_AMOUNT) <= 0;
    }

    // ---- Tiện ích ----

    // Báo khách khi có khuyến mãi mới; khuyến mãi chưa bắt đầu không gắn liên kết (trang khách chỉ hiện khuyến mãi đang chạy)
    private void notifyCustomersCreated(int id, Draft d) {
        String discount = "PERCENT".equals(d.type())
                ? "giảm " + d.value().stripTrailingZeros().toPlainString() + "%"
                : "giảm " + String.format(Locale.forLanguageTag("vi-VN"), "%,d", d.value().longValue()) + "đ";
        boolean startsNow = !d.start().isAfter(LocalDateTime.now());
        String title = startsNow ? "Khuyến mãi mới đang diễn ra" : "Sắp có khuyến mãi mới";
        String message = startsNow
                ? "Khuyến mãi \"" + d.name() + "\" (" + discount + ") đã bắt đầu, áp dụng đến " + NOTICE_TIME.format(d.end()) + "."
                : "Khuyến mãi \"" + d.name() + "\" (" + discount + ") sẽ bắt đầu từ " + NOTICE_TIME.format(d.start())
                        + " đến " + NOTICE_TIME.format(d.end()) + ".";
        notifications.toRole("CUSTOMER", NotificationTypes.PROMOTION, title, message,
                startsNow ? NotificationTypes.ENTITY_PROMOTION : null, startsNow ? id : null);
    }

    private Promotion withProductIds(Promotion p) {
        return new Promotion(p.promotionId(), p.name(), p.description(), p.discountValue(), p.startDate(), p.endDate(),
                p.status(), p.createdBy(), p.discountType(), p.minOrderValue(), p.usageLimit(), p.applyScope(),
                repository.findProductIds(p.promotionId()), p.usedCount());
    }

    private void requireOwner() {
        if (!"OWNER".equals(sessionAccess.current().role())) {
            throw forbidden();
        }
    }

    private static ApiException notFound() {
        return new ApiException(404, "PROMOTION_NOT_FOUND", "Không tìm thấy khuyến mãi.");
    }

    private static ApiException forbidden() {
        return new ApiException(403, "FORBIDDEN", "Bạn không có quyền thực hiện thao tác này.");
    }

    private static ApiException badRequest(String code, String message) {
        return new ApiException(400, code, message);
    }
}
