package com.thors.module.payment.controller;

import com.thors.module.payment.dto.CreatePaymentLinkRequest;
import com.thors.module.payment.dto.PayOSWebhookPayload;
import com.thors.module.payment.dto.PaymentLinkResponse;
import com.thors.module.payment.service.PayOSService;
import com.thors.security.SessionAccess;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/payment/payos")
public class PaymentController {

    private final PayOSService payOSService;
    private final SessionAccess sessions;

    public PaymentController(PayOSService payOSService, SessionAccess sessions) {
        this.payOSService = payOSService;
        this.sessions = sessions;
    }

    /**
     * POST /api/payment/payos/create-link
     * Tạo link thanh toán VietQR / PayOS cho đơn hàng trực tuyến.
     */
    @PostMapping("/create-link")
    public PaymentLinkResponse createPaymentLink(@Valid @RequestBody CreatePaymentLinkRequest req) {
        return payOSService.createPaymentLink(sessions.current(), req);
    }

    /**
     * GET /api/payment/payos/status/{orderId}
     * Kiểm tra trạng thái thanh toán đơn hàng (đồng bộ với PayOS nếu cần).
     */
    @GetMapping("/status/{orderId}")
    public Map<String, Object> checkStatus(@PathVariable int orderId) {
        return payOSService.checkPaymentStatus(sessions.current(), orderId);
    }

    /**
     * POST /api/payment/payos/webhook
     * Webhook công khai từ hệ thống PayOS để nhận thông báo thanh toán thành công tự động.
     */
    @PostMapping("/webhook")
    public ResponseEntity<Map<String, Object>> webhook(@RequestBody PayOSWebhookPayload payload) {
        Map<String, Object> result = payOSService.handleWebhook(payload);
        return ResponseEntity.ok(result);
    }
}

