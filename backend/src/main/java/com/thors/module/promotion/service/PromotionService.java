package com.thors.module.promotion.service;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.promotion.dto.PromotionAdjustRequest;
import com.thors.module.promotion.dto.PromotionRequest;
import com.thors.module.promotion.dto.PromotionView;
import com.thors.module.promotion.dto.VoucherView;
import com.thors.module.promotion.entity.Promotion;
import com.thors.module.promotion.entity.Promotion.Schedule;
import com.thors.module.promotion.repository.PromotionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;

@Service
public class PromotionService {

    private final PromotionRepository repository;
    private final PromotionValidator validator;
    private final PromotionNotifier notifier;

    public PromotionService(PromotionRepository repository, PromotionValidator validator, PromotionNotifier notifier) {
        this.repository = repository;
        this.validator = validator;
        this.notifier = notifier;
    }

    // ---- Xem ----

    // Owner: tất cả khuyến mãi. Khách: mã còn dùng được (trang Checkout gọi)
    public List<PromotionView> list(Account actor) {
        LocalDateTime now = LocalDateTime.now();
        List<Promotion> promotions = "OWNER".equals(actor.role())
                ? repository.withProductIds(repository.findAll())
                : availableVouchers(now, actor.id());
        return promotions.stream().map(p -> PromotionView.from(p, now)).toList();
    }

    public PromotionView detail(int id) {
        Promotion p = find(id);
        return PromotionView.from(p.withProductIds(repository.findProductIds(id)), LocalDateTime.now());
    }

    public List<VoucherView> getVouchers(Integer customerId) {
        return availableVouchers(LocalDateTime.now(), customerId).stream().map(VoucherView::from).toList();
    }

    // ---- Tạo, sửa ----

    @Transactional
    public void create(Account actor, PromotionRequest request) {
        Promotion draft = validator.validate(request);
        if (!draft.isOrderVoucher()) {
            checkOverlap(0, draft.applyScope(), draft.productIds(), draft.startDate(), draft.endDate());
        }
        int id = repository.insert(draft, actor.id());
        repository.replaceProducts(id, draft.productIds());
        notifier.created(id, draft);
    }

    // Sửa toàn bộ khi chưa bắt đầu; không đổi loại khuyến mãi
    @Transactional
    public void update(int id, PromotionRequest request) {
        Promotion existing = find(id);
        if (!existing.canEdit(LocalDateTime.now())) {
            throw badRequest("PROMOTION_STARTED", "Khuyến mãi đã bắt đầu nên không thể chỉnh sửa.");
        }
        Promotion draft = validator.validate(request);
        if (!draft.type().equals(existing.type())) {
            throw badRequest("PROMOTION_TYPE_LOCKED", "Không thể đổi loại khuyến mãi.");
        }
        if (!draft.isOrderVoucher() && existing.isActive()) {
            checkOverlap(id, draft.applyScope(), draft.productIds(), draft.startDate(), draft.endDate());
        }
        repository.update(id, draft);
        repository.replaceProducts(id, draft.productIds());
    }

    // Khi đang chạy: chỉ gia hạn ngày kết thúc và đổi lượt dùng (mã giảm giá online)
    @Transactional
    public void adjust(int id, PromotionAdjustRequest request) {
        if (!find(id).isOrderVoucher()) repository.lockForWrite();
        Promotion p = repository.lockById(id).orElseThrow(PromotionService::notFound);
        if (!p.canAdjust(LocalDateTime.now())) {
            throw badRequest("PROMOTION_NOT_RUNNING", "Chỉ sửa được thời gian và lượt dùng khi khuyến mãi đang diễn ra.");
        }
        LocalDateTime end = validator.extendedEnd(p, request.endDate());
        Integer usageLimit = validator.usageLimit(p, request.usageLimit());
        if (!p.isOrderVoucher() && p.isActive() && end.isAfter(p.endDate())) {
            checkOverlap(id, p.applyScope(), repository.findProductIds(id), p.startDate(), end);
        }
        repository.adjust(id, end, usageLimit);
    }

    // ---- Vòng đời ----

    // Bật/tắt khi chưa kết thúc; đang chạy thì không tắt (dùng Kết thúc sớm). Yêu cầu trùng trạng thái hiện tại thì bỏ qua
    @Transactional
    public void changeStatus(int id, String status) {
        String next = validator.status(status);
        Promotion p = find(id);
        LocalDateTime now = LocalDateTime.now();
        Schedule schedule = p.schedule(now);
        if (schedule == Schedule.ENDED) {
            throw badRequest("PROMOTION_ENDED", "Khuyến mãi đã kết thúc nên không thể bật hoặc tắt.");
        }
        if ("ACTIVE".equals(next)) {
            if (!p.canEnable(now)) return;
            if (!p.isOrderVoucher()) {
                checkOverlap(id, p.applyScope(), repository.findProductIds(id), p.startDate(), p.endDate());
            }
        } else if (!p.canDisable(now)) {
            if (schedule == Schedule.ONGOING && p.isActive()) {
                throw badRequest("PROMOTION_RUNNING", "Khuyến mãi đang diễn ra nên không thể tắt. Hãy dùng Kết thúc sớm.");
            }
            return;
        }
        repository.updateStatus(id, next);
    }

    // Kết thúc ngay; đơn đã đặt giữ nguyên số tiền đã giảm
    @Transactional
    public void endEarly(int id) {
        Promotion p = find(id);
        LocalDateTime now = LocalDateTime.now().truncatedTo(ChronoUnit.SECONDS);
        if (!p.canEndEarly(now)) throw badRequest("PROMOTION_NOT_RUNNING", "Chỉ kết thúc sớm được khuyến mãi đang diễn ra.");
        // end_date phải sau start_date (ràng buộc DB)
        repository.endAt(id, now.isAfter(p.startDate()) ? now : p.startDate().plusSeconds(1));
    }

    // Chỉ xóa khuyến mãi sắp diễn ra và chưa gắn với đơn nào
    @Transactional
    public void delete(int id) {
        Promotion p = find(id);
        if (!p.canDelete(LocalDateTime.now()) || repository.hasOrders(id)) {
            throw badRequest("PROMOTION_NOT_DELETABLE", "Chỉ xóa được khuyến mãi sắp diễn ra và chưa có đơn nào sử dụng.");
        }
        repository.delete(id);
    }

    // ---- Dùng chung ----

    // PromotionReportService dùng lại
    Promotion find(int id) {
        return repository.findById(id).orElseThrow(PromotionService::notFound);
    }

    // Một sản phẩm không thuộc hai khuyến mãi sản phẩm đang bật trùng thời gian
    private void checkOverlap(int id, String scope, List<Integer> productIds, LocalDateTime start, LocalDateTime end) {
        repository.lockForWrite();
        repository.findOverlappingProductPromotion(id, scope, productIds, start, end).ifPresent(other -> {
            throw badRequest("PROMOTION_PRODUCT_OVERLAP", "Có sản phẩm đang thuộc khuyến mãi “" + other.name() + "” trong cùng thời gian.");
        });
    }

    private List<Promotion> availableVouchers(LocalDateTime now, Integer customerId) {
        Set<Integer> used = customerId == null ? Set.of() : repository.findUsedPromotionIds(customerId);
        return repository.findAvailableVouchers(now).stream()
                .filter(p -> !p.isExhausted() && !used.contains(p.promotionId()))
                .toList();
    }

    private static ApiException notFound() {
        return new ApiException(404, "PROMOTION_NOT_FOUND", "Không tìm thấy khuyến mãi.");
    }

    static ApiException badRequest(String code, String message) {
        return new ApiException(400, code, message);
    }
}
