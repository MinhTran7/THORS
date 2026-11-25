package com.thors.module.order.controller;

import com.thors.module.order.service.DeliveryProofService;
import com.thors.module.order.service.OrderService;
import com.thors.security.SessionAccess;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/orders")
public class OrderController {
    private final OrderService service;
    private final DeliveryProofService deliveryProofs;
    private final SessionAccess sessions;

    public OrderController(OrderService service, DeliveryProofService deliveryProofs, SessionAccess sessions) {
        this.service = service;
        this.deliveryProofs = deliveryProofs;
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

    /**
     * POST /api/orders/{id}/status?status=SHIPPING&carrier=SELF|GHN&reason=&weightG=
     *     &ghnProvinceId=&ghnWardId=
     * (khi gửi GHN: cân nặng gram, bỏ trống = mặc định; Tỉnh / Phường-Xã theo danh mục mới của GHN)
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
            @RequestParam(required = false) Integer ghnProvinceId,
            @RequestParam(required = false) Integer ghnWardId,
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
        // Đã bắt buộc minh chứng thì "Đã giao" phải đi qua POST /{id}/delivered kèm ảnh
        deliveryProofs.guardStatusChange(status);
        return service.changeStatus(
                sessions.current(), id, status, reason, carrier, weightG, ghnProvinceId, ghnWardId, refund);
    }

    /** PUT /api/orders/{id}/refund-account: khách nhập / sửa tài khoản nhận tiền hoàn (đơn đang chờ hoàn tiền) */
    @PutMapping("/{id}/refund-account")
    Object saveRefundAccount(
            @PathVariable int id, @RequestBody com.thors.module.order.dto.OrderViews.BankAccount account) {
        return service.saveRefundAccount(sessions.current(), id, account);
    }

    /** GET /api/orders/delivery-proof/required: có bắt buộc ảnh khi xác nhận đã giao không (true/false) */
    @GetMapping("/delivery-proof/required")
    Object deliveryProofRequired() {
        sessions.current();
        return java.util.Map.of("required", deliveryProofs.required());
    }

    /** GET /api/orders/{id}/delivery-proof: { required, proof: { imageUrls, note, createdAt, createdByName } | null } */
    @GetMapping("/{id}/delivery-proof")
    Object deliveryProof(@PathVariable int id) {
        return deliveryProofs.view(sessions.current(), id);
    }

    /**
     * POST /api/orders/{id}/delivered (multipart): images = 1–3 ảnh JPG/PNG lúc giao, note = ghi chú tùy
     * chọn. Owner xác nhận đã giao kèm minh chứng.
     */
    @PostMapping(value = "/{id}/delivered", consumes = "multipart/form-data")
    Object confirmDelivered(
            @PathVariable int id,
            @RequestPart(value = "images", required = false) List<MultipartFile> images,
            @RequestParam(required = false) String note) {
        return deliveryProofs.confirmDelivered(sessions.current(), id, images, note);
    }
}