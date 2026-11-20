package com.thors.module.account;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.thors.common.ApiException;
import com.thors.module.account.dto.AuditLogViews.Activity;
import com.thors.module.account.dto.AuditLogViews.Filter;
import com.thors.module.account.dto.AuditLogViews.Page;
import com.thors.module.account.dto.AuditLogViews.ProfileActivity;
import com.thors.module.account.dto.AuditLogViews.Summary;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AuditLogRepository;
import com.thors.module.account.service.AuditLogService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;

/** Unit test cho AuditLogService theo sheet "Account" (UTC-ACC-083..104). */
@DisplayName("AuditLogService")
class AuditLogServiceUnitTest {
  private static final LocalDateTime T = LocalDateTime.of(2026, 11, 1, 9, 0);
  private static final String ROLE_MESSAGE = "Chỉ quản trị viên được xem nhật ký hệ thống.";

  private AuditLogRepository logs;
  private AuditLogService service;

  private final Account admin = account(1, "ADMIN");
  private final Account owner = account(2, "OWNER");

  @BeforeEach
  void setUp() {
    logs = mock(AuditLogRepository.class);
    service = new AuditLogService(logs);
  }

  private static Account account(int id, String role) {
    return new Account(id, role, "User " + id, "$2a$10$hash", "user" + id + "@shop.com", null, null,
            null, "ACTIVE", T, T, null, 0, null);
  }

  private static Filter filter(LocalDate from, LocalDate to, String q, String status, int offset) {
    return new Filter(null, null, null, from, to, q, status, offset);
  }

  private static Filter empty() {
    return filter(null, null, null, null, 0);
  }

  private static void api(int status, String code, String message, Executable call) {
    ApiException e = assertThrows(ApiException.class, call);
    assertEquals(status, e.status);
    assertEquals(code, e.code);
    assertEquals(message, e.getMessage());
  }

  @Nested
  @DisplayName("list(Account actor, Filter f, int page, int size)")
  class ListTests {
    @BeforeEach
    void repoReturnsPage() {
      when(logs.search(any(), anyInt(), anyInt())).thenReturn(new Page(List.of(), 0, 20, 0, 0));
    }

    @Test
    @DisplayName("UTC-ACC-083: Admin lọc, q được cắt khoảng trắng, action rỗng thành null")
    void acc083() {
      var page = new Page(List.of(), 0, 20, 0, 0);
      when(logs.search(any(), eq(0), eq(20))).thenReturn(page);

      var result = service.list(admin,
              new Filter("", null, null, null, null, "  admin  ", "SUCCESS", 420), 0, 20);

      assertSame(page, result);
      verify(logs).search(new Filter(null, null, null, null, null, "admin", "SUCCESS", 420), 0, 20);
    }

    @Test
    @DisplayName("UTC-ACC-084: Owner xem nhật ký")
    void acc084() {
      api(403, "ROLE", ROLE_MESSAGE, () -> service.list(owner, empty(), 0, 20));
      verify(logs, never()).search(any(), anyInt(), anyInt());
    }

    @Test
    @DisplayName("UTC-ACC-085: page = -1")
    void acc085() {
      api(400, "PAGE", "Trang không hợp lệ.", () -> service.list(admin, empty(), -1, 20));
      verify(logs, never()).search(any(), anyInt(), anyInt());
    }

    @Test
    @DisplayName("UTC-ACC-086: size = 0")
    void acc086() {
      api(400, "PAGE_SIZE", "Kích thước trang phải từ 1 đến 100.",
              () -> service.list(admin, empty(), 0, 0));
      verify(logs, never()).search(any(), anyInt(), anyInt());
    }

    @Test
    @DisplayName("UTC-ACC-087: size = 101")
    void acc087() {
      api(400, "PAGE_SIZE", "Kích thước trang phải từ 1 đến 100.",
              () -> service.list(admin, empty(), 0, 101));
      verify(logs, never()).search(any(), anyInt(), anyInt());
    }

    @Test
    @DisplayName("UTC-ACC-088: size = 100 (biên trên)")
    void acc088() {
      assertDoesNotThrow(() -> service.list(admin, empty(), 0, 100));
      verify(logs).search(any(), eq(0), eq(100));
    }

    @Test
    @DisplayName("UTC-ACC-089: ngày kết thúc trước ngày bắt đầu")
    void acc089() {
      var f = filter(LocalDate.of(2026, 11, 10), LocalDate.of(2026, 11, 1), null, null, 0);

      api(400, "DATE_RANGE", "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.",
              () -> service.list(admin, f, 0, 20));
      verify(logs, never()).search(any(), anyInt(), anyInt());
    }

    @Test
    @DisplayName("UTC-ACC-090: ngày bắt đầu bằng ngày kết thúc")
    void acc090() {
      var day = LocalDate.of(2026, 11, 10);

      assertDoesNotThrow(() -> service.list(admin, filter(day, day, null, null, 0), 0, 20));
      verify(logs).search(argThat(f -> day.equals(f.from()) && day.equals(f.to())), eq(0), eq(20));
    }

    @Test
    @DisplayName("UTC-ACC-091: q 101 ký tự")
    void acc091() {
      api(400, "QUERY", "Từ khóa tìm kiếm quá dài.",
              () -> service.list(admin, filter(null, null, "a".repeat(101), null, 0), 0, 20));
      verify(logs, never()).search(any(), anyInt(), anyInt());
    }

