package com.thors.module.promotion.service;

import com.thors.module.promotion.entity.Promotion;
import com.thors.module.promotion.repository.PromotionRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.function.BiFunction;

// Nơi duy nhất tính giá sau khuyến mãi sản phẩm (bán tại quầy, checkout)
@Service
public class PricingService {

    private final PromotionRepository repository;

    public PricingService(PromotionRepository repository) {
        this.repository = repository;
    }

    // Giá sau khuyến mãi của một sản phẩm
    public BigDecimal salePrice(int productId, BigDecimal price) {
        return repository.findRunningProductPromotion(productId, LocalDateTime.now())
                .map(promotion -> promotion.priceAfter(price))
                .orElse(price);
    }

    // Tính giá cho nhiều sản phẩm: đọc các khuyến mãi đang chạy một lần, kết quả giống salePrice
    public BiFunction<Integer, BigDecimal, BigDecimal> pricer() {
        List<Promotion> running = repository.withProductIds(repository.findRunningProductPromotions(LocalDateTime.now()));
        return (productId, price) -> running.stream()
                .filter(p -> "ALL".equals(p.applyScope()) || p.productIds().contains(productId))
                .findFirst()
                .map(p -> p.priceAfter(price))
                .orElse(price);
    }
}
