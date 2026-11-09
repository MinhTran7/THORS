package com.thors.module.payment.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.thors.common.ApiException;
import com.thors.config.Settings;
import com.thors.module.account.entity.Account;
import com.thors.module.order.service.OrderService;
import com.thors.module.payment.config.PayOSProperties;
import com.thors.module.payment.dto.*;
import com.thors.module.payment.repository.PaymentRepository;
import com.thors.module.payment.util.PayOSSignatureUtils;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PayOSService {

    private static final Logger log = LoggerFactory.getLogger(PayOSService.class);
    private static final Set<String> STORE_ROLES = Set.of("OWNER", "FAMILY_MEMBER", "STAFF");

    private final PayOSProperties properties;
    private final Settings settings;
    private final PaymentRepository paymentRepository;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final OrderService orderService;

    public PayOSService(
            PayOSProperties properties,
            Settings settings,
            PaymentRepository paymentRepository,
            ObjectMapper objectMapper,
            OrderService orderService) {
        this.properties = properties;
        this.settings = settings;
        this.paymentRepository = paymentRepository;
        this.objectMapper = objectMapper;
        this.orderService = orderService;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    private void checkPayOSEnabled() {
        if (!properties.isEnabled()
                || properties.getClientId() == null || properties.getClientId().isBlank()
                || properties.getApiKey() == null || properties.getApiKey().isBlank()
                || properties.getChecksumKey() == null || properties.getChecksumKey().isBlank()) {
            throw new ApiException(400, "PAYOS_DISABLED", "Cổng thanh toán PayOS chưa được cấu hình hoặc chưa bật.");
        }
    }

    private void checkOrderAccess(Account actor, PaymentRepository.OrderPayable order) {
        if ("CUSTOMER".equals(actor.role()) && order.userId() != actor.id()) {
            throw new ApiException(403, "FORBIDDEN", "Bạn không có quyền truy cập đơn hàng này.");
        }
        if (!"CUSTOMER".equals(actor.role()) && !STORE_ROLES.contains(actor.role())) {
            throw new ApiException(403, "FORBIDDEN", "Vai trò này không được thực hiện thanh toán.");
        }
    }

    /**
     * Tạo link thanh toán / mã VietQR qua PayOS cho đơn hàng.
     */
    @Transactional
    public PaymentLinkResponse createPaymentLink(Account actor, CreatePaymentLinkRequest req) {
        checkPayOSEnabled();

        var order = paymentRepository.findOrderPayable(req.getOrderId())
                .orElseThrow(() -> new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."));

        checkOrderAccess(actor, order);

        if ("PAID".equalsIgnoreCase(order.paymentStatus())) {
            throw new ApiException(400, "ALREADY_PAID", "Đơn hàng đã được thanh toán thành công trước đó.");
        }

        if (List.of("CANCELLED", "REJECTED", "EXPIRED").contains(order.orderStatus())) {
            throw new ApiException(400, "INVALID_ORDER_STATUS", "Đơn hàng đã đóng hoặc bị hủy, không thể thanh toán.");
        }

        if (order.totalAmount() <= 0) {
            throw new ApiException(400, "INVALID_AMOUNT", "Số tiền thanh toán phải lớn hơn 0.");
        }

        // Tạo orderCode duy nhất (13 chữ số, nhỏ hơn 9007199254740991 của JS number)
        long orderCode = System.currentTimeMillis();

        // Chuẩn hóa nội dung chuyển khoản: Tối đa 25 ký tự, chỉ chứa chữ và số
        String cleanNumber = order.orderNumber().replaceAll("[^a-zA-Z0-9]", "");
        String description = "DH " + cleanNumber;
        if (description.length() > 25) {
            description = description.substring(0, 25);
        }

        String frontendUrl = settings.frontendUrl() != null && !settings.frontendUrl().isBlank()
                ? settings.frontendUrl()
                : "http://localhost:3000";

        String cancelUrl = req.getCancelUrl() != null && !req.getCancelUrl().isBlank()
                ? req.getCancelUrl()
                : frontendUrl + "/orders/" + order.orderId();

        String returnUrl = req.getReturnUrl() != null && !req.getReturnUrl().isBlank()
                ? req.getReturnUrl()
                : frontendUrl + "/orders/" + order.orderId() + "?payment=success";

        // Tính chữ ký PayOS
        String signature = PayOSSignatureUtils.createPaymentLinkSignature(
                order.totalAmount(), cancelUrl, description, orderCode, returnUrl, properties.getChecksumKey()
        );

        // Chuẩn bị items
        var rawItems = paymentRepository.findOrderItems(order.orderId());
        List<PayOSPaymentRequest.Item> items = new ArrayList<>();
        for (var it : rawItems) {
            items.add(new PayOSPaymentRequest.Item(
                    it.name() != null ? it.name() : "Sản phẩm",
                    Math.max(it.quantity(), 1),
                    Math.max(it.price(), 0)
            ));
        }

        PayOSPaymentRequest payosReq = new PayOSPaymentRequest();
        payosReq.setOrderCode(orderCode);
        payosReq.setAmount(order.totalAmount());
        payosReq.setDescription(description);
        payosReq.setBuyerName(order.deliveryName());
        payosReq.setBuyerPhone(order.deliveryPhone());
        payosReq.setBuyerAddress(order.deliveryAddress());
        payosReq.setItems(items);
        payosReq.setCancelUrl(cancelUrl);
        payosReq.setReturnUrl(returnUrl);
        payosReq.setSignature(signature);

        try {
            String jsonPayload = objectMapper.writeValueAsString(payosReq);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(properties.getEndpoint() + "/v2/payment-requests"))
                    .header("Content-Type", "application/json")
                    .header("x-client-id", properties.getClientId())
                    .header("x-api-key", properties.getApiKey())
                    .POST(HttpRequest.BodyPublishers.ofString(jsonPayload, StandardCharsets.UTF_8))
                    .timeout(Duration.ofSeconds(20))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            log.info("PayOS create-link response status: {}, body: {}", response.statusCode(), response.body());

            PayOSApiResponse apiResponse = objectMapper.readValue(response.body(), PayOSApiResponse.class);
            if (!apiResponse.isSuccess() || apiResponse.getData() == null) {
                String errMsg = apiResponse.getDesc() != null ? apiResponse.getDesc() : "Lỗi không xác định từ PayOS";
                throw new ApiException(400, "PAYOS_API_ERROR", "PayOS từ chối yêu cầu thanh toán: " + errMsg);
            }

            Map<String, Object> data = apiResponse.getData();
            String checkoutUrl = (String) data.get("checkoutUrl");
            String qrCode = (String) data.get("qrCode");
            String accountNumber = (String) data.get("accountNumber");
            String accountName = (String) data.get("accountName");
            String bin = (String) data.get("bin");
            String status = (String) data.getOrDefault("status", "PENDING");

            // Lưu lịch sử lần thử thanh toán vào bảng payment
            paymentRepository.insertPaymentAttempt(order.orderId(), String.valueOf(orderCode), order.totalAmount(), "PAYOS");

            return new PaymentLinkResponse(
                    order.orderId(),
                    order.orderNumber(),
                    orderCode,
                    order.totalAmount(),
                    checkoutUrl,
                    qrCode,
                    accountNumber,
                    accountName,
                    bin,
                    status
            );

        } catch (ApiException ae) {
            throw ae;
        } catch (Exception e) {
            log.error("Lỗi khi kết nối PayOS API: {}", e.getMessage(), e);
            throw new ApiException(500, "PAYOS_CONNECT_ERROR", "Không thể kết nối cổng PayOS: " + e.getMessage());
        }
    }

    /**
     * Xử lý webhook từ PayOS (được gọi tự động khi khách thanh toán thành công).
     */
    @Transactional
    public Map<String, Object> handleWebhook(PayOSWebhookPayload payload) {
        checkPayOSEnabled();

        if (payload == null || payload.getData() == null) {
            throw new ApiException(400, "BAD_PAYLOAD", "Payload webhook rỗng.");
        }

        // Xác thực chữ ký webhook từ PayOS
        boolean valid = PayOSSignatureUtils.verifyWebhookSignature(
                payload.getData(), properties.getChecksumKey(), payload.getSignature()
        );

        if (!valid) {
            log.warn("PayOS webhook chữ ký không hợp lệ! signature={}", payload.getSignature());
            throw new ApiException(400, "INVALID_SIGNATURE", "Chữ ký webhook PayOS không hợp lệ.");
        }

        Map<String, Object> data = payload.getData();
        Object orderCodeObj = data.get("orderCode");
        String code = (String) data.getOrDefault("code", payload.getCode());

        if (orderCodeObj != null && "00".equals(code)) {
            String transactionRef = String.valueOf(orderCodeObj);
            var paymentOpt = paymentRepository.findByTransactionRef(transactionRef);

            if (paymentOpt.isPresent()) {
                var payment = paymentOpt.get();
                paymentRepository.markPaymentSuccess(payment.transactionRef());
                // Cập nhật đơn và gửi thông báo (chỉ báo một lần dù webhook gọi lại)
                orderService.onOnlinePaymentPaid(payment.orderId());
                log.info("PayOS Webhook: Đã cập nhật thành công đơn hàng orderId={}, code={}", payment.orderId(), transactionRef);
            } else {
                log.warn("PayOS Webhook: Không tìm thấy giao dịch với transactionRef={}", transactionRef);
            }
        }

        return Map.of("error", 0, "message", "Webhook processed successfully");
    }

    /**
     * Kiểm tra trạng thái thanh toán đơn hàng (hỗ trợ kiểm tra trực tiếp qua PayOS nếu webhook bị trễ).
     */
    @Transactional
    public Map<String, Object> checkPaymentStatus(Account actor, int orderId) {
        var order = paymentRepository.findOrderPayable(orderId)
                .orElseThrow(() -> new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."));

        checkOrderAccess(actor, order);

        if ("PAID".equalsIgnoreCase(order.paymentStatus())) {
            return Map.of("paid", true, "orderId", orderId, "paymentStatus", "PAID");
        }

        var latestPayment = paymentRepository.findLatestByOrderId(orderId);
        if (latestPayment.isEmpty() || latestPayment.get().transactionRef() == null) {
            return Map.of("paid", false, "orderId", orderId, "paymentStatus", order.paymentStatus());
        }

        var p = latestPayment.get();
        if ("SUCCESS".equalsIgnoreCase(p.paymentStatus())) {
            orderService.onOnlinePaymentPaid(orderId);
            return Map.of("paid", true, "orderId", orderId, "paymentStatus", "PAID");
        }

        // Nếu PayOS đang bật, gọi trực tiếp PayOS API để đồng bộ trạng thái
        if (properties.isEnabled() && properties.getApiKey() != null && !properties.getApiKey().isBlank()) {
            try {
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(properties.getEndpoint() + "/v2/payment-requests/" + p.transactionRef()))
                        .header("x-client-id", properties.getClientId())
                        .header("x-api-key", properties.getApiKey())
                        .GET()
                        .timeout(Duration.ofSeconds(10))
                        .build();

                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                if (response.statusCode() == 200) {
                    PayOSApiResponse apiResponse = objectMapper.readValue(response.body(), PayOSApiResponse.class);
                    if (apiResponse.isSuccess() && apiResponse.getData() != null) {
                        String status = (String) apiResponse.getData().get("status");
                        if ("PAID".equalsIgnoreCase(status)) {
                            paymentRepository.markPaymentSuccess(p.transactionRef());
                            orderService.onOnlinePaymentPaid(orderId);
                            log.info("PayOS CheckStatus: Đã đồng bộ thành công trạng thái PAID cho orderId={}", orderId);
                            return Map.of("paid", true, "orderId", orderId, "paymentStatus", "PAID");
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Không thể kiểm tra trạng thái từ PayOS: {}", e.getMessage());
            }
        }

        return Map.of("paid", false, "orderId", orderId, "paymentStatus", order.paymentStatus());
    }
}

