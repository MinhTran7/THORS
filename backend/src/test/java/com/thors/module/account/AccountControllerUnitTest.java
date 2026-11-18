package com.thors.module.account;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.thors.common.ApiErrors;
import com.thors.common.ApiException;
import com.thors.module.account.controller.AccountController;
import com.thors.module.account.dto.AccountDetail;
import com.thors.module.account.dto.AccountPage;
import com.thors.module.account.dto.AccountRequests.Create;
import com.thors.module.account.dto.AccountRequests.Edit;
import com.thors.module.account.dto.AccountRequests.Password;
import com.thors.module.account.dto.AccountRequests.UpdateProfile;
import com.thors.module.account.dto.AccountSummary;
import com.thors.module.account.dto.AuditLogViews.ProfileActivity;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AccountRepository.OpenResetRequest;
import com.thors.module.account.service.AccountMailService;
import com.thors.module.account.service.AccountService;
import com.thors.module.account.service.AuditLogService;
import com.thors.module.account.service.AvatarImageService;
import com.thors.security.SessionAccess;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * Unit test cho AccountController theo sheet "Account" (UTC-ACC-120..145). Service và phiên đăng nhập
 * là đồ giả; bộ xử lý lỗi ApiErrors là thật để kiểm tra mã HTTP và JSON trả về.
 */
@DisplayName("AccountController (REST /api/accounts)")
class AccountControllerUnitTest {
  private static final LocalDateTime T = LocalDateTime.of(2026, 11, 1, 9, 0);

  private AccountService service;
  private AuditLogService audits;
  private AvatarImageService avatars;
  private SessionAccess sessions;
  private AccountMailService mails;
  private MockMvc mvc;

  private final Account me = account(10, "FAMILY_MEMBER", null);
  private final AccountDetail detail = new AccountDetail(10, "FAMILY_MEMBER", "User 10", "user10@shop.com", null,
          null, null, "ACTIVE", false, true, T, 2, "Owner");

  @BeforeEach
  void setUp() {
    service = mock(AccountService.class);
    audits = mock(AuditLogService.class);
    avatars = mock(AvatarImageService.class);
    sessions = mock(SessionAccess.class);
    mails = mock(AccountMailService.class);
    when(sessions.current()).thenReturn(me);
    mvc = MockMvcBuilders.standaloneSetup(new AccountController(service, audits, avatars, sessions, mails))
            .setControllerAdvice(new ApiErrors())
            .build();
  }

  private static Account account(int id, String role, String phone) {
    return new Account(id, role, "User " + id, "$2a$10$hash", "user" + id + "@shop.com", phone, null,
            null, "ACTIVE", T, T, null, 0, 2);
  }

  private ResultActions json(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req,
                             String body) throws Exception {
    return mvc.perform(req.contentType(MediaType.APPLICATION_JSON).characterEncoding("UTF-8").content(body));
  }

