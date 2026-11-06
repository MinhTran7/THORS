package com.thors.module.order.delivery;

import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Nhận cập nhật trạng thái vận đơn từ GHN. Đăng ký URL trên trang quản lý GHN:
 * {@code https://<tên miền backend>/api/ghn/webhook/<GHN_WEBHOOK_SECRET>}.
 *
 * <p>GHN không ký webhook, nên đường dẫn chứa một chuỗi bí mật; sai chuỗi thì trả 404 như không tồn
 * tại. Chưa cấu hình chuỗi bí mật thì webhook tắt.
 */
@RestController
public class GhnWebhookController {
    private static final Logger log = LoggerFactory.getLogger(GhnWebhookController.class);

    private final GhnStatusService statuses;
    private final byte[] secret;

    public GhnWebhookController(
            GhnStatusService statuses, @Value("${thors.ghn.webhook-secret:}") String secret) {
        this.statuses = statuses;
        this.secret = (secret == null ? "" : secret.trim()).getBytes(StandardCharsets.UTF_8);
    }

    @PostMapping("/api/ghn/webhook/{key}")
    ResponseEntity<Object> receive(@PathVariable String key, @RequestBody(required = false) JsonNode body) {
        if (secret.length == 0 || !MessageDigest.isEqual(secret, key.getBytes(StandardCharsets.UTF_8)))
            return ResponseEntity.notFound().build();
        if (body == null) return ResponseEntity.badRequest().body(Map.of("message", "Thiếu dữ liệu"));

        String orderCode = body.path("OrderCode").asText("");
        String status = body.path("Status").asText("");
        String type = body.path("Type").asText("");
        if (orderCode.isBlank() || status.isBlank()) {
            // Các loại khác (cập nhật cân nặng, phí, COD...) chưa xử lý; vẫn trả 200 để GHN không gửi lại
            log.info("Webhook GHN bỏ qua: type={} order={}", type, orderCode);
            return ResponseEntity.ok(Map.of("code", 200, "result", "IGNORED"));
        }
        GhnStatusService.Result result =
                statuses.apply(orderCode, status, body.path("Time").asText(null), body.path("Reason").asText(null));
        return ResponseEntity.ok(Map.of("code", 200, "result", result.name()));
    }
}
