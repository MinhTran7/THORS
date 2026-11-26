package com.thors.module.returns;

import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * API quản lý hoàn hàng chỉ dành cho nội bộ (OWNER / ADMIN / STAFF): khách hàng không xem được
 * yêu cầu hoàn (có STK ngân hàng) của người khác. Luồng khách / khách vãng lai vẫn mở như cũ.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ReturnEndpointSecurityTest {

    @Autowired
    MockMvc mvc;

    @Test
    void customerCannotUseInternalReturnApis() throws Exception {
        var customer = user("khach").roles("CUSTOMER");

        mvc.perform(get("/api/returns").with(customer)).andExpect(status().isForbidden());
        mvc.perform(get("/api/returns/1").with(customer)).andExpect(status().isForbidden());
        mvc.perform(get("/api/returns/orders/ORD-1").with(customer)).andExpect(status().isForbidden());
        mvc.perform(post("/api/returns/1/process").with(customer).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/returns/seed-sample-order").with(customer).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void familyMemberCannotManageReturns() throws Exception {
        // Trang /returns chỉ dành cho Owner; Family Member không có quyền xem danh sách hoàn hàng
        mvc.perform(get("/api/returns").with(user("tv").roles("FAMILY_MEMBER"))).andExpect(status().isForbidden());
    }

    @Test
    void customerCanStillCreateOwnReturnRequest() throws Exception {
        // Không bị chặn quyền (service tự kiểm tra đơn có phải của khách không)
        mvc.perform(post("/api/returns").with(user("khach").roles("CUSTOMER")).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(result -> assertNotEquals(403, result.getResponse().getStatus()));
    }

    @Test
    void guestTrackingStaysPublic() throws Exception {
        mvc.perform(get("/api/returns/track/ORD-1"))
                .andExpect(result -> assertNotEquals(401, result.getResponse().getStatus()));
        mvc.perform(post("/api/returns/public").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(result -> assertNotEquals(401, result.getResponse().getStatus()));
    }
}
