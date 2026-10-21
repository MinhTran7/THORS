package com.thors.module.account.controller;

import com.thors.module.account.dto.AccountRequests.PasswordResetRequest;
import com.thors.module.account.service.AccountService;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

/** Endpoint công khai: Shop Owner quên mật khẩu gửi yêu cầu để Admin đặt lại. */
@RestController
@RequestMapping("/api/auth")
public class PasswordResetRequestController {
    private final AccountService service;

    public PasswordResetRequestController(AccountService service) {
        this.service = service;
    }

    @PostMapping("/password-reset-requests")
    Object request(@Valid @RequestBody PasswordResetRequest r) {
        service.requestOwnerReset(r.identifier());
        return Map.of(
                "message",
                "Nếu tài khoản chủ cửa hàng tồn tại, yêu cầu đặt lại mật khẩu đã được gửi tới quản trị viên.");
    }
}