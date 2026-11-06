package com.thors.module.account.service;

import com.thors.common.ApiException;
import com.thors.module.account.dto.AuditLogViews.*;
import com.thors.module.account.entity.Account;
import com.thors.module.account.repository.AuditLogRepository;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class AuditLogService {
    private static final int MAX_SIZE = 100;
    private static final int MAX_MINE = 20;
    private final AuditLogRepository logs;

    public AuditLogService(AuditLogRepository logs) {
        this.logs = logs;
    }

    public Page list(Account actor, Filter f, int page, int size) {
        admin(actor);
        if (page < 0) throw new ApiException(400, "PAGE", "Trang không hợp lệ.");
        if (size < 1 || size > MAX_SIZE)
            throw new ApiException(400, "PAGE_SIZE", "Kích thước trang phải từ 1 đến " + MAX_SIZE + ".");
        dateRange(f.from(), f.to());
        String action = blankToNull(f.action());
        String q = blankToNull(f.q());
        String status = blankToNull(f.status());
        if (q != null && q.length() > 100)
            throw new ApiException(400, "QUERY", "Từ khóa tìm kiếm quá dài.");
        if (status != null && !List.of("SUCCESS", "FAILED").contains(status))
            throw new ApiException(400, "STATUS_FILTER", "Trạng thái lọc không hợp lệ.");
        offset(f.offset());
        return logs.search(
                new Filter(action, f.actorId(), f.targetId(), f.from(), f.to(), q, status, f.offset()),
                page,
                size);
    }

    /** Thống kê theo cùng khoảng ngày với danh sách; from/to null là không giới hạn phía đó. */
    public Summary summary(Account actor, LocalDate from, LocalDate to, int offset) {
        admin(actor);
        dateRange(from, to);
        offset(offset);
        return logs.summary(from, to, offset);
    }

    public List<String> actions(Account actor) {
        admin(actor);
        return logs.actions();
    }

    /**
     * Hoạt động gần đây của CHÍNH người đang đăng nhập (mọi vai trò). Luôn lấy theo id của actor,
     * không nhận id từ client nên không thể xem log của người khác.
     */
    public ProfileActivity mine(Account actor, int limit) {
        if (limit < 1 || limit > MAX_MINE)
            throw new ApiException(400, "LIMIT", "Số dòng phải từ 1 đến " + MAX_MINE + ".");
        return new ProfileActivity(logs.lastLogin(actor.id()), logs.recentFor(actor.id(), limit));
    }

    private void admin(Account actor) {
        if (!"ADMIN".equals(actor.role()))
            throw new ApiException(403, "ROLE", "Chỉ quản trị viên được xem nhật ký hệ thống.");
    }

    private static void dateRange(LocalDate from, LocalDate to) {
        if (from != null && to != null && to.isBefore(from))
            throw new ApiException(400, "DATE_RANGE", "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.");
    }

    private static void offset(int minutes) {
        if (minutes < -840 || minutes > 840)
            throw new ApiException(400, "OFFSET", "Múi giờ không hợp lệ.");
    }

    private static String blankToNull(String v) {
        if (v == null) return null;
        var s = v.trim();
        return s.isEmpty() ? null : s;
    }
}