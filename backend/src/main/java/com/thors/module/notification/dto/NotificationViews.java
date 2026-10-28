package com.thors.module.notification.dto;

import java.time.LocalDateTime;
import java.util.List;

public class NotificationViews {

    /** Một thông báo của người dùng hiện tại (id = user_notification_id). */
    public record Item(
            int id,
            int notificationId,
            String title,
            String message,
            String type,
            String relatedEntityType,
            Integer relatedEntityId,
            boolean read,
            LocalDateTime readAt,
            LocalDateTime createdAt) {}

    public record Page(List<Item> items, int page, int size, long total, int totalPages) {}
}