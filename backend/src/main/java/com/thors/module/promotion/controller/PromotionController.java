
package com.thors.module.promotion.controller;

import com.thors.module.promotion.dto.CreatePromotionRequest;
import com.thors.module.promotion.dto.UpdatePromotionRequest;
import com.thors.module.promotion.entity.Promotion;
import com.thors.module.promotion.service.PromotionService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
    public ResponseEntity<Promotion> create(
            @RequestBody CreatePromotionRequest request
    ) {
        Promotion created = promotionService.create(request);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(created);
    }

    @PutMapping("/{promotionId}")
    public ResponseEntity<Void> update(
            @PathVariable int promotionId,
            @RequestBody UpdatePromotionRequest request
    ) {
        promotionService.update(promotionId, request);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{promotionId}/status")
    public ResponseEntity<Void> changeStatus(
            @PathVariable int promotionId,
            @RequestBody StatusRequest request
    ) {
        promotionService.changeStatus(promotionId, request.status());
        return ResponseEntity.noContent().build();
    }

    public record StatusRequest(String status) {
    }
}
