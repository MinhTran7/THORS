package com.thors.module.notification.controller;

import com.thors.module.notification.service.NotificationService;
import com.thors.security.SessionAccess;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {
    private final NotificationService service;
    private final SessionAccess sessions;

    public NotificationController(NotificationService service, SessionAccess sessions) {
        this.service = service;
        this.sessions = sessions;
    }

    /** GET /api/notifications?unreadOnly=false&page=0&size=10 */
    @GetMapping
    Object list(
            @RequestParam(defaultValue = "false") boolean unreadOnly,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return service.list(sessions.current(), unreadOnly, page, size);
    }

    @GetMapping("/unread-count")
    Object unreadCount() {
        return Map.of("count", service.unreadCount(sessions.current()));
    }

    @PatchMapping("/{id}/read")
    Object markRead(@PathVariable int id) {
        service.markRead(sessions.current(), id);
        return Map.of("message", "Đã đánh dấu đã đọc.");
    }

    @PostMapping("/read-all")
    Object markAllRead() {
        return Map.of("updated", service.markAllRead(sessions.current()));
    }
}