package com.thors.module.promotion.controller;

import com.thors.module.promotion.dto.PromotionRequest;
import com.thors.module.promotion.entity.Promotion;
import com.thors.module.promotion.service.PromotionService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/promotions")
public class PromotionController {

    private final PromotionService promotionService;

    public PromotionController(PromotionService promotionService) {
        this.promotionService = promotionService;
    }

    @GetMapping
    public List<Promotion> getAll() {
        return promotionService.getAll();
    }

    @GetMapping("/{promotionId}")
    public Promotion getById(@PathVariable int promotionId) {
        return promotionService.getById(promotionId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Promotion create(@RequestBody PromotionRequest request) {
        return promotionService.create(request);
    }

    @PutMapping("/{promotionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void update(@PathVariable int promotionId, @RequestBody PromotionRequest request) {
        promotionService.update(promotionId, request);
    }

    @PatchMapping("/{promotionId}/status")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changeStatus(@PathVariable int promotionId, @RequestBody StatusRequest request) {
        promotionService.changeStatus(promotionId, request.status());
    }

    public record StatusRequest(String status) {
    }
}
