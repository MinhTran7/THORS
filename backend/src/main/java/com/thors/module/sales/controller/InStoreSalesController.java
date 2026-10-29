package com.thors.module.sales.controller;

import com.thors.module.sales.dto.CreateInStoreSaleRequest;
import com.thors.module.sales.dto.InStoreSaleResponse;
import com.thors.module.sales.service.InStoreSalesService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
}