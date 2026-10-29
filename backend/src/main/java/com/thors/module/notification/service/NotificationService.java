package com.thors.module.notification.service;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.notification.dto.NotificationViews.Page;
import com.thors.module.notification.repository.NotificationRepository;
import org.springframework.stereotype.Service;

@Service
public class NotificationService {
    private static final int MAX_SIZE = 50;

    private final NotificationRepository repository;

    public NotificationService(NotificationRepository repository) {
        this.repository = repository;
    }

    /** View Notification: mọi người dùng đã đăng nhập chỉ xem thông báo của chính mình. */
    public Page list(Account actor, boolean unreadOnly, int page, int size) {
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), MAX_SIZE);

        var slice = repository.findByUser(actor.id(), unreadOnly, safePage, safeSize);
        int totalPages = (int) Math.ceil(slice.total() / (double) safeSize);

        return new Page(slice.items(), safePage, safeSize, slice.total(), totalPages);
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