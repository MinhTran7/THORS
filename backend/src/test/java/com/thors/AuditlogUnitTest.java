package com.thors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.thors.common.ApiException;
import com.thors.module.account.dto.AuditLogViews.Filter;
import com.thors.module.account.dto.AuditLogViews.Page;
import com.thors.module.account.dto.AuditLogViews.Summary;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AuditLogRepository;
import com.thors.module.account.service.AuditLogService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.mockito.ArgumentCaptor;

/**
 * Unit test cho chức năng View System Logs: {@link AuditLogService} và AuditLogRepository.statusOf.
 * Mã UTCxxx khớp với sheet "AuditLogService" trong file báo cáo.
 */
class AuditlogUnitTest {
    private static final LocalDateTime T = LocalDateTime.of(2026, 1, 1, 8, 0);
    private static final Filter NO_FILTER = new Filter(null, null, null, null, null, null, null, 0);

    AuditLogRepository logs;
    AuditLogService service;

    final Account admin = acc(1, "ADMIN");
    final Account owner = acc(10, "OWNER");

    @BeforeEach
    void setUp() {
        logs = mock(AuditLogRepository.class);
        service = new AuditLogService(logs);
    }

    private static Account acc(int id, String role) {
        return new Account(id, role, "User " + id, "hash", "u" + id + "@mail.com", null, null, null,
                "ACTIVE", T, T, null, 0L, null);
    }

    private ApiException fail(int status, String code, Executable call) {
        ApiException ex = assertThrows(ApiException.class, call);
        assertEquals(status, ex.status);
        assertEquals(code, ex.code);
        return ex;
    }


    // ================================================================== list

