package com.thors.module.notification.service;

import com.thors.module.notification.repository.NotificationRepository;
import java.util.Collection;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Nơi duy nhất để tạo thông báo. Các module khác (account, auth, order, promotion...) inject class
 * này và gọi, không tự insert vào bảng notification.
 *
 * <p>Gửi thông báo là việc phụ: nếu lỗi thì chỉ ghi log, không làm hỏng thao tác chính (đổi mật
 * khẩu, đổi trạng thái đơn...). Khi được gọi trong một @Transactional thì thông báo được lưu cùng
 * transaction, nên thao tác chính bị rollback thì thông báo cũng không còn.
 */
@Service
public class NotificationPublisher {
    private static final Logger log = LoggerFactory.getLogger(NotificationPublisher.class);

    private final NotificationRepository repository;

    public NotificationPublisher(NotificationRepository repository) {
        this.repository = repository;
    }

    /** Gửi cho một người, không gắn với thực thể nào. */
    public void toUser(int userId, String type, String title, String message) {
        toUsers(List.of(userId), type, title, message, null, null);
    }

    /** Gửi cho một người, bấm vào thông báo sẽ mở thực thể liên quan (ví dụ ORDER + orderId). */
    public void toUser(
            int userId,
            String type,
            String title,
            String message,
            String entityType,
            Integer entityId) {
        toUsers(List.of(userId), type, title, message, entityType, entityId);
    }

    public void toUsers(
            Collection<Integer> userIds,
            String type,
            String title,
            String message,
            String entityType,
            Integer entityId) {
        if (userIds == null || userIds.isEmpty()) return;
        try {
            int id = repository.insert(type, title, message, entityType, entityId);
            repository.linkUsers(id, userIds);
        } catch (RuntimeException e) {
            log.warn("Could not publish notification {}: {}", type, e.getClass().getSimpleName());
        }
    }

    /**
     * Gửi cho mọi tài khoản ACTIVE của một vai trò: "ADMIN" khi Owner xin đặt lại mật khẩu,
     * "CUSTOMER" khi có chương trình khuyến mãi hoặc mã giảm giá mới.
     */
    public void toRole(
            String roleName, String type, String title, String message, String entityType, Integer entityId) {
        try {
            int id = repository.insert(type, title, message, entityType, entityId);
            repository.linkRole(id, roleName);
        } catch (RuntimeException e) {
            log.warn("Could not publish notification {}: {}", type, e.getClass().getSimpleName());
        }
    }
}