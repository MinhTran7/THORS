package com.thors.module.order.controller;

import com.thors.module.order.service.OrderService;
import com.thors.security.SessionAccess;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
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

    /**
     * GET /api/orders?status=&q=&dateFrom=yyyy-MM-dd&dateTo=yyyy-MM-dd&paymentMethod=COD|ONLINE&source=WEB|FACEBOOK&page=0&size=10
     */
    @GetMapping
    Object list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo,
            @RequestParam(required = false) String paymentMethod,
            @RequestParam(required = false) String source,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return service.list(
                sessions.current(), status, q, dateFrom, dateTo, paymentMethod, source, page, size);
    }

    /** GET /api/orders/counts: số đơn theo từng trạng thái (hiện trên các tab) */
    @GetMapping("/counts")
    Object counts() {
        return service.counts(sessions.current());
    }

    @GetMapping("/{id}")
    Object detail(@PathVariable int id) {
        return service.detail(sessions.current(), id);
    }

    /** POST /api/orders/test-sample (chỉ dùng khi test: tạo đơn online mẫu và phát thông báo) */
    @PostMapping("/test-sample")
    Object createSample() {
        return service.createSample(sessions.current());
    }

    /**
     * POST /api/orders/{id}/status?status=SHIPPING&carrier=SELF|GHN|GHTK|VIETTEL_POST|JT&reason=&weightG=
     *     &ghnDistrictId=&ghnWardCode=
     * (khi gửi GHN: cân nặng gram, bỏ trống = mặc định; Quận-Huyện / Phường-Xã theo GHN Owner chọn)
     */
    @PostMapping("/{id}/status")
    Object changeStatus(
            @PathVariable int id,
            @RequestParam String status,
            @RequestParam(required = false) String reason,
            @RequestParam(required = false) String carrier,
            @RequestParam(required = false) Integer weightG,
            @RequestParam(required = false) Integer ghnDistrictId,
            @RequestParam(required = false) String ghnWardCode) {
        return service.changeStatus(
                sessions.current(), id, status, reason, carrier, weightG, ghnDistrictId, ghnWardCode);
    }
}