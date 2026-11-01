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
            long failedToday,
            long failedSignInsToday,
            long pausedSignInsToday) {}

    /**
     * Một dòng hoạt động hiển thị cho chính chủ tài khoản ở trang hồ sơ. Cố ý không có tên người
     * thực hiện, old/new value: chủ tài khoản chỉ cần biết chuyện gì xảy ra, khi nào, từ IP nào và
     * có phải người quản lý làm hay không.
     *
     * @param byManager true khi người thực hiện là tài khoản khác (Admin/Owner)
     */
    public record Activity(
            long id,
            String action,
            String status,
            boolean byManager,
            String ip,
            LocalDateTime performedAt) {}

    /** Dữ liệu cho phần Bảo mật và Hoạt động gần đây ở trang hồ sơ. */
    public record ProfileActivity(Activity lastLogin, List<Activity> items) {}
}