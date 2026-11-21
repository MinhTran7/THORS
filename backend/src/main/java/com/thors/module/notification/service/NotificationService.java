package com.thors.module.notification.service;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.notification.dto.NotificationViews.Item;
import com.thors.module.notification.dto.NotificationViews.Page;
import com.thors.module.notification.dto.NotificationViews.Preferences;
import com.thors.module.notification.dto.NotificationViews.UpdatePreferences;
import com.thors.module.notification.repository.NotificationMuteSchema;
import com.thors.module.notification.repository.NotificationRepository;
import org.springframework.stereotype.Service;

@Service
public class NotificationService {
    private static final int MAX_SIZE = 50;

    private final NotificationRepository repository;
    private final NotificationMuteSchema muteSchema;

    public NotificationService(NotificationRepository repository, NotificationMuteSchema muteSchema) {
        this.repository = repository;
        this.muteSchema = muteSchema;
    }

    /** Cài đặt nhận thông báo của chính mình. Chưa tắt gì thì mặc định nhận hết. */
    public Preferences preferences(Account actor) {
        if (!muteSchema.ready()) return new Preferences(false, true);
        return new Preferences(true, !repository.isMuted(actor.id(), NotificationTypes.PROMOTION));
    }

    /** Bật / tắt nhận thông báo khuyến mãi. Chỉ ảnh hưởng thông báo gửi sau thời điểm này. */
    public Preferences updatePreferences(Account actor, UpdatePreferences request) {
        if (!muteSchema.ready())
            throw new ApiException(
                    503,
                    "NOTIFICATION_PREFERENCES_UNAVAILABLE",
                    "Chức năng bật/tắt thông báo chưa sẵn sàng (database chưa cập nhật).");
        if (request == null || request.promotion() == null)
            throw new ApiException(400, "NOTIFICATION_PREFERENCES", "Vui lòng chọn bật hoặc tắt thông báo khuyến mãi.");
        repository.setMuted(actor.id(), NotificationTypes.PROMOTION, !request.promotion());
        return preferences(actor);
    }

    /** View Notification: mọi người dùng đã đăng nhập chỉ xem thông báo của chính mình. */
    public Page list(Account actor, boolean unreadOnly, int page, int size) {
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), MAX_SIZE);

        var slice = repository.findByUser(actor.id(), unreadOnly, safePage, safeSize);
        int totalPages = (int) Math.ceil(slice.total() / (double) safeSize);

        return new Page(slice.items(), safePage, safeSize, slice.total(), totalPages);
    }

    /** Xem chi tiết một thông báo của chính mình; thông báo của người khác coi như không tồn tại. */
    public Item detail(Account actor, int userNotificationId) {
        return repository
                .findOne(actor.id(), userNotificationId)
                .orElseThrow(() -> new ApiException(404, "NOTIFICATION_NOT_FOUND", "Không tìm thấy thông báo."));
    }

    public long unreadCount(Account actor) {
        return repository.countUnread(actor.id());
    }

    public void markRead(Account actor, int userNotificationId) {
        if (!repository.exists(actor.id(), userNotificationId)) {
            throw new ApiException(404, "NOTIFICATION_NOT_FOUND", "Không tìm thấy thông báo.");
        }
        repository.markRead(actor.id(), userNotificationId);
    }

    public int markAllRead(Account actor) {
        return repository.markAllRead(actor.id());
    }
}