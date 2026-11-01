package com.thors.module.shop.controller;

import com.thors.module.shop.repository.ShopRepository;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** API công khai (khách chưa đăng nhập vẫn xem và tìm kiếm được). Chỉ đọc, không có thao tác ghi. */
@RestController
@RequestMapping("/api/shop")
public class ShopController {

    private final ShopRepository shopRepository;

    public ShopController(ShopRepository shopRepository) {
        this.shopRepository = shopRepository;
    }

    @GetMapping("/categories")
    public ResponseEntity<Map<String, Object>> categories() {
        return ResponseEntity.ok(Map.of("items", shopRepository.findCategories()));
    }

    @GetMapping("/products")
    public ResponseEntity<Map<String, Object>> products(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Integer categoryId,
            @RequestParam(defaultValue = "newest") String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), 40);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", shopRepository.findProducts(q, categoryId, sort, safePage, safeSize));
        result.put("total", shopRepository.countProducts(q, categoryId));
        result.put("page", safePage);
        result.put("size", safeSize);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/products/{productId}")
    public ResponseEntity<Map<String, Object>> product(@PathVariable int productId) {
        Map<String, Object> product = shopRepository.findProduct(productId);
        if (product == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy sản phẩm.");
        }
        List<String> images = shopRepository.findImageUrls(productId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("product", product);
        result.put("images", images);
        result.put("variants", shopRepository.findVariants(productId));
        return ResponseEntity.ok(result);
    }
}