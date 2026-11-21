package com.thors.module.account;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.thors.common.ApiErrors;
import com.thors.module.account.controller.AuditLogController;
import com.thors.module.account.dto.AuditLogViews.Filter;
import com.thors.module.account.dto.AuditLogViews.Page;
import com.thors.module.account.dto.AuditLogViews.Summary;
import com.thors.module.account.entity.Account;
import com.thors.module.account.service.AuditLogService;
import com.thors.security.SessionAccess;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** Unit test cho AuditLogController theo sheet "Account" (UTC-ACC-148..152). */
@DisplayName("AuditLogController (REST /api/audit-logs)")
class AuditLogControllerUnitTest {
  private static final LocalDateTime T = LocalDateTime.of(2026, 11, 1, 9, 0);
  private static final LocalDate FROM = LocalDate.of(2026, 11, 1);
  private static final LocalDate TO = LocalDate.of(2026, 11, 10);

  private AuditLogService service;
  private MockMvc mvc;
  private final Account admin = new Account(1, "ADMIN", "Admin", "$2a$10$hash", "admin@shop.com", null,
          null, null, "ACTIVE", T, T, null, 0, null);

  @BeforeEach
  void setUp() {
    service = mock(AuditLogService.class);
    SessionAccess sessions = mock(SessionAccess.class);
    when(sessions.current()).thenReturn(admin);
    when(service.list(any(), any(), anyInt(), anyInt())).thenReturn(new Page(List.of(), 0, 20, 0, 0));
    mvc = MockMvcBuilders.standaloneSetup(new AuditLogController(service, sessions))
            .setControllerAdvice(new ApiErrors())
            .build();
  }

  @Test
  @DisplayName("UTC-ACC-148: GET /api/audit-logs có đủ tham số")
  void acc148() throws Exception {
    mvc.perform(get("/api/audit-logs")
                    .param("q", "admin").param("status", "SUCCESS").param("action", "LOGIN")
                    .param("actorId", "1").param("targetId", "10")
                    .param("from", "2026-11-01").param("to", "2026-11-10")
                    .param("offset", "420").param("page", "1").param("size", "50"))
            .andExpect(status().isOk());
    verify(service).list(admin, new Filter("LOGIN", 1, 10L, FROM, TO, "admin", "SUCCESS", 420), 1, 50);
  }

  @Test
  @DisplayName("UTC-ACC-149: GET /api/audit-logs không có tham số")
  void acc149() throws Exception {
    mvc.perform(get("/api/audit-logs")).andExpect(status().isOk());
    verify(service).list(admin, new Filter(null, null, null, null, null, null, null, 0), 0, 20);
  }

  @Test
  @DisplayName("UTC-ACC-150: GET /api/audit-logs/summary")
  void acc150() throws Exception {
    when(service.summary(admin, FROM, TO, 420)).thenReturn(new Summary(10, 8, 2, 1, 0));

    mvc.perform(get("/api/audit-logs/summary")
                    .param("from", "2026-11-01").param("to", "2026-11-10").param("offset", "420"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.events").value(10));
    verify(service).summary(admin, FROM, TO, 420);
  }

  @Test
  @DisplayName("UTC-ACC-151: GET /api/audit-logs/actions")
  void acc151() throws Exception {
    when(service.actions(admin)).thenReturn(List.of("LOGIN", "ACCOUNT_LOCK"));

    mvc.perform(get("/api/audit-logs/actions"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0]").value("LOGIN"))
            .andExpect(jsonPath("$[1]").value("ACCOUNT_LOCK"));
  }

  @Test
  @DisplayName("UTC-ACC-152: GET /api/audit-logs?from=abc")
  void acc152() throws Exception {
    mvc.perform(get("/api/audit-logs").param("from", "abc"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    verify(service, never()).list(any(), any(), anyInt(), anyInt());
  }
}
