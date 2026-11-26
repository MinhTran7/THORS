package com.thors.module.shop.controller;

import com.thors.module.promotion.dto.VoucherView;
import com.thors.module.promotion.service.PromotionService;
import com.thors.module.shop.repository.ShopPromotionRepository;
import com.thors.security.SessionUser;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
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
    public List<VoucherView> vouchers(@AuthenticationPrincipal SessionUser user) {
        return promotionService.getVouchers(user != null && "CUSTOMER".equals(user.role()) ? user.userId() : null);
    }
}
