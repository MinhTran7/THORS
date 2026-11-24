package com.thors.module.promotion.service;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.notification.service.NotificationPublisher;
import com.thors.module.notification.service.NotificationTypes;
import com.thors.module.promotion.dto.PromotionAdjustRequest;
import com.thors.module.promotion.dto.PromotionOrder;
import com.thors.module.promotion.dto.PromotionRequest;
import com.thors.module.promotion.dto.PromotionView;
import com.thors.module.promotion.dto.VoucherView;
import com.thors.module.promotion.entity.Promotion;
import com.thors.module.promotion.repository.PromotionRepository;
import com.thors.security.SessionAccess;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

@Service
public class PromotionService {

    private static final BigDecimal ONE_HUNDRED = new BigDecimal("100");
    // Giới hạn số tiền (giảm cố định, đơn tối thiểu): vừa cột DECIMAL(12) và ô nhập 10 chữ số
    private static final BigDecimal MAX_AMOUNT = new BigDecimal("9999999999");
    private static final DateTimeFormatter NOTICE_TIME = DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy");

    private final PromotionRepository repository;
    private final SessionAccess sessionAccess;
    private final NotificationPublisher notifications;
    private final PricingService pricing;

    public PromotionService(PromotionRepository repository, SessionAccess sessionAccess, NotificationPublisher notifications,
                            PricingService pricing) {
        this.repository = repository;
        this.sessionAccess = sessionAccess;
        this.notifications = notifications;
        this.pricing = pricing;
    }

    // ---- Xem ----

    // Owner xem tất cả. Nhánh khách giữ cho trang Checkout cũ (trang khách mới dùng getVouchers)
    public List<PromotionView> getAll() {
        LocalDateTime now = LocalDateTime.now();
        Account account = sessionAccess.current();
        List<Promotion> promotions = switch (account.role()) {
            case "OWNER" -> repository.findAll();
            case "CUSTOMER" -> availableVouchers(now, account.id());
            default -> throw forbidden();
        };
        return repository.withProductIds(promotions).stream().map(p -> PromotionView.of(p, now)).toList();
    }

    public PromotionView getById(int id) {
        requireOwner();
        return PromotionView.of(repository.withProductIds(find(id)), LocalDateTime.now());
    }

    public List<PromotionOrder> getOrders(int id) {
        requireOwner();
        find(id);
        return repository.findOrders(id);
    }

    // Mã giảm giá online còn hiệu lực, còn lượt; khách đã đăng nhập không thấy mã mình đã dùng
    public List<VoucherView> getVouchers() {
        return availableVouchers(LocalDateTime.now(), currentCustomerId()).stream().map(VoucherView::of).toList();
    }

    // Giữ cho Checkout đang gọi; tính giá nằm ở PricingService
    public BigDecimal salePrice(int productId, BigDecimal price) {
        return pricing.salePrice(productId, price);
    }

    // ---- Tạo, sửa ----

    @Transactional
    public PromotionView create(PromotionRequest request) {
        requireOwner();
        Draft d = validate(request);
        if (!d.isVoucher()) {
            repository.lockForWrite();
            checkProductOverlap(0, d.scope(), d.productIds(), d.start(), d.end());
        }

        int id = repository.create(d.type(), d.name(), d.description(), d.discountType(), d.value(), d.minimum(),
                d.start(), d.end(), d.usageLimit(), d.scope(), sessionAccess.current().id());
        repository.replacePromotionProducts(id, d.productIds());
        afterCommit(() -> notifyCustomersCreated(id, d));
        return PromotionView.of(repository.withProductIds(find(id)), LocalDateTime.now());
    }

