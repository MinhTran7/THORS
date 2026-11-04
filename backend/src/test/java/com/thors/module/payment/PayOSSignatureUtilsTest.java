package com.thors.module.payment;

import static org.junit.jupiter.api.Assertions.*;

import com.thors.module.payment.util.PayOSSignatureUtils;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class PayOSSignatureUtilsTest {

    private final String checksumKey = "ad6ef479d6609c2abb01733a5b4a148b0a739f3b094984d606ca57c3e618041a";

    @Test
    void testComputeHmacSha256() {
        String data = "amount=2000&cancelUrl=http://localhost:3000/cancel&description=DH123&orderCode=123456&returnUrl=http://localhost:3000/return";
        String sig = PayOSSignatureUtils.computeHmacSha256(data, checksumKey);
        assertNotNull(sig);
        assertEquals(64, sig.length());
    }

    @Test
    void testCreatePaymentLinkSignature() {
        String sig = PayOSSignatureUtils.createPaymentLinkSignature(
                250000,
                "http://localhost:3000/orders/1",
                "DH ORD20261102",
                1793600000L,
                "http://localhost:3000/orders/1?payment=success",
                checksumKey
        );
        assertNotNull(sig);
        assertEquals(64, sig.length());
    }

    @Test
    void testVerifyWebhookSignature() {
        Map<String, Object> data = new HashMap<>();
        data.put("orderCode", 1793600000L);
        data.put("amount", 250000);
        data.put("description", "DH ORD20261102");
        data.put("accountNumber", "123456789");
        data.put("code", "00");

        String sig = PayOSSignatureUtils.createDataSignature(data, checksumKey);
        assertNotNull(sig);

        // Verification should succeed with correct signature
        assertTrue(PayOSSignatureUtils.verifyWebhookSignature(data, checksumKey, sig));

        // Verification should fail with modified signature
        assertFalse(PayOSSignatureUtils.verifyWebhookSignature(data, checksumKey, sig + "fail"));

        // Verification should fail if data is modified
        data.put("amount", 999999);
        assertFalse(PayOSSignatureUtils.verifyWebhookSignature(data, checksumKey, sig));
    }
}

