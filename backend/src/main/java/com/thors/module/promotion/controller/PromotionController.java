package com.thors.module.promotion.controller;

import com.thors.module.promotion.dto.PromotionAdjustRequest;
import com.thors.module.promotion.dto.PromotionOrder;
import com.thors.module.promotion.dto.PromotionRequest;
import com.thors.module.promotion.dto.PromotionView;
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
    public List<PromotionView> getAll() {
        return promotionService.getAll();
    }

    @GetMapping("/{promotionId}")
    public PromotionView getById(@PathVariable int promotionId) {
        return promotionService.getById(promotionId);
    }

    @GetMapping("/{promotionId}/orders")
    public List<PromotionOrder> getOrders(@PathVariable int promotionId) {
        return promotionService.getOrders(promotionId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PromotionView create(@RequestBody PromotionRequest request) {
        return promotionService.create(request);
    }

    @PutMapping("/{promotionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void update(@PathVariable int promotionId, @RequestBody PromotionRequest request) {
        promotionService.update(promotionId, request);
    }

    @PatchMapping("/{promotionId}/adjust")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void adjust(@PathVariable int promotionId, @RequestBody PromotionAdjustRequest request) {
        promotionService.adjust(promotionId, request);
    }

    @PatchMapping("/{promotionId}/status")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changeStatus(@PathVariable int promotionId, @RequestBody StatusRequest request) {
        promotionService.changeStatus(promotionId, request.status());
    }

    @PostMapping("/{promotionId}/end")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void endEarly(@PathVariable int promotionId) {
        promotionService.endEarly(promotionId);
    }

    @DeleteMapping("/{promotionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable int promotionId) {
        promotionService.delete(promotionId);
    }

    public record StatusRequest(String status) {
    }
}
