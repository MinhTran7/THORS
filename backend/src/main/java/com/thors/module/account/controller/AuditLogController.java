package com.thors.module.account.controller;

import com.thors.module.account.dto.AuditLogViews.Filter;
import com.thors.module.account.service.AuditLogService;
import com.thors.security.SessionAccess;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/audit-logs")
public class AuditLogController {
    private final AuditLogService service;
    private final SessionAccess sessions;

    public AuditLogController(AuditLogService service, SessionAccess sessions) {
        this.service = service;
        this.sessions = sessions;
    }

    /**
     * GET /api/audit-logs?q=&status=&action=&actorId=&targetId=&from=2026-10-01&to=2026-10-12
     * &offset=420&page=0&size=20
     */
    @GetMapping
    Object list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) Integer actorId,
            @RequestParam(required = false) Long targetId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.list(
                sessions.current(),
                new Filter(action, actorId, targetId, from, to, q, status, offset),
                page,
                size);
    }

    /** Số liệu trong ngày cho các thẻ thống kê. */
    @GetMapping("/summary")
    Object summary(@RequestParam(defaultValue = "0") int offset) {
        return service.summary(sessions.current(), offset);
    }

    @GetMapping("/actions")
    Object actions() {
        return service.actions(sessions.current());
    }
}