package com.thors.module.returns.controller;

import com.thors.module.returns.dto.CreateReturnRequest;
import com.thors.module.returns.dto.ProcessReturnRequest;
import com.thors.module.returns.dto.ReturnRequestResponse;
import com.thors.module.returns.dto.ReturnableOrderResponse;
import com.thors.module.returns.service.ReturnService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/returns")
public class ReturnController {

    private final ReturnService returnService;

    public ReturnController(ReturnService returnService) {
        this.returnService = returnService;
    }

    // ==========================================
    // LOOKUP ORDER
    // ==========================================

    @GetMapping("/orders/{orderNumber}")
    public ResponseEntity<ReturnableOrderResponse> getOrderByNumber(@PathVariable String orderNumber) {
        return ResponseEntity.ok(returnService.getOrderByNumber(orderNumber));
    }

    // ==========================================
    // RETURN REQUEST LIST & DETAIL
    // ==========================================

    @GetMapping
    public ResponseEntity<Map<String, Object>> getReturnRequests(
            @RequestParam(required = false, defaultValue = "ALL") String status,
            @RequestParam(required = false, defaultValue = "") String search,
            @RequestParam(required = false, defaultValue = "1") int page,
            @RequestParam(required = false, defaultValue = "10") int pageSize
    ) {
        return ResponseEntity.ok(returnService.getReturnRequests(status, search, page, pageSize));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ReturnRequestResponse> getReturnRequestById(@PathVariable int id) {
        return ResponseEntity.ok(returnService.getReturnRequestById(id));
    }

    // ==========================================
    // CREATE RETURN REQUEST
    // ==========================================

    @PostMapping
    public ResponseEntity<ReturnRequestResponse> createReturnRequest(@RequestBody CreateReturnRequest request) {
        ReturnRequestResponse response = returnService.createReturnRequest(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // ==========================================
    // PROCESS RETURN REQUEST (WORKFLOW)
    // ==========================================

    @PostMapping("/{id}/process")
    public ResponseEntity<ReturnRequestResponse> processReturnRequest(
            @PathVariable int id,
            @RequestBody ProcessReturnRequest request
    ) {
        ReturnRequestResponse response = returnService.processReturnRequest(id, request);
        return ResponseEntity.ok(response);
    }

    // ==========================================
    // SEED SAMPLE ORDER (DEV / TESTING HELPER)
    // ==========================================

    @PostMapping("/seed-sample-order")
    public ResponseEntity<Map<String, Object>> seedSampleOrder() {
        return ResponseEntity.ok(returnService.seedSampleOrder());
    }
}

