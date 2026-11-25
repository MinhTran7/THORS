package com.thors.module.shop.controller;

import com.thors.module.promotion.dto.VoucherView;
import com.thors.module.promotion.service.PromotionService;
import com.thors.module.shop.repository.ShopPromotionRepository;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/shop")
public class ShopPromotionController {

    private final ShopPromotionRepository repository;
    private final PromotionService promotionService;

    public ShopPromotionController(ShopPromotionRepository repository, PromotionService promotionService) {
        this.repository = repository;
        this.promotionService = promotionService;
    }

    @GetMapping("/promotions")
    public ResponseEntity<Map<String, Object>> promotions() {
        return ResponseEntity.ok(Map.of("items", repository.findPromotedProducts()));
    }

    @GetMapping("/vouchers")
    public List<VoucherView> vouchers() {
        return promotionService.getVouchers();
    }
}
