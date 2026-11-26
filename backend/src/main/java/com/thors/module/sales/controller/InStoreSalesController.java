package com.thors.module.sales.controller;

import com.thors.module.sales.dto.CreateInStoreSaleRequest;
import com.thors.module.sales.dto.InStoreSaleDetailResponse;
import com.thors.module.sales.dto.InStoreSalePageResponse;
import com.thors.module.sales.dto.PriceRange;
import com.thors.module.sales.dto.SellerOption;
import com.thors.module.sales.dto.VariantSale;
import com.thors.module.sales.service.InStoreSalesService;
import com.thors.security.SessionAccess;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/sales/in-store")
public class InStoreSalesController {

    private final InStoreSalesService service;
    private final SessionAccess sessions;

    public InStoreSalesController(InStoreSalesService service, SessionAccess sessions) {
        this.service = service;
        this.sessions = sessions;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public InStoreSaleDetailResponse create(@RequestBody CreateInStoreSaleRequest request) {
        return service.createSale(sessions.current(), request);
    }

    @PostMapping("/{orderId}/cancel")
    public InStoreSaleDetailResponse cancel(@PathVariable int orderId) {
        return service.cancel(sessions.current(), orderId);
    }

    @GetMapping
    public InStoreSalePageResponse list(@RequestParam(required = false) String q,
                                        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
                                        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
                                        @RequestParam(required = false) Integer sellerId,
                                        @RequestParam(required = false) String paymentMethod,
                                        @RequestParam(defaultValue = "0") int page,
                                        @RequestParam(defaultValue = "10") int size) {
        return service.listSales(q, fromDate, toDate, sellerId, paymentMethod, page, size);
    }

    @GetMapping("/{orderId}")
    public InStoreSaleDetailResponse detail(@PathVariable int orderId) {
        return service.getSaleDetail(orderId);
    }

    @GetMapping("/sellers")
    public List<SellerOption> sellers() {
        return service.listSellers();
    }

    @GetMapping("/prices")
    public Map<Integer, PriceRange> priceRanges() {
        return service.salePriceRanges();
    }

    @GetMapping("/prices/{productId}")
    public Map<Integer, VariantSale> variantSales(@PathVariable int productId) {
        return service.variantSales(productId);
    }
}
