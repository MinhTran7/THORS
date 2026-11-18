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
     * GET /api/orders?status=&q=&dateFrom=yyyy-MM-dd&dateTo=yyyy-MM-dd&paymentMethod=COD|ONLINE&page=0&size=10
     */
    @GetMapping
    Object list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo,
            @RequestParam(required = false) String paymentMethod,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return service.list(
                sessions.current(), status, q, dateFrom, dateTo, paymentMethod, page, size);
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
    /** POST /api/orders/{id}/refunded: Owner xác nhận đã hoàn tiền cho đơn đang "Chờ hoàn tiền" */
    @PostMapping("/{id}/refunded")
    Object markRefunded(@PathVariable int id) {
        return service.markRefunded(sessions.current(), id);
    }

    @PostMapping("/{id}/status")
    Object changeStatus(
            @PathVariable int id,
            @RequestParam String status,
            @RequestParam(required = false) String reason,
            @RequestParam(required = false) String carrier,
            @RequestParam(required = false) Integer weightG,
            @RequestParam(required = false) Integer ghnDistrictId,
            @RequestParam(required = false) String ghnWardCode,
            // Khách hủy đơn đã thanh toán online: tài khoản nhận tiền hoàn
            @RequestParam(required = false) String refundBankBin,
            @RequestParam(required = false) String refundBankName,
            @RequestParam(required = false) String refundAccountNumber,
            @RequestParam(required = false) String refundAccountName) {
        var refund =
                refundAccountNumber == null
                        ? null
                        : new com.thors.module.order.dto.OrderViews.BankAccount(
                                refundBankBin, refundBankName, refundAccountNumber, refundAccountName);
        return service.changeStatus(
                sessions.current(), id, status, reason, carrier, weightG, ghnDistrictId, ghnWardCode, refund);
    }

    /** PUT /api/orders/{id}/refund-account: khách nhập / sửa tài khoản nhận tiền hoàn (đơn đang chờ hoàn tiền) */
    @PutMapping("/{id}/refund-account")
    Object saveRefundAccount(
            @PathVariable int id, @RequestBody com.thors.module.order.dto.OrderViews.BankAccount account) {
        return service.saveRefundAccount(sessions.current(), id, account);
    }
}