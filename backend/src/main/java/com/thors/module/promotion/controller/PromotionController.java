package com.thors.module.promotion.controller;

import com.thors.module.promotion.dto.PromotionAdjustRequest;
import com.thors.module.promotion.dto.PromotionOrderDetail;
import com.thors.module.promotion.dto.PromotionOrdersReport;
import com.thors.module.promotion.dto.PromotionRequest;
import com.thors.module.promotion.dto.PromotionSalesReport;
import com.thors.module.promotion.dto.PromotionStatusRequest;
import com.thors.module.promotion.dto.PromotionView;
import com.thors.module.promotion.service.PromotionReportService;
import com.thors.module.promotion.service.PromotionService;
import com.thors.security.SessionAccess;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/promotions")
public class PromotionController {

    private final PromotionService service;
    private final PromotionReportService reports;
    private final SessionAccess sessions;

    public PromotionController(PromotionService service, PromotionReportService reports, SessionAccess sessions) {
        this.service = service;
        this.reports = reports;
        this.sessions = sessions;
    }

    @GetMapping
    public List<PromotionView> list() {
        return service.list(sessions.current());
    }

    @GetMapping("/{promotionId}")
    public PromotionView detail(@PathVariable int promotionId) {
        return service.detail(promotionId);
    }

    @GetMapping("/{promotionId}/orders")
    public PromotionOrdersReport orders(@PathVariable int promotionId) {
        return reports.getOrders(promotionId);
    }

    @GetMapping("/{promotionId}/orders/{orderId}")
    public PromotionOrderDetail orderDetail(@PathVariable int promotionId, @PathVariable int orderId) {
        return reports.getOrderDetail(promotionId, orderId);
    }

    @GetMapping("/{promotionId}/sales")
    public PromotionSalesReport sales(@PathVariable int promotionId, @RequestParam(required = false) String channel) {
        return reports.getSales(promotionId, channel);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public void create(@RequestBody PromotionRequest request) {
        service.create(sessions.current(), request);
    }

    @PutMapping("/{promotionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void update(@PathVariable int promotionId, @RequestBody PromotionRequest request) {
        service.update(promotionId, request);
    }

    @PatchMapping("/{promotionId}/adjust")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void adjust(@PathVariable int promotionId, @RequestBody PromotionAdjustRequest request) {
        service.adjust(promotionId, request);
    }

    @PatchMapping("/{promotionId}/status")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changeStatus(@PathVariable int promotionId, @RequestBody PromotionStatusRequest request) {
        service.changeStatus(promotionId, request.status());
    }

    @PostMapping("/{promotionId}/end")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void endEarly(@PathVariable int promotionId) {
        service.endEarly(promotionId);
    }

    @DeleteMapping("/{promotionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable int promotionId) {
        service.delete(promotionId);
    }
}