    @Test
    @DisplayName("UTC-ACC-092: status lọc = 'WARNING'")
    void acc092() {
      api(400, "STATUS_FILTER", "Trạng thái lọc không hợp lệ.",
              () -> service.list(admin, filter(null, null, null, "WARNING", 0), 0, 20));
      verify(logs, never()).search(any(), anyInt(), anyInt());
    }

    @Test
    @DisplayName("UTC-ACC-093: offset = 841")
    void acc093() {
      api(400, "OFFSET", "Múi giờ không hợp lệ.",
              () -> service.list(admin, filter(null, null, null, null, 841), 0, 20));
      verify(logs, never()).search(any(), anyInt(), anyInt());
    }

    @Test
    @DisplayName("UTC-ACC-094: offset = -840 (biên dưới)")
    void acc094() {
      assertDoesNotThrow(() -> service.list(admin, filter(null, null, null, null, -840), 0, 20));
      verify(logs).search(argThat(f -> f.offset() == -840), eq(0), eq(20));
    }
  }

  @Nested
  @DisplayName("summary(Account actor, LocalDate from, LocalDate to, int offset)")
  class SummaryTests {
    @Test
    @DisplayName("UTC-ACC-095: Admin, không giới hạn ngày")
    void acc095() {
      var summary = new Summary(10, 8, 2, 1, 0);
      when(logs.summary(null, null, 420)).thenReturn(summary);

      Summary s = service.summary(admin, null, null, 420);

      verify(logs).summary(null, null, 420);
      assertSame(summary, s);
      assertEquals(10, s.events());
      assertEquals(8, s.successful());
      assertEquals(2, s.failed());
      assertEquals(1, s.failedSignIns());
      assertEquals(0, s.pausedSignIns());
    }

    @Test
    @DisplayName("UTC-ACC-096: FAMILY_MEMBER xem thống kê")
    void acc096() {
      api(403, "ROLE", ROLE_MESSAGE, () -> service.summary(account(4, "FAMILY_MEMBER"), null, null, 420));
      verify(logs, never()).summary(any(), any(), anyInt());
    }

    @Test
    @DisplayName("UTC-ACC-097: ngày kết thúc trước ngày bắt đầu")
    void acc097() {
      api(400, "DATE_RANGE", "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.",
              () -> service.summary(admin, LocalDate.of(2026, 11, 10), LocalDate.of(2026, 11, 1), 420));
      verify(logs, never()).summary(any(), any(), anyInt());
    }

    @Test
    @DisplayName("UTC-ACC-098: offset = -841")
    void acc098() {
      api(400, "OFFSET", "Múi giờ không hợp lệ.", () -> service.summary(admin, null, null, -841));
      verify(logs, never()).summary(any(), any(), anyInt());
    }
  }

  @Nested
  @DisplayName("actions(Account actor)")
  class ActionsTests {
    @Test
    @DisplayName("UTC-ACC-099: Admin lấy danh sách loại hành động")
    void acc099() {
      when(logs.actions()).thenReturn(List.of("LOGIN", "ACCOUNT_LOCK"));

      assertEquals(List.of("LOGIN", "ACCOUNT_LOCK"), service.actions(admin));
    }

    @Test
    @DisplayName("UTC-ACC-100: CUSTOMER lấy danh sách loại hành động")
    void acc100() {
      api(403, "ROLE", ROLE_MESSAGE, () -> service.actions(account(7, "CUSTOMER")));
      verify(logs, never()).actions();
    }
  }

  @Nested
  @DisplayName("mine(Account actor, int limit)")
  class MineTests {
    private final Account customer = account(7, "CUSTOMER");

    @Test
    @DisplayName("UTC-ACC-101: CUSTOMER xem hoạt động của chính mình, limit = 8")
    void acc101() {
      var last = new Activity(1, "LOGIN", "SUCCESS", false, "127.0.0.1", T);
      var items = List.of(last);
      when(logs.lastLogin(7)).thenReturn(last);
      when(logs.recentFor(7, 8)).thenReturn(items);

      ProfileActivity p = service.mine(customer, 8);

      assertSame(last, p.lastLogin());
      assertEquals(items, p.items());
      verify(logs).lastLogin(7);
      verify(logs).recentFor(7, 8);
    }

    @Test
    @DisplayName("UTC-ACC-102: limit = 20 (biên trên)")
    void acc102() {
      when(logs.recentFor(7, 20)).thenReturn(List.of());

      assertDoesNotThrow(() -> service.mine(customer, 20));
      verify(logs).recentFor(7, 20);
    }

    @Test
    @DisplayName("UTC-ACC-103: limit = 0")
    void acc103() {
      api(400, "LIMIT", "Số dòng phải từ 1 đến 20.", () -> service.mine(customer, 0));
      verifyNoInteractions(logs);
    }

    @Test
    @DisplayName("UTC-ACC-104: limit = 21")
    void acc104() {
      api(400, "LIMIT", "Số dòng phải từ 1 đến 20.", () -> service.mine(customer, 21));
      verifyNoInteractions(logs);
    }
  }
}