    @Test
    @DisplayName("UTC001 - Admin gets a log page; text filters are trimmed before the repository call")
    void list_adminPassesNormalizedFilterToRepository() {
        Page expected = new Page(List.of(), 1, 20, 0, 0);
        when(logs.search(any(), anyInt(), anyInt())).thenReturn(expected);
        Filter in = new Filter("  LOGIN_FAILED ", 1, 30L, LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 12), "  abc ", " FAILED ", 420);
        Page result = service.list(admin, in, 1, 20);
        assertSame(expected, result);
        ArgumentCaptor<Filter> captor = ArgumentCaptor.forClass(Filter.class);
        verify(logs).search(captor.capture(), eq(1), eq(20));
        assertEquals(new Filter("LOGIN_FAILED", 1, 30L, LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 12), "abc", "FAILED", 420),
                captor.getValue());
    }

    @Test
    @DisplayName("UTC002 - Blank action/q/status are converted to null")
    void list_blankTextFiltersBecomeNull() {
        when(logs.search(any(), anyInt(), anyInt())).thenReturn(new Page(List.of(), 0, 20, 0, 0));
        service.list(admin, new Filter("", null, null, null, null, "   ", " ", 0), 0, 20);
        ArgumentCaptor<Filter> captor = ArgumentCaptor.forClass(Filter.class);
        verify(logs).search(captor.capture(), eq(0), eq(20));
        assertEquals(new Filter(null, null, null, null, null, null, null, 0), captor.getValue());
    }

    @Test
    @DisplayName("UTC003 - Only ADMIN can view system logs")
    void list_rejectsNonAdmin() {
        fail(403, "ROLE", () -> service.list(owner, NO_FILTER, 0, 20));
        verify(logs, never()).search(any(), anyInt(), anyInt());
    }

    @Test
    @DisplayName("UTC004 - Rejects page = -1")
    void list_rejectsNegativePage() {
        fail(400, "PAGE", () -> service.list(admin, NO_FILTER, -1, 20));
    }

    @Test
    @DisplayName("UTC005 - Rejects size = 0 and size = 101")
    void list_rejectsInvalidPageSize() {
        fail(400, "PAGE_SIZE", () -> service.list(admin, NO_FILTER, 0, 0));
        fail(400, "PAGE_SIZE", () -> service.list(admin, NO_FILTER, 0, 101));
    }

    @Test
    @DisplayName("UTC006 - Accepts size = 1 and size = 100")
    void list_acceptsPageSizeBoundaries() {
        when(logs.search(any(), anyInt(), anyInt())).thenReturn(new Page(List.of(), 0, 1, 0, 0));
        assertNotNull(service.list(admin, NO_FILTER, 0, 1));
        assertNotNull(service.list(admin, NO_FILTER, 0, 100));
    }

    @Test
    @DisplayName("UTC007 - Rejects to < from (one day earlier)")
    void list_rejectsEndDateBeforeStartDate() {
        Filter f = new Filter(null, null, null, LocalDate.of(2026, 10, 12), LocalDate.of(2026, 10, 11), null, null, 0);
        fail(400, "DATE_RANGE", () -> service.list(admin, f, 0, 20));
        verify(logs, never()).search(any(), anyInt(), anyInt());
    }

    @Test
    @DisplayName("UTC008 - Accepts from = to, from only and to only")
    void list_acceptsEqualOrOpenDateRange() {
        when(logs.search(any(), anyInt(), anyInt())).thenReturn(new Page(List.of(), 0, 20, 0, 0));
        LocalDate day = LocalDate.of(2026, 10, 12);
        assertNotNull(service.list(admin, new Filter(null, null, null, day, day, null, null, 0), 0, 20));
        assertNotNull(service.list(admin, new Filter(null, null, null, day, null, null, null, 0), 0, 20));
        assertNotNull(service.list(admin, new Filter(null, null, null, null, day, null, null, 0), 0, 20));
    }

    @Test
    @DisplayName("UTC009 - q of 100 characters is accepted, 101 is rejected")
    void list_queryLengthBoundary() {
        when(logs.search(any(), anyInt(), anyInt())).thenReturn(new Page(List.of(), 0, 20, 0, 0));
        assertNotNull(service.list(admin, new Filter(null, null, null, null, null, "a".repeat(100), null, 0), 0, 20));
        fail(400, "QUERY", () -> service.list(admin, new Filter(null, null, null, null, null, "a".repeat(101), null, 0), 0, 20));
    }

    @Test
    @DisplayName("UTC010 - Rejects an unknown status filter")
    void list_rejectsUnknownStatus() {
        fail(400, "STATUS_FILTER", () -> service.list(admin, new Filter(null, null, null, null, null, null, "UNKNOWN", 0), 0, 20));
    }

    @Test
    @DisplayName("UTC011 - Accepts SUCCESS, WARNING and FAILED")
    void list_acceptsKnownStatuses() {
        when(logs.search(any(), anyInt(), anyInt())).thenReturn(new Page(List.of(), 0, 20, 0, 0));
        for (String status : List.of("SUCCESS", "WARNING", "FAILED")) {
            assertNotNull(service.list(admin, new Filter(null, null, null, null, null, null, status, 0), 0, 20));
        }
    }

    @Test
    @DisplayName("UTC012 - offset -840 and 840 are accepted; -841 and 841 are rejected")
    void list_timezoneOffsetBoundary() {
        when(logs.search(any(), anyInt(), anyInt())).thenReturn(new Page(List.of(), 0, 20, 0, 0));
        assertNotNull(service.list(admin, new Filter(null, null, null, null, null, null, null, -840), 0, 20));
        assertNotNull(service.list(admin, new Filter(null, null, null, null, null, null, null, 840), 0, 20));
        fail(400, "OFFSET", () -> service.list(admin, new Filter(null, null, null, null, null, null, null, -841), 0, 20));
        fail(400, "OFFSET", () -> service.list(admin, new Filter(null, null, null, null, null, null, null, 841), 0, 20));
    }


    // ================================================================== summary

    @Test
    @DisplayName("UTC013 - Admin gets today's statistics")
    void summary_adminReturnsRepositorySummary() {
        Summary s = new Summary(5, 4, 2, 1, 1);
        when(logs.summary(420)).thenReturn(s);
        assertSame(s, service.summary(admin, 420));
    }

    @Test
    @DisplayName("UTC014 - Only ADMIN can view the statistics")
    void summary_rejectsNonAdmin() {
        fail(403, "ROLE", () -> service.summary(owner, 0));
        verify(logs, never()).summary(anyInt());
    }

    @Test
    @DisplayName("UTC015 - offset 840 is accepted, 841 and -841 are rejected")
    void summary_timezoneOffsetBoundary() {
        Summary s = new Summary(0, 0, 0, 0, 0);
        when(logs.summary(840)).thenReturn(s);
        assertSame(s, service.summary(admin, 840));
        fail(400, "OFFSET", () -> service.summary(admin, 841));
        fail(400, "OFFSET", () -> service.summary(admin, -841));
    }


    // ================================================================== actions

    @Test
    @DisplayName("UTC016 - Admin gets the list of action types for the filter dropdown")
    void actions_adminReturnsActionList() {
        List<String> actions = List.of("ACCOUNT_LOCK", "LOGIN_FAILED");
        when(logs.actions()).thenReturn(actions);
        assertSame(actions, service.actions(admin));
    }

    @Test
    @DisplayName("UTC017 - Only ADMIN can read the action list")
    void actions_rejectsNonAdmin() {
        fail(403, "ROLE", () -> service.actions(owner));
        verify(logs, never()).actions();
    }


    // ================================================================== statusOf (AuditLogRepository)

    @Test
    @DisplayName("UTC018 - LOGIN_FAILED is shown as FAILED")
    void statusOf_loginFailedIsFailed() {
        assertEquals("FAILED", AuditLogRepository.statusOf("LOGIN_FAILED"));
    }

    @Test
    @DisplayName("UTC019 - Lock, deactivate and reset-request actions are shown as WARNING")
    void statusOf_securityActionsAreWarning() {
        for (String action : List.of("ACCOUNT_LOCK", "ACCOUNT_DEACTIVATE", "PASSWORD_RESET_REQUEST")) {
            assertEquals("WARNING", AuditLogRepository.statusOf(action), action);
        }
    }

    @Test
    @DisplayName("UTC020 - Any other action (including unknown ones) is shown as SUCCESS")
    void statusOf_otherActionsAreSuccess() {
        for (String action : List.of("PROFILE_UPDATE", "ACCOUNT_UNLOCK", "PASSWORD_CHANGE", "LOGIN_SUCCESS", "SOMETHING_NEW")) {
            assertEquals("SUCCESS", AuditLogRepository.statusOf(action), action);
        }
    }

}