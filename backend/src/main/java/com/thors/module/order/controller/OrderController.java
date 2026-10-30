package com.thors.module.order.controller;

import com.thors.module.order.service.OrderService;
import com.thors.security.SessionAccess;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/orders")
public class OrderController {
    private final OrderService service;
    private final SessionAccess sessions;

    public OrderController(OrderService service, SessionAccess sessions) {
        this.service = service;
        this.sessions = sessions;
    }

    /** GET /api/orders?status=&q=&page=0&size=10 */
    @GetMapping
    Object list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return service.list(sessions.current(), status, q, page, size);
    }

    @GetMapping("/{id}")
    Object detail(@PathVariable int id) {
        return service.detail(sessions.current(), id);
    }
}