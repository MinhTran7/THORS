package com.thors.module.sizeadvice;

import com.thors.security.SessionAccess;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

/** Gợi ý size: theo số đo (trang Hồ sơ), theo sản phẩm (trang sản phẩm) và đánh giá Chật/Vừa/Rộng (trang đơn). */
@RestController
@RequestMapping("/api/size-advice")
public class SizeAdviceController {
    private final SizeAdviceService service;
    private final SessionAccess sessions;
    private final SizeAdviceSchema schema;

    public SizeAdviceController(SizeAdviceService service, SessionAccess sessions, SizeAdviceSchema schema) {
        this.service = service;
        this.sessions = sessions;
        this.schema = schema;
    }

    /** GET /api/size-advice/status → { ready }: false khi database chưa chạy migration gợi ý size. */
    @GetMapping("/status")
    Object status() {
        return Map.of("ready", schema.ready());
    }

    /** GET /api/size-advice/general?heightCm=&weightKg=&footLengthCm=&fitPreference= → { top, bottom, shoe, note } */
    @GetMapping("/general")
    Object general(
            @RequestParam(required = false) Integer heightCm,
            @RequestParam(required = false) Integer weightKg,
            @RequestParam(required = false) Double footLengthCm,
            @RequestParam(required = false) String fitPreference) {
        sessions.current();
        return service.general(heightCm, weightKg, footLengthCm, fitPreference);
    }

    /**
     * GET /api/size-advice/products/{productId} → size gợi ý cho khách đang đăng nhập. sizeType = NONE với
     * túi, phụ kiện; missing = BODY/FOOT khi hồ sơ thiếu số đo và chưa có lịch sử mua.
     */
    @GetMapping("/products/{productId}")
    Object product(@PathVariable int productId) {
        schema.require();
        return service.productAdvice(sessions.current(), productId);
    }

    /** GET /api/size-advice/orders/{orderId}/feedback → [{ orderItemId, rateable, fit }] */
    @GetMapping("/orders/{orderId}/feedback")
    Object orderFeedback(@PathVariable int orderId) {
        schema.require();
        return service.orderFeedback(sessions.current(), orderId);
    }

    /** fit được kiểm tra trong SizeAdviceService.saveFeedback. */
    public record FeedbackRequest(String fit) {}

    /** PUT /api/size-advice/order-items/{orderItemId}/feedback { fit: TIGHT|TRUE|LOOSE|null } */
    @PutMapping("/order-items/{orderItemId}/feedback")
    Object saveFeedback(@PathVariable int orderItemId, @RequestBody FeedbackRequest r) {
        schema.require();
        return service.saveFeedback(sessions.current(), orderItemId, r.fit());
    }
}
