package com.thors.module.notification.service;

import com.thors.module.notification.repository.NotificationMuteSchema;
import com.thors.module.notification.repository.NotificationRepository;
import java.util.Collection;
import java.util.HashSet;
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
 *
 * <p>Loại thông báo trong {@link NotificationTypes#MUTABLE} (khuyến mãi) không gửi cho người đã tắt.
 */
@Service
public class NotificationPublisher {
    private static final Logger log = LoggerFactory.getLogger(NotificationPublisher.class);

    private final NotificationRepository repository;
    private final NotificationMuteSchema muteSchema;

    public NotificationPublisher(NotificationRepository repository, NotificationMuteSchema muteSchema) {
        this.repository = repository;
        this.muteSchema = muteSchema;
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
            Collection<Integer> targets = userIds;
            if (skipMuted(type)) {
                var muted = repository.mutedAmong(type, userIds);
                if (!muted.isEmpty()) {
                    var left = new HashSet<>(userIds);
                    muted.forEach(left::remove);
                    targets = left;
                }
            }
            if (targets.isEmpty()) return;
            int id = repository.insert(type, title, message, entityType, entityId);
            repository.linkUsers(id, targets);
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
            repository.linkRole(id, roleName, skipMuted(type) ? type : null);
        } catch (RuntimeException e) {
            log.warn("Could not publish notification {}: {}", type, e.getClass().getSimpleName());
        }
    }

    /** Chỉ lọc người đã tắt khi loại này được phép tắt và DB đã có bảng notification_mute. */
    private boolean skipMuted(String type) {
        return NotificationTypes.MUTABLE.contains(type) && muteSchema.ready();
    }
}