    // Sửa toàn bộ: chỉ khi chưa bắt đầu, không đổi loại khuyến mãi
    @Transactional
    public void update(int id, PromotionRequest request) {
        requireOwner();
        Promotion existing = find(id);
        if (!existing.canEdit(LocalDateTime.now())) {
            throw badRequest("PROMOTION_STARTED", "Khuyến mãi đã bắt đầu nên không thể chỉnh sửa.");
        }
        Draft d = validate(request);
        if (!d.type().equals(existing.type())) {
            throw badRequest("PROMOTION_TYPE_LOCKED", "Không thể đổi loại khuyến mãi.");
        }
        if (!d.isVoucher() && existing.isActive()) {
            repository.lockForWrite();
            checkProductOverlap(id, d.scope(), d.productIds(), d.start(), d.end());
        }
        repository.update(id, d.name(), d.description(), d.discountType(), d.value(), d.minimum(), d.start(), d.end(),
                d.usageLimit(), d.scope());
        repository.replacePromotionProducts(id, d.productIds());
    }

    // Sửa khi đang chạy: chỉ gia hạn ngày kết thúc và điều chỉnh lượt dùng (mã giảm giá online)
    @Transactional
    public void adjust(int id, PromotionAdjustRequest request) {
        requireOwner();
        if (request == null) {
            throw badRequest("PROMOTION_REQUIRED", "Vui lòng nhập thông tin cần sửa.");
        }
        if (!find(id).isOrderVoucher()) {
            repository.lockForWrite();
        }
        Promotion p = repository.lockById(id).orElseThrow(PromotionService::notFound);
        if (!p.canAdjust(LocalDateTime.now())) {
            throw badRequest("PROMOTION_NOT_RUNNING", "Chỉ sửa được thời gian và lượt dùng khi khuyến mãi đang diễn ra.");
        }

        LocalDateTime end = request.endDate() == null ? p.endDate() : request.endDate();
        if (end.isBefore(p.endDate())) {
            throw badRequest("PROMOTION_END_INVALID", "Chỉ được gia hạn, thời gian kết thúc mới phải sau thời gian cũ.");
        }

        Integer usageLimit = p.usageLimit();
        if (p.isOrderVoucher() && request.usageLimit() != null) {
            usageLimit = request.usageLimit();
            if (usageLimit < Math.max(1, p.usedCount())) {
                throw badRequest("PROMOTION_USAGE_LIMIT_INVALID",
                        "Giới hạn lượt dùng phải từ 1 trở lên và không nhỏ hơn số lượt đã dùng (" + p.usedCount() + ").");
            }
        }

        if (!p.isOrderVoucher() && p.isActive() && end.isAfter(p.endDate())) {
            checkProductOverlap(id, p.applyScope(), repository.findProductIds(id), p.startDate(), end);
        }
        repository.adjust(id, end, usageLimit);
    }

    // ---- Vòng đời: bật/tắt, kết thúc sớm, xóa ----

    @Transactional
    public void changeStatus(int id, String status) {
        requireOwner();
        String next = status == null ? "" : status.trim().toUpperCase(Locale.ROOT);
        if (!"ACTIVE".equals(next) && !"INACTIVE".equals(next)) {
            throw badRequest("PROMOTION_STATUS_INVALID", "Trạng thái chỉ được là ACTIVE hoặc INACTIVE.");
        }

        Promotion p = find(id);
        LocalDateTime now = LocalDateTime.now();
        Promotion.Schedule schedule = p.schedule(now);
        if (schedule == Promotion.Schedule.ENDED) {
            throw badRequest("PROMOTION_ENDED", "Khuyến mãi đã kết thúc nên không thể bật hoặc tắt.");
        }
        if ("ACTIVE".equals(next)) {
            if (!p.canEnable(now)) {
                return;
            }
            if (!p.isOrderVoucher()) {
                repository.lockForWrite();
                checkProductOverlap(id, p.applyScope(), repository.findProductIds(id), p.startDate(), p.endDate());
            }
        } else if (!p.canDisable(now)) {
            if (schedule == Promotion.Schedule.ONGOING && p.isActive()) {
                throw badRequest("PROMOTION_RUNNING", "Khuyến mãi đang diễn ra nên không thể tắt. Hãy dùng Kết thúc sớm.");
            }
            return;
        }
        repository.updateStatus(id, next);
    }

