package com.thors.module.order.delivery;

import com.thors.security.SessionAccess;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orders")
public class DeliveryController {
    private final DeliveryService service;
    private final SessionAccess sessions;

    public DeliveryController(DeliveryService service, SessionAccess sessions) {
        this.service = service;
        this.sessions = sessions;
    }

    /** GET /api/orders/{id}/delivery-suggestion: khoảng cách từ cửa hàng và hình thức giao gợi ý */
    @GetMapping("/{id}/delivery-suggestion")
    Object suggestion(@PathVariable int id) {
        return service.suggest(sessions.current(), id);
    }
}