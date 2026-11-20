package com.thors.module.fitting.controller;

import com.thors.module.fitting.dto.BodyProfileRequest;
import com.thors.module.fitting.dto.BodyProfileResponse;
import com.thors.module.fitting.service.BodyProfileService;
import com.thors.security.SessionAccess;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Số đo cơ thể của khách đang đăng nhập ("me": không truyền id nên không xem được hồ sơ người khác).
 * Cần đăng nhập: SecurityConfig đã chặn mọi /api/** không nằm trong danh sách công khai.
 */
@RestController
@RequestMapping("/api/body-profile/me")
public class BodyProfileController {

    private final BodyProfileService service;
    private final SessionAccess sessions;

    public BodyProfileController(BodyProfileService service, SessionAccess sessions) {
        this.service = service;
        this.sessions = sessions;
    }

    /** 200 + số đo, hoặc 204 (không có nội dung) khi khách chưa lưu số đo. */
    @GetMapping
    public ResponseEntity<BodyProfileResponse> get() {
        return service.get(sessions.current())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping
    public BodyProfileResponse save(@RequestBody BodyProfileRequest request) {
        return service.save(sessions.current(), request);
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete() {
        service.delete(sessions.current());
    }
}