    // Kết thúc ngay khuyến mãi đang chạy: đơn đã đặt giữ nguyên số tiền đã giảm
    @Transactional
    public void endEarly(int id) {
        requireOwner();
        Promotion p = find(id);
        LocalDateTime now = LocalDateTime.now().truncatedTo(ChronoUnit.SECONDS);
        if (!p.canEndEarly(now)) {
            throw badRequest("PROMOTION_NOT_RUNNING", "Chỉ kết thúc sớm được khuyến mãi đang diễn ra.");
        }
        repository.endAt(id, now.isAfter(p.startDate()) ? now : p.startDate().plusSeconds(1));
    }

    // Chỉ xóa khuyến mãi sắp diễn ra và chưa có đơn nào gắn với nó
    @Transactional
    public void delete(int id) {
        requireOwner();
        Promotion p = find(id);
        if (!p.canDelete(LocalDateTime.now()) || repository.countOrders(id) > 0) {
            throw badRequest("PROMOTION_NOT_DELETABLE", "Chỉ xóa được khuyến mãi sắp diễn ra và chưa có đơn nào sử dụng.");
        }
        repository.delete(id);
    }

    // ---- Kiểm tra dữ liệu ----

    // Dữ liệu khuyến mãi đã chuẩn hóa và kiểm tra (dùng chung cho tạo và sửa)
    private record Draft(String type, String name, String description, String discountType, BigDecimal value,
                         BigDecimal minimum, LocalDateTime start, LocalDateTime end, Integer usageLimit, String scope,
                         List<Integer> productIds) {
        boolean isVoucher() {
            return Promotion.ORDER_VOUCHER.equals(type);
        }
    }

