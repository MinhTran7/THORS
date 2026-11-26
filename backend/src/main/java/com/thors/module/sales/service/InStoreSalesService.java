package com.thors.module.sales.service;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.payment.service.PayOSService;
import com.thors.module.promotion.dto.SalePrice;
import com.thors.module.promotion.service.PricingService;
import com.thors.module.sales.dto.CreateInStoreSaleRequest;
import com.thors.module.sales.dto.InStoreSaleDetailResponse;
import com.thors.module.sales.dto.InStoreSalePageResponse;
import com.thors.module.sales.dto.SellerOption;
import com.thors.module.sales.dto.VariantSale;
import com.thors.module.sales.entity.SaleVariant;
import com.thors.module.sales.repository.InStoreSalesRepository;
import com.thors.module.warehouse.repository.WarehouseStore;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;

@Service
public class InStoreSalesService {

    private final InStoreSalesRepository repository;
    private final InStoreSaleValidator validator;
    private final PricingService pricing;
    private final InStoreSaleCompleter completer;
    private final PayOSService payOS;
    private final WarehouseStore warehouse;

    public InStoreSalesService(InStoreSalesRepository repository, InStoreSaleValidator validator, PricingService pricing,
                               InStoreSaleCompleter completer, PayOSService payOS, WarehouseStore warehouse) {
        this.repository = repository;
        this.validator = validator;
        this.pricing = pricing;
        this.completer = completer;
        this.payOS = payOS;
        this.warehouse = warehouse;
    }

    // ---- Tạo hóa đơn ----

    // READ_COMMITTED: số hàng đang giữ cho đơn online luôn đọc bản mới nhất sau khi khóa biến thể
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public InStoreSaleDetailResponse createSale(Account seller, CreateInStoreSaleRequest request) {
        String requestId = validator.requestId(request.requestId());
        Map<Integer, Integer> quantities = validator.quantities(request.items());

        warehouse.lock();
        Map<Integer, SaleVariant> variants = new LinkedHashMap<>();
        for (int detailId : quantities.keySet()) {
            SaleVariant variant = repository.lockVariant(detailId).orElseThrow(() -> new ApiException(400, "INVALID_SALE",
                    "Có sản phẩm trong hóa đơn không còn tồn tại. Vui lòng xóa sản phẩm đó và thêm lại."));
            variants.put(detailId, variant.withDefective(warehouse.units().openDefects(detailId)));
        }
        var existing = repository.findOrderIdByRequest(requestId);
        if (existing.isPresent()) {
            return findSale(existing.get());
        }

        BiFunction<Integer, BigDecimal, SalePrice> quoter = pricing.quoter();
        List<SaleLine> lines = new ArrayList<>();
        for (var entry : quantities.entrySet()) {
            SaleVariant variant = variants.get(entry.getKey());
            validator.sellable(variant, entry.getValue());
            lines.add(new SaleLine(variant, entry.getValue(), quoter.apply(variant.productId(), variant.price())));
        }
        BigDecimal subtotal = lines.stream().map(SaleLine::total).reduce(BigDecimal.ZERO, BigDecimal::add);
        validator.samePrice(request.expectedSubtotal(), subtotal);

        BigDecimal discount = validator.discount(request.discountAmount(), subtotal, seller);
        String paymentMethod = validator.paymentMethod(request.paymentMethod());
        BigDecimal total = subtotal.subtract(discount);
        validator.transferAmount(paymentMethod, total);

        int orderId = SaleNumbers.insertWithUniqueNumber("POS", number ->
                repository.insertOrder(number, seller.id(), paymentMethod, subtotal, discount, total, requestId, LocalDateTime.now()));
        for (SaleLine line : lines) {
            repository.insertItem(orderId, line.variant(), line.quantity(), line.price());
        }
        if ("CASH".equals(paymentMethod)) {
            completer.complete(orderId, paymentMethod);
        }
        return findSale(orderId);
    }

    @Transactional
    public InStoreSaleDetailResponse cancel(Account seller, int orderId) {
        if (!payOS.cancelPaymentLink(seller, orderId)) {
            completer.lockAwaiting(orderId);
            repository.failPendingPayments(orderId, "Người bán hủy hóa đơn");
            repository.releaseItems(orderId);
            repository.markCancelled(orderId, "Người bán hủy hóa đơn", LocalDateTime.now());
        }
        return findSale(orderId);
    }

    // ---- Lịch sử, chi tiết, giá ----

    @Transactional(readOnly = true)
    public InStoreSalePageResponse listSales(String q, LocalDate fromDate, LocalDate toDate, Integer sellerId,
                                             String paymentMethod, int page, int size) {
        validator.dateRange(fromDate, toDate);
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), 50);
        var filter = new InStoreSalesRepository.Filter(
                q == null || q.isBlank() ? null : q.trim(),
                fromDate, toDate,
                sellerId != null && sellerId > 0 ? sellerId : null,
                paymentMethod == null || paymentMethod.isBlank() ? null : validator.paymentMethod(paymentMethod));
        long total = repository.countSales(filter);
        return new InStoreSalePageResponse(repository.findSales(filter, safeSize, (long) safePage * safeSize),
                total, (int) Math.ceil((double) total / safeSize));
    }

    @Transactional(readOnly = true)
    public InStoreSaleDetailResponse getSaleDetail(int orderId) {
        return findSale(orderId);
    }

    public List<SellerOption> listSellers() {
        return repository.findSellers();
    }

    // Giá sau khuyến mãi và số còn bán được (đã trừ hàng giữ cho đơn khác) của từng biến thể
    public Map<Integer, VariantSale> variantSales(int productId) {
        BiFunction<Integer, BigDecimal, SalePrice> quoter = pricing.quoter();
        Map<Integer, VariantSale> result = new LinkedHashMap<>();
        repository.findVariantStocks(productId).forEach((detailId, v) ->
                result.put(detailId, new VariantSale(quoter.apply(productId, v.price()).price(),
                        Math.max(0, v.available() - warehouse.units().openDefects(detailId)))));
        return result;
    }

    // ---- Tiện ích ----

    private InStoreSaleDetailResponse findSale(int orderId) {
        return repository.findSale(orderId)
                .orElseThrow(() -> new ApiException(404, "NOT_FOUND", "Không tìm thấy hóa đơn bán hàng tại quầy."));
    }

    // Một dòng hóa đơn: price gồm giá gốc, giá sau khuyến mãi và khuyến mãi đã áp dụng
    private record SaleLine(SaleVariant variant, int quantity, SalePrice price) {
        BigDecimal total() {
            return price.price().multiply(BigDecimal.valueOf(quantity));
        }
    }
}
