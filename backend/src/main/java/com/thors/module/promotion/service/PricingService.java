package com.thors.module.promotion.service;

import com.thors.module.promotion.dto.SalePrice;
import com.thors.module.promotion.entity.Promotion;
import com.thors.module.promotion.repository.PromotionRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.function.BiFunction;

// Nơi duy nhất tính giá sau khuyến mãi sản phẩm (giỏ hàng, checkout, bán tại quầy)
@Service
public class PricingService {

    private final PromotionRepository repository;

    public PricingService(PromotionRepository repository) {
        this.repository = repository;
    }

    // Giá của một sản phẩm kèm khuyến mãi đang áp dụng
    public SalePrice quote(int productId, BigDecimal price) {
        return priced(repository.findRunningProductPromotion(productId, LocalDateTime.now()), price);
    }

    public BigDecimal salePrice(int productId, BigDecimal price) {
        return quote(productId, price).price();
    }

    // Tính giá cho nhiều sản phẩm: đọc các khuyến mãi đang chạy một lần, kết quả giống quote
    public BiFunction<Integer, BigDecimal, SalePrice> quoter() {
        List<Promotion> running = repository.withProductIds(repository.findRunningProductPromotions(LocalDateTime.now()));
        return (productId, price) -> priced(running.stream()
                .filter(p -> "ALL".equals(p.applyScope()) || p.productIds().contains(productId))
                .findFirst(), price);
    }

    private static SalePrice priced(Optional<Promotion> promotion, BigDecimal price) {
        return promotion
                .map(p -> new SalePrice(price, p.priceAfter(price), p.promotionId()))
                .orElseGet(() -> new SalePrice(price, price, null));
    }
}