  @Test
  @DisplayName("UTC-ACC-120: GET /profile khi đã đăng nhập")
  void acc120() throws Exception {
    when(service.profile(me)).thenReturn(detail);

    mvc.perform(get("/api/accounts/profile"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(10))
            .andExpect(jsonPath("$.role").value("FAMILY_MEMBER"))
            .andExpect(jsonPath("$.fullName").value("User 10"))
            .andExpect(jsonPath("$.email").value("user10@shop.com"));
  }

  @Test
  @DisplayName("UTC-ACC-121: GET /profile khi chưa đăng nhập")
  void acc121() throws Exception {
    when(sessions.current()).thenThrow(new ApiException(401, "UNAUTHENTICATED", "Vui lòng đăng nhập."));

    mvc.perform(get("/api/accounts/profile"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
            .andExpect(jsonPath("$.message").value("Vui lòng đăng nhập."));
    verify(service, never()).profile(any());
  }

  @Test
  @DisplayName("UTC-ACC-122: PATCH /profile hợp lệ")
  void acc122() throws Exception {
    when(service.updateProfile(eq(me), any())).thenReturn(detail);

    json(patch("/api/accounts/profile"),
            "{\"fullName\":\"Nguyen Van B\",\"phone\":\"0912345678\",\"address\":\"123 Le Loi\"}")
            .andExpect(status().isOk());
    verify(service).updateProfile(me, new UpdateProfile("Nguyen Van B", "0912345678", "123 Le Loi"));
  }

  @Test
  @DisplayName("UTC-ACC-123: PATCH /profile với fullName rỗng")
  void acc123() throws Exception {
    json(patch("/api/accounts/profile"), "{\"fullName\":\"\"}")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION"));
    verify(service, never()).updateProfile(any(), any());
  }

  @Test
  @DisplayName("UTC-ACC-124: PATCH /profile với fullName 101 ký tự")
  void acc124() throws Exception {
    json(patch("/api/accounts/profile"), "{\"fullName\":\"" + "a".repeat(101) + "\"}")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION"));
    verify(service, never()).updateProfile(any(), any());
  }

  @Test
  @DisplayName("UTC-ACC-125: PUT /profile/avatar (multipart)")
  void acc125() throws Exception {
    var file = new MockMultipartFile("file", "a.png", "image/png", new byte[] {1, 2, 3});
    when(avatars.replace(eq(me), any())).thenReturn(detail);

    mvc.perform(multipart(HttpMethod.PUT, "/api/accounts/profile/avatar").file(file))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(10));
    verify(avatars).replace(eq(me), argThat(f -> "a.png".equals(f.getOriginalFilename())));
  }

  @Test
  @DisplayName("UTC-ACC-126: DELETE /profile/avatar")
  void acc126() throws Exception {
    when(avatars.remove(me)).thenReturn(detail);

    mvc.perform(delete("/api/accounts/profile/avatar")).andExpect(status().isOk());
    verify(avatars).remove(me);
  }

  @Test
  @DisplayName("UTC-ACC-127: POST /profile/phone hợp lệ")
  void acc127() throws Exception {
    when(service.phone(me, "0988776655")).thenReturn(account(10, "FAMILY_MEMBER", "0988776655"));

    json(post("/api/accounts/profile/phone"), "{\"phone\":\"0988776655\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(10))
            .andExpect(jsonPath("$.phone").value("0988776655"))
            .andExpect(jsonPath("$.passwordHash").doesNotExist());
    verify(service).phone(me, "0988776655");
  }

  @Test
  @DisplayName("UTC-ACC-128: POST /profile/phone rỗng")
  void acc128() throws Exception {
    json(post("/api/accounts/profile/phone"), "{\"phone\":\"\"}")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION"));
    verify(service, never()).phone(any(), any());
  }

  @Test
  @DisplayName("UTC-ACC-129: GET /profile/activity, limit mặc định")
  void acc129() throws Exception {
    when(audits.mine(me, 8)).thenReturn(new ProfileActivity(null, List.of()));

    mvc.perform(get("/api/accounts/profile/activity")).andExpect(status().isOk());
    verify(audits).mine(me, 8);
  }

  @Test
  @DisplayName("UTC-ACC-130: GET /profile/activity?limit=5")
  void acc130() throws Exception {
    when(audits.mine(me, 5)).thenReturn(new ProfileActivity(null, List.of()));

    mvc.perform(get("/api/accounts/profile/activity").param("limit", "5")).andExpect(status().isOk());
    verify(audits).mine(me, 5);
  }

  @Test
  @DisplayName("UTC-ACC-131: GET /api/accounts, tham số mặc định")
  void acc131() throws Exception {
    when(service.list(me, null, null, null, 0, 20)).thenReturn(new AccountPage(List.of(), 0, 20, 0, 0));

    mvc.perform(get("/api/accounts")).andExpect(status().isOk());
    verify(service).list(me, null, null, null, 0, 20);
  }

  @Test
  @DisplayName("UTC-ACC-132: GET /api/accounts có đủ tham số")
  void acc132() throws Exception {
    when(service.list(me, "nguyen", "FAMILY_MEMBER", "ACTIVE", 1, 10))
            .thenReturn(new AccountPage(List.of(), 1, 10, 0, 0));

    mvc.perform(get("/api/accounts").param("q", "nguyen").param("role", "FAMILY_MEMBER")
                    .param("status", "ACTIVE").param("page", "1").param("size", "10"))
            .andExpect(status().isOk());
    verify(service).list(me, "nguyen", "FAMILY_MEMBER", "ACTIVE", 1, 10);
  }

  @Test
  @DisplayName("UTC-ACC-133: GET /api/accounts?page=abc")
  void acc133() throws Exception {
    mvc.perform(get("/api/accounts").param("page", "abc"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    verify(service, never()).list(any(), any(), any(), any(), anyInt(), anyInt());
  }

  @Test
  @DisplayName("UTC-ACC-134: GET /summary")
  void acc134() throws Exception {
    when(service.summary(me)).thenReturn(new AccountSummary(5, Map.of("ACTIVE", 5L), Map.of("FAMILY_MEMBER", 5L)));

    mvc.perform(get("/api/accounts/summary"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(5))
            .andExpect(jsonPath("$.byStatus.ACTIVE").value(5))
            .andExpect(jsonPath("$.byRole.FAMILY_MEMBER").value(5));
  }

  @Test
  @DisplayName("UTC-ACC-135: GET /password-reset-requests")
  void acc135() throws Exception {
    when(service.resetRequests(me))
            .thenReturn(List.of(new OpenResetRequest(2, "Owner", "owner@shop.com", T)));

    mvc.perform(get("/api/accounts/password-reset-requests"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].userId").value(2))
            .andExpect(jsonPath("$[0].fullName").value("Owner"))
            .andExpect(jsonPath("$[0].email").value("owner@shop.com"));
  }

  @Test
  @DisplayName("UTC-ACC-136: GET /api/accounts/10")
  void acc136() throws Exception {
    when(service.detail(me, 10)).thenReturn(detail);

    mvc.perform(get("/api/accounts/10"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(10));
    verify(service).detail(me, 10);
  }

  @Test
  @DisplayName("UTC-ACC-137: POST /api/accounts hợp lệ")
  void acc137() throws Exception {
    var created = account(50, "FAMILY_MEMBER", "+84911223344");
    when(service.create(eq(me), any())).thenReturn(created);
    when(mails.sendAccountCreated(created, "Password123!")).thenReturn(true);

    json(post("/api/accounts"),
            "{\"role\":\"FAMILY_MEMBER\",\"fullName\":\"Le Thi Gia Dinh\",\"email\":\"family2@shop.com\","
                    + "\"phone\":\"0911223344\",\"password\":\"Password123!\",\"confirmPassword\":\"Password123!\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(50))
            .andExpect(jsonPath("$.passwordHash").doesNotExist())
            .andExpect(jsonPath("$.mailSent").value(true));
    verify(service).create(me, new Create("FAMILY_MEMBER", "Le Thi Gia Dinh", "family2@shop.com", "0911223344",
            "Password123!", "Password123!"));
    verify(mails).sendAccountCreated(created, "Password123!");
  }

  @Test
  @DisplayName("UTC-ACC-138: POST /api/accounts với email sai định dạng")
  void acc138() throws Exception {
    json(post("/api/accounts"),
            "{\"role\":\"FAMILY_MEMBER\",\"fullName\":\"Le Thi Gia Dinh\",\"email\":\"khong-phai-email\","
                    + "\"phone\":\"0911223344\",\"password\":\"Password123!\",\"confirmPassword\":\"Password123!\"}")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION"));
    verify(service, never()).create(any(), any());
    verifyNoInteractions(mails);
  }

  @Test
  @DisplayName("UTC-ACC-139: PATCH /api/accounts/10")
  void acc139() throws Exception {
    when(service.edit(eq(me), eq(10), any())).thenReturn(account(10, "FAMILY_MEMBER", null));

    json(patch("/api/accounts/10"), "{\"fullName\":\"Le Van C\",\"status\":null}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(10));
    verify(service).edit(me, 10, new Edit("Le Van C", null));
  }

  @Test
  @DisplayName("UTC-ACC-140: PATCH /api/accounts/10/status = DISABLED")
  void acc140() throws Exception {
    when(service.changeStatus(me, 10, "DISABLED")).thenReturn(account(10, "FAMILY_MEMBER", null));

    json(patch("/api/accounts/10/status"), "{\"status\":\"DISABLED\"}").andExpect(status().isOk());
    verify(service).changeStatus(me, 10, "DISABLED");
  }

  @Test
  @DisplayName("UTC-ACC-141: PATCH /api/accounts/10/status rỗng")
  void acc141() throws Exception {
    json(patch("/api/accounts/10/status"), "{\"status\":\"\"}")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION"));
    verify(service, never()).changeStatus(any(), anyInt(), any());
  }

  @Test
  @DisplayName("UTC-ACC-142: POST /api/accounts/10/lock")
  void acc142() throws Exception {
    when(service.lock(me, 10)).thenReturn(account(10, "FAMILY_MEMBER", null));

    mvc.perform(post("/api/accounts/10/lock")).andExpect(status().isOk());
    verify(service).lock(me, 10);
  }

  @Test
  @DisplayName("UTC-ACC-143: POST /api/accounts/10/unlock")
  void acc143() throws Exception {
    when(service.unlock(me, 10)).thenReturn(account(10, "FAMILY_MEMBER", null));

    mvc.perform(post("/api/accounts/10/unlock")).andExpect(status().isOk());
    verify(service).unlock(me, 10);
  }

  @Test
  @DisplayName("UTC-ACC-144: POST /api/accounts/10/reset-password")
  void acc144() throws Exception {
    json(post("/api/accounts/10/reset-password"),
            "{\"password\":\"NewPassword123!\",\"confirmPassword\":\"NewPassword123!\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.message")
                    .value("Đã đặt lại mật khẩu. Người dùng cần đăng nhập lại bằng mật khẩu mới."));
    verify(service).resetByManager(me, 10, new Password("NewPassword123!", "NewPassword123!"));
  }

  @Test
  @DisplayName("UTC-ACC-145: service báo lỗi 403 thì trả về JSON lỗi")
  void acc145() throws Exception {
    when(service.list(any(), any(), any(), any(), anyInt(), anyInt()))
            .thenThrow(new ApiException(403, "ROLE", "Không có quyền quản lý tài khoản."));

    mvc.perform(get("/api/accounts"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("ROLE"))
            .andExpect(jsonPath("$.message").value("Không có quyền quản lý tài khoản."));
  }
}
