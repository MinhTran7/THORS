package com.thors.module.payment.util;

import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class PayOSSignatureUtils {

    private static final String HMAC_SHA256 = "HmacSHA256";

    private PayOSSignatureUtils() {}

    /**
     * Tính toán chữ ký HMAC-SHA256 từ dữ liệu dạng chuỗi và khóa bí mật.
     */
    public static String computeHmacSha256(String data, String checksumKey) {
        if (data == null || checksumKey == null) {
            throw new IllegalArgumentException("Dữ liệu và checksumKey không được null");
        }
        try {
            Mac mac = Mac.getInstance(HMAC_SHA256);
            SecretKeySpec secretKey = new SecretKeySpec(checksumKey.getBytes(StandardCharsets.UTF_8), HMAC_SHA256);
            mac.init(secretKey);
            byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new RuntimeException("Lỗi tính HMAC-SHA256: " + e.getMessage(), e);
        }
    }

    /**
     * Tạo chữ ký chuẩn khi tạo link thanh toán PayOS.
     * Quy tắc: Sắp xếp theo alphabet: amount={amount}&cancelUrl={cancelUrl}&description={description}&orderCode={orderCode}&returnUrl={returnUrl}
     */
    public static String createPaymentLinkSignature(
            long amount, String cancelUrl, String description, long orderCode, String returnUrl, String checksumKey) {
        String data = "amount=" + amount
                + "&cancelUrl=" + (cancelUrl != null ? cancelUrl : "")
                + "&description=" + (description != null ? description : "")
                + "&orderCode=" + orderCode
                + "&returnUrl=" + (returnUrl != null ? returnUrl : "");
        return computeHmacSha256(data, checksumKey);
    }

    /**
     * Tạo chữ ký từ Map dữ liệu (dùng để xác thực webhook trả về từ PayOS).
     * Các key được sắp xếp theo thứ tự từ điển A-Z, loại bỏ giá trị null hoặc rỗng hoặc object lồng.
     */
    public static String createDataSignature(Map<String, Object> data, String checksumKey) {
        if (data == null || data.isEmpty()) {
            return "";
        }
        Map<String, Object> sortedMap = new TreeMap<>(data);
        String dataStr = sortedMap.entrySet().stream()
                .filter(e -> e.getValue() != null && !(e.getValue() instanceof Map) && !(e.getValue() instanceof Iterable))
                .map(e -> e.getKey() + "=" + e.getValue().toString())
                .collect(Collectors.joining("&"));
        return computeHmacSha256(dataStr, checksumKey);
    }

    /**
     * Kiểm tra chữ ký webhook PayOS.
     */
    public static boolean verifyWebhookSignature(Map<String, Object> data, String checksumKey, String signature) {
        if (signature == null || signature.isBlank() || data == null) {
            return false;
        }
        String calculated = createDataSignature(data, checksumKey);
        return calculated.equalsIgnoreCase(signature);
    }
}

