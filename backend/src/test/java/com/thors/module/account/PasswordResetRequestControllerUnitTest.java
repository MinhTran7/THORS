package com.thors.module.account;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.thors.common.ApiErrors;
import com.thors.module.account.controller.PasswordResetRequestController;
import com.thors.module.account.service.AccountService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** Unit test cho PasswordResetRequestController theo sheet "Account" (UTC-ACC-146..147). */
@DisplayName("PasswordResetRequestController (REST /api/auth/password-reset-requests)")
class PasswordResetRequestControllerUnitTest {
  private AccountService service;
  private MockMvc mvc;

  @BeforeEach
  void setUp() {
    service = mock(AccountService.class);
    mvc = MockMvcBuilders.standaloneSetup(new PasswordResetRequestController(service))
            .setControllerAdvice(new ApiErrors())
            .build();
  }

  @Test
  @DisplayName("UTC-ACC-146: gửi yêu cầu với email của Owner")
  void acc146() throws Exception {
    mvc.perform(post("/api/auth/password-reset-requests")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"identifier\":\"owner@shop.com\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.message").value(
                    "Nếu tài khoản chủ cửa hàng tồn tại, yêu cầu đặt lại mật khẩu đã được gửi tới quản trị viên."));
    verify(service).requestOwnerReset("owner@shop.com");
  }

  @Test
  @DisplayName("UTC-ACC-147: identifier rỗng")
  void acc147() throws Exception {
    mvc.perform(post("/api/auth/password-reset-requests")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"identifier\":\"\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION"));
    verify(service, never()).requestOwnerReset(any());
  }
}
