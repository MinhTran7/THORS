package com.thors.module.facebook;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Chỉ endpoint gốc /api/facebook/webhook (Meta gọi) được mở công khai; các endpoint của màn hình
 * Social POS (đọc chat, gửi tin, tạo đơn) phải đăng nhập.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class FacebookEndpointSecurityTest {

    @Autowired
    MockMvc mvc;

    @Test
    void metaCanVerifyWebhookWithoutLogin() throws Exception {
        mvc.perform(get("/api/facebook/webhook")
                        .param("hub.mode", "subscribe")
                        .param("hub.verify_token", "thors_secret_webhook_token_2026")
                        .param("hub.challenge", "12345"))
                .andExpect(status().isOk())
                .andExpect(content().string("12345"));
    }

    @Test
    void metaCanPushEventsWithoutLoginOrCsrf() throws Exception {
        mvc.perform(post("/api/facebook/webhook")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"object\":\"page\",\"entry\":[]}"))
                .andExpect(status().isOk());
    }

    @Test
    void anonymousCannotReadConversationsOrMessages() throws Exception {
        mvc.perform(get("/api/facebook/webhook/conversations")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/facebook/webhook/messages")).andExpect(status().isUnauthorized());
    }

    @Test
    void anonymousCannotSendMessagesOrCreateOrders() throws Exception {
        String sendBody = "{\"recipientPsid\":\"1\",\"message\":\"hi\"}";
        mvc.perform(post("/api/facebook/webhook/send").contentType(MediaType.APPLICATION_JSON).content(sendBody))
                .andExpect(status().is4xxClientError());
        mvc.perform(post("/api/facebook/webhook/order")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[{\"detailId\":1,\"quantity\":1}]}"))
                .andExpect(status().is4xxClientError());
    }
}
