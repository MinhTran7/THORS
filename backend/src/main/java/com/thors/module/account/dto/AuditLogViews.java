package com.thors.module.account.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class AuditLogViews {
    /**
     * Bộ lọc khi xem log. Trường nào null thì không lọc theo trường đó.
     *
     * @param q tìm theo tên người thực hiện, tên tài khoản bị tác động, loại hành động hoặc địa chỉ IP
     * @param status SUCCESS, WARNING hoặc FAILED
     * @param offset múi giờ của người xem, tính bằng phút lệch về phía đông UTC (VN = 420); dùng để
     *     xác định ranh giới ngày của from/to
     */
    public record Filter(
            String action,
            Integer actorId,
            Long targetId,
            LocalDate from,
            LocalDate to,
            String q,
            String status,
            int offset) {}

    public record Item(
            long id,
            Integer actorId,
            String actorName,
            String actorType,
            String action,
            String status,
            String entity,
            Long entityId,
            String targetName,
            String targetRole,
            String ip,
            String oldValue,
            String newValue,
            LocalDateTime performedAt) {}

    public record Page(List<Item> items, int page, int size, long total, int totalPages) {}

    /** Số liệu trong ngày cho các thẻ thống kê của màn hình System Log. */
    public record Summary(
            long eventsToday,
            long successfulToday,
            long securityAlertsToday,
            long failedSignInsToday,
            long locksToday) {}
}