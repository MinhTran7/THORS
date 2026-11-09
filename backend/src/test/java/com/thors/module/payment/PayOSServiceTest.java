package com.thors.module.payment;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.thors.common.ApiException;
import com.thors.config.Settings;
import com.thors.module.account.entity.Account;
import com.thors.module.order.service.OrderService;
import com.thors.module.payment.config.PayOSProperties;
import com.thors.module.payment.dto.CreatePaymentLinkRequest;
import com.thors.module.payment.dto.PayOSWebhookPayload;
import com.thors.module.payment.repository.PaymentRepository;
import com.thors.module.payment.service.PayOSService;
import com.thors.module.payment.util.PayOSSignatureUtils;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PayOSServiceTest {

    @Mock
    private PaymentRepository paymentRepository;

    @Mock
    private OrderService orderService;

    private PayOSProperties properties;
    private Settings settings;
    private ObjectMapper objectMapper;
    private PayOSService service;

    private final Account customer = new Account(
            1, "CUSTOMER", "Customer", "hash", "cust@example.com", "0900000001", "Hanoi", null, "ACTIVE", LocalDateTime.now(), LocalDateTime.now(), null, 1L, null
    );

    @BeforeEach
    void setUp() {
        properties = new PayOSProperties();
        properties.setEnabled(true);
        properties.setClientId("test-client-id");
        properties.setApiKey("test-api-key");
        properties.setChecksumKey("ad6ef479d6609c2abb01733a5b4a148b0a739f3b094984d606ca57c3e618041a");

        settings = new Settings("http://localhost:3000", null, null, null, null, null);
        objectMapper = new ObjectMapper();
        service = new PayOSService(properties, settings, paymentRepository, objectMapper, orderService);
    }

    @Test
    void testCreatePaymentLink_CustomerCannotAccessOthersOrder() {
        PaymentRepository.OrderPayable order = new PaymentRepository.OrderPayable(
                10, "ORD-10", 99, 100000, "UNPAID", "AWAITING_PAYMENT", "ONLINE", "Receiver", "0912345678", "Address"
        );
        when(paymentRepository.findOrderPayable(10)).thenReturn(Optional.of(order));

        CreatePaymentLinkRequest req = new CreatePaymentLinkRequest(10, null, null);
        ApiException ex = assertThrows(ApiException.class, () -> service.createPaymentLink(customer, req));
        assertEquals(403, ex.status);
    }

    @Test
    void testCreatePaymentLink_OrderAlreadyPaid() {
        PaymentRepository.OrderPayable order = new PaymentRepository.OrderPayable(
                10, "ORD-10", 1, 100000, "PAID", "COMPLETED", "ONLINE", "Receiver", "0912345678", "Address"
        );
        when(paymentRepository.findOrderPayable(10)).thenReturn(Optional.of(order));

        CreatePaymentLinkRequest req = new CreatePaymentLinkRequest(10, null, null);
        ApiException ex = assertThrows(ApiException.class, () -> service.createPaymentLink(customer, req));
        assertEquals("ALREADY_PAID", ex.code);
    }

    @Test
    void testHandleWebhook_Success() {
        Map<String, Object> data = new HashMap<>();
        data.put("orderCode", 1793600000L);
        data.put("amount", 200000);
        data.put("code", "00");

        String sig = PayOSSignatureUtils.createDataSignature(data, properties.getChecksumKey());

        PayOSWebhookPayload payload = new PayOSWebhookPayload();
        payload.setCode("00");
        payload.setDesc("success");
        payload.setData(data);
        payload.setSignature(sig);

        PaymentRepository.PaymentRecord record = new PaymentRepository.PaymentRecord(
                1, 10, "1793600000", "ONLINE", "PENDING", 200000, LocalDateTime.now(), "PAYOS", null, null
        );
        when(paymentRepository.findByTransactionRef("1793600000")).thenReturn(Optional.of(record));

        Map<String, Object> res = service.handleWebhook(payload);
        assertEquals(0, res.get("error"));

        verify(paymentRepository).markPaymentSuccess("1793600000");
        verify(orderService).onOnlinePaymentPaid(10);
    }

    @Test
    void testHandleWebhook_InvalidSignatureThrows() {
        Map<String, Object> data = new HashMap<>();
        data.put("orderCode", 1793600000L);
        data.put("code", "00");

        PayOSWebhookPayload payload = new PayOSWebhookPayload();
        payload.setCode("00");
        payload.setData(data);
        payload.setSignature("bad-signature");

        ApiException ex = assertThrows(ApiException.class, () -> service.handleWebhook(payload));
        assertEquals("INVALID_SIGNATURE", ex.code);
    }
}
