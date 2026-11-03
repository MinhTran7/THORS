package com.thors.module.sales.controller;

import com.thors.module.sales.dto.CreateInStoreSaleRequest;
import com.thors.module.sales.dto.InStoreSaleDetailResponse;
import com.thors.module.sales.dto.InStoreSalePageResponse;
import com.thors.module.sales.dto.InStoreSaleResponse;
import com.thors.module.sales.dto.SellerOption;
import com.thors.module.sales.service.InStoreSalesService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/sales/in-store")
public class InStoreSalesController {

    private final InStoreSalesService salesService;

    public InStoreSalesController(InStoreSalesService salesService) {
        this.salesService = salesService;
    }

    @PostMapping
    public ResponseEntity<InStoreSaleResponse> createSale(
            @RequestBody CreateInStoreSaleRequest request
    ) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(salesService.createSale(request));
    }

    @GetMapping
    public ResponseEntity<InStoreSalePageResponse> listSales(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
            @RequestParam(required = false) Integer sellerId,
            @RequestParam(required = false) String paymentMethod,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        return ResponseEntity.ok(salesService.listSales(q, fromDate, toDate, sellerId, paymentMethod, page, size));
    }

    @GetMapping("/sellers")
    public ResponseEntity<List<SellerOption>> listSellers() {
        return ResponseEntity.ok(salesService.listSellers());
    }

    @GetMapping("/{orderId}")
    public ResponseEntity<InStoreSaleDetailResponse> getSaleDetail(@PathVariable int orderId) {
        return ResponseEntity.ok(salesService.getSaleDetail(orderId));
    }
}