    private Draft validate(PromotionRequest r) {
        if (r == null) {
            throw badRequest("PROMOTION_REQUIRED", "Vui lòng nhập thông tin khuyến mãi.");
        }

        String type = r.type() == null ? "" : r.type().trim().toUpperCase(Locale.ROOT);
        if (!Promotion.PRODUCT_DISCOUNT.equals(type) && !Promotion.ORDER_VOUCHER.equals(type)) {
            throw badRequest("PROMOTION_KIND_INVALID", "Loại khuyến mãi không hợp lệ.");
        }
        boolean voucher = Promotion.ORDER_VOUCHER.equals(type);

        String name = r.name() == null ? "" : r.name().trim();
        if (name.isEmpty() || name.length() > 100) {
            throw badRequest("PROMOTION_NAME_INVALID", "Tên khuyến mãi không được để trống và tối đa 100 ký tự.");
        }

        String description = r.description() == null || r.description().isBlank() ? null : r.description().trim();
        if (description != null && description.length() > 255) {
            throw badRequest("PROMOTION_DESCRIPTION_INVALID", "Mô tả tối đa 255 ký tự.");
        }

        String discountType = r.discountType() == null ? "" : r.discountType().trim().toUpperCase(Locale.ROOT);
        BigDecimal value = r.discountValue();
        if (!"PERCENT".equals(discountType) && !"FIXED".equals(discountType)) {
            throw badRequest("PROMOTION_TYPE_INVALID", "Loại giảm giá không hợp lệ.");
        }
        if (value == null || value.signum() <= 0) {
            throw badRequest("PROMOTION_VALUE_INVALID", "Giá trị giảm giá phải lớn hơn 0.");
        }
        if ("PERCENT".equals(discountType) && (value.compareTo(ONE_HUNDRED) > 0 || value.stripTrailingZeros().scale() > 2)) {
            throw badRequest("PROMOTION_PERCENT_INVALID", "Phần trăm giảm tối đa 100% và tối đa 2 chữ số thập phân.");
        }
        if ("FIXED".equals(discountType) && !isWholeAmount(value)) {
            throw badRequest("PROMOTION_FIXED_INVALID", "Số tiền giảm cố định phải là số nguyên VNĐ, tối đa 9.999.999.999.");
        }

        // Mã giảm giá online: bắt buộc đơn tối thiểu và giới hạn lượt dùng, áp cho cả đơn
        BigDecimal minimum = BigDecimal.ZERO;
        Integer usageLimit = null;
        if (voucher) {
            minimum = r.minOrderValue();
            if (minimum == null || minimum.signum() <= 0 || !isWholeAmount(minimum)) {
                throw badRequest("PROMOTION_MINIMUM_INVALID", "Giá trị đơn tối thiểu phải là số nguyên VNĐ từ 1 đến 9.999.999.999.");
            }
            if ("FIXED".equals(discountType) && value.compareTo(minimum) >= 0) {
                throw badRequest("PROMOTION_VALUE_INVALID", "Số tiền giảm phải nhỏ hơn giá trị đơn tối thiểu.");
            }
            usageLimit = r.usageLimit();
            if (usageLimit == null || usageLimit < 1) {
                throw badRequest("PROMOTION_USAGE_LIMIT_INVALID", "Vui lòng nhập giới hạn lượt dùng từ 1 trở lên.");
            }
        }

        LocalDateTime start = r.startDate();
        LocalDateTime end = r.endDate();
        if (start == null || end == null || start.isBefore(LocalDateTime.now().minusMinutes(15)) || !end.isAfter(start)) {
            throw badRequest("PROMOTION_DATES_INVALID",
                    "Thời gian bắt đầu phải từ hiện tại trở đi và thời gian kết thúc phải sau thời gian bắt đầu.");
        }

        String scope = voucher || r.applyScope() == null || r.applyScope().isBlank()
                ? "ALL" : r.applyScope().trim().toUpperCase(Locale.ROOT);
        if (!"ALL".equals(scope) && !"SELECTED".equals(scope)) {
            throw badRequest("PROMOTION_SCOPE_INVALID", "Phạm vi áp dụng không hợp lệ.");
        }

        return new Draft(type, name, description, discountType, value, minimum, start, end, usageLimit, scope,
                validateProducts(scope, r.productIds()));
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

    // Một sản phẩm không được thuộc hai khuyến mãi sản phẩm đang bật trùng thời gian
    private void checkProductOverlap(int id, String scope, List<Integer> productIds, LocalDateTime start, LocalDateTime end) {
        repository.findOverlappingProductPromotion(id, scope, productIds, start, end).ifPresent(other -> {
            throw badRequest("PROMOTION_PRODUCT_OVERLAP", "Có sản phẩm đang thuộc khuyến mãi “" + other.name() + "” trong cùng thời gian.");
        });
    }

    // Số tiền VNĐ nguyên, không vượt MAX_AMOUNT
    private static boolean isWholeAmount(BigDecimal value) {
        return value.stripTrailingZeros().scale() <= 0 && value.compareTo(MAX_AMOUNT) <= 0;
    }

    // ---- Tiện ích ----

    private List<Promotion> availableVouchers(LocalDateTime now, Integer customerId) {
        Set<Integer> used = customerId == null ? Set.of() : repository.findUsedPromotionIds(customerId);
        return repository.findAvailableVouchers(now).stream()
                .filter(p -> !p.isExhausted() && !used.contains(p.promotionId()))
                .toList();
    }

    private Integer currentCustomerId() {
        try {
            Account account = sessionAccess.current();
            return "CUSTOMER".equals(account.role()) ? account.id() : null;
        } catch (ApiException e) {
            return null;
        }
    }

    private Promotion find(int id) {
        return repository.findById(id).orElseThrow(PromotionService::notFound);
    }

    // Chạy sau khi transaction commit thành công (không có transaction thì chạy ngay)
    private static void afterCommit(Runnable task) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            task.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                task.run();
            }
        });
    }

    // Báo khách khi có khuyến mãi mới; khuyến mãi chưa bắt đầu không gắn liên kết
    private void notifyCustomersCreated(int id, Draft d) {
        String discount = "PERCENT".equals(d.discountType())
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
