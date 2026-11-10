package com.thors.module.dashboard;

import com.thors.security.SessionAccess;
import java.time.LocalDate;
import java.util.Map;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Bảng điều khiển: Owner xem toàn cửa hàng, Family Member xem doanh số của chính mình. */
@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final DashboardService dashboard;
    private final SessionAccess sessions;

    public DashboardController(DashboardService dashboard, SessionAccess sessions) {
        this.dashboard = dashboard;
        this.sessions = sessions;
    }

    /** Khoảng ngày tính theo ngày đặt đơn, gồm cả hai đầu; mặc định 7 ngày gần nhất. */
    @GetMapping("/summary")
    public Map<String, Object> summary(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return dashboard.summary(sessions.current(), from, to);
    }
}
