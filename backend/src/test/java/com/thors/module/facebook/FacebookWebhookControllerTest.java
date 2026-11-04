package com.thors.module.facebook;

import com.thors.module.facebook.controller.FacebookWebhookController;
import com.thors.module.facebook.service.FacebookService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class FacebookWebhookControllerTest {

    private FacebookWebhookController controller;
    private FacebookService facebookService;
    private final String verifyToken = "thors_secret_webhook_token_2026";

    @BeforeEach
    void setUp() {
        facebookService = mock(FacebookService.class);
        controller = new FacebookWebhookController(facebookService);
        ReflectionTestUtils.setField(controller, "verifyToken", verifyToken);
    }

    @Test
    void testVerifyWebhook_Success() {
        ResponseEntity<String> response = controller.verifyWebhook("subscribe", verifyToken, "1158201444");
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("1158201444", response.getBody());
    }

    @Test
    void testVerifyWebhook_InvalidToken() {
        ResponseEntity<String> response = controller.verifyWebhook("subscribe", "wrong-token", "1158201444");
        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    @Test
    void testVerifyWebhook_InvalidMode() {
        ResponseEntity<String> response = controller.verifyWebhook("unsubscribe", verifyToken, "1158201444");
        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    @Test
    void testHandleWebhookEvent_Success() {
        Map<String, Object> payload = Map.of("object", "page");
        ResponseEntity<String> response = controller.handleWebhookEvent(payload);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("EVENT_RECEIVED", response.getBody());
        verify(facebookService).processWebhookPayload(payload);
    }
}
