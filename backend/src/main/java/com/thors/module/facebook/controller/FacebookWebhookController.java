package com.thors.module.facebook.controller;

import com.thors.module.facebook.service.FacebookService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Collection;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/facebook/webhook")
public class FacebookWebhookController {

    private static final Logger log = LoggerFactory.getLogger(FacebookWebhookController.class);

    @Value("${thors.facebook.webhook.verify-token:thors_secret_webhook_token_2026}")
    private String verifyToken;

    private final FacebookService facebookService;

    public FacebookWebhookController(FacebookService facebookService) {
        this.facebookService = facebookService;
    }

    /**
     * Xác thực Webhook với Meta (GET request)
     */
    @GetMapping
    public ResponseEntity<String> verifyWebhook(
            @RequestParam(name = "hub.mode", required = false) String mode,
            @RequestParam(name = "hub.verify_token", required = false) String token,
            @RequestParam(name = "hub.challenge", required = false) String challenge) {

        log.info("Nhận yêu cầu xác thực Webhook Facebook: mode={}, token={}, challenge={}", mode, token, challenge);

        if ("subscribe".equals(mode) && verifyToken.equals(token)) {
            log.info("Xác thực Webhook Facebook thành công!");
            return ResponseEntity.ok(challenge);
        } else {
            log.warn("Xác thực Webhook thất bại! Expected token={}, Nhận được token={}", verifyToken, token);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Mã xác thực Verify Token không khớp");
        }
    }

    /**
     * Nhận sự kiện từ Facebook (POST request)
     */
    @PostMapping
    public ResponseEntity<String> handleWebhookEvent(@RequestBody Map<String, Object> payload) {
        log.info("==> [FACEBOOK WEBHOOK EVENT] Nhận sự kiện từ Meta: {}", payload);

        // Chuyển cho FacebookService xử lý bóc tách tin nhắn
        facebookService.processWebhookPayload(payload);

        return ResponseEntity.ok("EVENT_RECEIVED");
    }

    /**
     * Lấy danh sách tin nhắn nhận được (dành cho Frontend hiển thị)
     */
    @GetMapping("/messages")
    public ResponseEntity<List<Map<String, Object>>> getRecentMessages() {
        return ResponseEntity.ok(facebookService.getRecentMessages());
    }

    /**
     * Lấy danh sách cuộc hội thoại khách hàng
     */
    @GetMapping("/conversations")
    public ResponseEntity<Collection<Map<String, Object>>> getConversations() {
        return ResponseEntity.ok(facebookService.getConversations());
    }

    /**
     * Đồng bộ toàn bộ lịch sử tin nhắn và hội thoại từ Facebook Graph API
     */
    @PostMapping("/sync")
    public ResponseEntity<Map<String, Object>> syncConversations() {
        facebookService.syncConversationsFromFacebook();
        return ResponseEntity.ok(Map.of(
                "success", true,
                "conversationsCount", facebookService.getConversations().size(),
                "messagesCount", facebookService.getRecentMessages().size()
        ));
    }

    @GetMapping("/sync")
    public ResponseEntity<Map<String, Object>> syncConversationsGet() {
        return syncConversations();
    }

    /**
     * Gửi tin nhắn trả lời khách hàng từ hệ thống THORS
     */
    @PostMapping("/send")
    public ResponseEntity<Map<String, Object>> sendMessage(@RequestBody Map<String, String> request) {
        String recipientPsid = request.get("recipientPsid");
        String message = request.get("message");

        if (recipientPsid == null || message == null || message.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "recipientPsid và message không được để trống"));
        }

        Map<String, Object> result = facebookService.sendMessageToCustomerWithDetails(recipientPsid, message);
        return ResponseEntity.ok(result);
    }

    /**
     * Gửi hình ảnh (Mã QR VietQR / hình ảnh sản phẩm) tới khách hàng qua Messenger
     */
    @PostMapping("/send-image")
    public ResponseEntity<Map<String, Object>> sendImage(@RequestBody Map<String, String> request) {
        String recipientPsid = request.get("recipientPsid");
        String imageUrl = request.get("imageUrl");

        if (recipientPsid == null || imageUrl == null || imageUrl.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "recipientPsid và imageUrl không được để trống"));
        }

        boolean success = facebookService.sendImageToCustomer(recipientPsid, imageUrl);
        return ResponseEntity.ok(Map.of("success", success));
    }

    /**
     * Tạo đơn hàng Facebook lưu trực tiếp vào Quản lý Đơn hàng (orders)
     */
    @PostMapping("/order")
    public ResponseEntity<Map<String, Object>> createFacebookOrder(@RequestBody Map<String, Object> payload) {
        Map<String, Object> order = facebookService.createOrderFromFacebook(payload);
        return ResponseEntity.status(HttpStatus.CREATED).body(order);
    }
}
