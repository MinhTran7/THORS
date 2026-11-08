package com.thors.module.sizeadvice;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.sizeadvice.SizeAdviceRepository.OrderLine;
import com.thors.module.sizeadvice.SizeAdviceRepository.PurchasedItem;
import com.thors.module.sizeadvice.SizeAdvisor.Advice;
import com.thors.module.sizeadvice.SizeAdvisor.FitStats;
import com.thors.module.sizeadvice.SizeAdvisor.PastItem;
import com.thors.module.sizeadvice.SizeAdvisor.Profile;
import com.thors.module.sizeadvice.SizeChart.SizeType;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SizeAdviceService {
    private static final Set<String> RATEABLE_STATUSES = Set.of("DELIVERED", "COMPLETED");
    private static final Set<String> FITS = Set.of("TIGHT", "TRUE", "LOOSE");

    private final SizeAdviceRepository repo;

    public SizeAdviceService(SizeAdviceRepository repo) {
        this.repo = repo;
    }

    /** Size chung (áo, quần, giày) theo số đo — để xem trước ở trang Hồ sơ khi khách đang nhập. */
    public record General(String top, String bottom, String shoe, String note) {}

    public General general(Integer heightCm, Integer weightKg, Double footLengthCm, String fitPreference) {
        Integer footMm = footLengthCm == null ? null : (int) Math.round(footLengthCm * 10);
        Integer top = SizeChart.chartIndex(SizeType.TOP, heightCm, weightKg, null);
        Integer bottom = SizeChart.chartIndex(SizeType.BOTTOM, heightCm, weightKg, null);
        Integer shoe = SizeChart.chartIndex(SizeType.SHOE, null, null, footMm);

        String note = null;
        if (top != null) {
            top = SizeChart.clamp(SizeType.TOP, top + SizeChart.preferenceShift(SizeType.TOP, fitPreference));
            int gap = SizeChart.topIndexByWeight(weightKg) - SizeChart.topIndexByHeight(heightCm);
            if (gap >= 2) note = "Cân nặng cao so với chiều cao, áo có thể hơi dài — nên xem thêm bảng số đo của từng mẫu.";
            else if (gap <= -2) note = "Dáng người cao và mảnh, áo có thể hơi rộng — có thể chọn form slim nếu có.";
        }
        return new General(
                top == null ? null : SizeChart.sizeAt(SizeType.TOP, top),
                bottom == null ? null : SizeChart.sizeAt(SizeType.BOTTOM, bottom),
                shoe == null ? null : SizeChart.sizeAt(SizeType.SHOE, shoe),
                note);
    }

    /** Size gợi ý cho khách đang đăng nhập với một sản phẩm cụ thể. */
    public Advice productAdvice(Account actor, int productId) {
        String category = repo.categoryOf(productId)
                .orElseThrow(() -> new ApiException(404, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm."));
        Map<String, Integer> stock = repo.stockBySize(productId);
        SizeType type = SizeChart.classify(category, stock.keySet());
        if (type == SizeType.NONE)
            return SizeAdvisor.advise(type, stock, null, List.of(), FitStats.EMPTY, List.of());

        Profile profile = repo.profile(actor.id());

        // Món cùng loại khách đã nhận: bỏ qua món trả vì lý do không liên quan size (lỗi, giao nhầm...)
        List<PurchasedItem> purchased = new ArrayList<>();
        for (PurchasedItem p : repo.purchasedItems(actor.id())) {
            if (SizeChart.classify(p.categoryName(), List.of(p.size())) != type) continue;
            if (SizeChart.indexOf(type, p.size()) < 0) continue;
            if (p.fit() == null && p.returnReason() != null && SizeAdvisor.fitFromReturnReason(p.returnReason()) == null)
                continue;
            purchased.add(p);
        }

        Set<Integer> productIds = new HashSet<>();
        productIds.add(productId);
        purchased.forEach(p -> productIds.add(p.productId()));
        Map<Integer, FitStats> stats = repo.fitStats(productIds);

        List<PastItem> history = purchased.stream()
                .map(p -> {
                    boolean explicit = p.fit() != null;
                    String fit = explicit
                            ? p.fit()
                            : p.returnReason() != null ? SizeAdvisor.fitFromReturnReason(p.returnReason()) : "TRUE";
                    int offset = stats.getOrDefault(p.productId(), FitStats.EMPTY).offset();
                    return new PastItem(SizeChart.indexOf(type, p.size()), fit, explicit, offset);
                })
                .toList();

        return SizeAdvisor.advise(
                type,
                stock,
                profile,
                history,
                stats.getOrDefault(productId, FitStats.EMPTY),
                repo.fittingPeers(productId, actor.id()));
    }

    /** Một dòng đơn kèm việc có đánh giá Chật/Vừa/Rộng được không. */
    public record LineFeedback(int orderItemId, boolean rateable, String fit) {}

    public List<LineFeedback> orderFeedback(Account actor, int orderId) {
        List<OrderLine> lines = repo.orderLines(orderId, actor.id());
        if (lines.isEmpty()) throw new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng.");
        return lines.stream().map(l -> new LineFeedback(l.orderItemId(), rateable(l), l.fit())).toList();
    }

    /** Ghi đánh giá Chật/Vừa/Rộng (fit = null để xóa) cho một món trong đơn đã nhận của chính khách. */
    @Transactional
    public LineFeedback saveFeedback(Account actor, int orderItemId, String fit) {
        if (fit != null && !FITS.contains(fit))
            throw new ApiException(400, "FIT", "Đánh giá phải là TIGHT, TRUE hoặc LOOSE.");
        OrderLine line = repo.orderLine(orderItemId, actor.id())
                .orElseThrow(() -> new ApiException(404, "ORDER_ITEM_NOT_FOUND", "Không tìm thấy sản phẩm trong đơn."));
        if (!rateable(line))
            throw new ApiException(400, "FIT_NOT_ALLOWED", "Chỉ đánh giá size được cho quần áo, giày dép trong đơn đã nhận.");

        if (fit == null) repo.deleteFeedback(orderItemId, actor.id());
        else repo.saveFeedback(orderItemId, actor.id(), fit, repo.profile(actor.id()));
        return new LineFeedback(orderItemId, true, fit);
    }

    private static boolean rateable(OrderLine l) {
        return RATEABLE_STATUSES.contains(l.orderStatus())
                && SizeChart.classify(l.categoryName(), List.of(l.size())) != SizeType.NONE;
    }
}
