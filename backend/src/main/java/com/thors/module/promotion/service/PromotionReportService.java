package com.thors.module.promotion.service;

import com.thors.common.ApiException;
import com.thors.module.promotion.dto.PromotionOrder;
import com.thors.module.promotion.dto.PromotionOrderDetail;
import com.thors.module.promotion.dto.PromotionOrdersReport;
import com.thors.module.promotion.dto.PromotionSaleItem;
import com.thors.module.promotion.dto.PromotionSaleOrder;
import com.thors.module.promotion.dto.PromotionSalesReport;
import com.thors.module.promotion.entity.Promotion;
import com.thors.module.promotion.repository.PromotionRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

// Báo cáo hiệu quả: mã giảm giá online theo đơn, khuyến mãi sản phẩm theo dòng hàng
@Service
public class PromotionReportService {

    private static final Set<String> CHANNELS = Set.of("Online", "In-Store");
    private static final Set<String> NOT_COUNTED = Set.of("CANCELLED", "REJECTED", "EXPIRED");

    private final PromotionService promotions;
    private final PromotionRepository repository;

    public PromotionReportService(PromotionService promotions, PromotionRepository repository) {
        this.promotions = promotions;
        this.repository = repository;
    }

    public PromotionOrdersReport getOrders(int id) {
        Promotion p = promotions.find(id);
        if (!p.isOrderVoucher()) {
            throw PromotionService.badRequest("PROMOTION_KIND_INVALID", "Khuyến mãi sản phẩm xem ở báo cáo hiệu quả khuyến mãi.");
        }
        List<PromotionOrder> orders = repository.findOrders(id);
        List<PromotionOrder> counted = orders.stream().filter(o -> !NOT_COUNTED.contains(o.orderStatus())).toList();
        return new PromotionOrdersReport(counted.size(), sum(counted.stream().map(PromotionOrder::discountAmount).toList()),
                sum(counted.stream().map(PromotionOrder::totalAmount).toList()), p.remaining(), orders);
    }

    // channel: Online, In-Store hoặc null (tất cả)
    public PromotionSalesReport getSales(int id, String channel) {
        if (promotions.find(id).isOrderVoucher()) {
            throw PromotionService.badRequest("PROMOTION_KIND_INVALID", "Mã giảm giá online xem ở danh sách đơn đã dùng mã.");
        }
        if (channel != null && !CHANNELS.contains(channel)) {
            throw PromotionService.badRequest("PROMOTION_CHANNEL_INVALID", "Kênh bán chỉ được là Online hoặc In-Store.");
        }
        List<PromotionSaleOrder> orders = repository.findSaleItems(id, channel).stream()
                .collect(Collectors.groupingBy(PromotionSaleItem::orderId, LinkedHashMap::new, Collectors.toList()))
                .values().stream().map(PromotionReportService::toOrder).toList();
        return new PromotionSalesReport(orders.size(), orders.stream().mapToInt(PromotionSaleOrder::quantity).sum(),
                sum(orders.stream().map(PromotionSaleOrder::discountAmount).toList()),
                sum(orders.stream().map(PromotionSaleOrder::revenue).toList()), orders);
    }

    // Popup một đơn trong báo cáo; đơn không dùng khuyến mãi này thì coi như không tìm thấy
    public PromotionOrderDetail getOrderDetail(int id, int orderId) {
        promotions.find(id);
        return repository.findOrderDetail(id, orderId)
                .orElseThrow(() -> new ApiException(404, "PROMOTION_ORDER_NOT_FOUND", "Không tìm thấy đơn dùng khuyến mãi này."));
    }

    // Gộp các dòng hàng của cùng một đơn
    private static PromotionSaleOrder toOrder(List<PromotionSaleItem> rows) {
        BigDecimal original = BigDecimal.ZERO;
        BigDecimal revenue = BigDecimal.ZERO;
        int quantity = 0;
        for (PromotionSaleItem r : rows) {
            BigDecimal qty = BigDecimal.valueOf(r.quantity());
            original = original.add(r.originalPrice().multiply(qty));
            revenue = revenue.add(r.unitPrice().multiply(qty));
            quantity += r.quantity();
        }
        List<PromotionSaleOrder.Line> items = rows.stream()
                .map(r -> new PromotionSaleOrder.Line(r.productName(), r.size(), r.color(), r.quantity(), r.unitPrice()))
                .toList();
        PromotionSaleItem first = rows.get(0);
        return new PromotionSaleOrder(first.orderId(), first.orderNumber(), first.orderType(), first.orderDate(), quantity,
                original, original.subtract(revenue), revenue, items);
    }

    private static BigDecimal sum(List<BigDecimal> values) {
        return values.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
