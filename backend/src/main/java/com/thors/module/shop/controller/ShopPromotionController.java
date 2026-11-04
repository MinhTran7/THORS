package com.thors.module.shop.controller;

import com.thors.module.shop.repository.ShopPromotionRepository;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** GET /api/shop/promotions: sản phẩm đang khuyến mãi (công khai, chỉ đọc). */
@RestController
@RequestMapping("/api/shop")
public class ShopPromotionController {

    private final ShopPromotionRepository repository;

    public ShopPromotionController(ShopPromotionRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/promotions")
    public ResponseEntity<Map<String, Object>> promotions(@RequestParam(defaultValue = "5") int size) {
        int safeSize = Math.min(Math.max(size, 1), 20);
        return ResponseEntity.ok(Map.of("items", repository.findPromotedProducts(safeSize)));
    }
}