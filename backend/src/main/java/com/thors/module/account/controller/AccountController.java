package com.thors.module.account.controller;

import com.thors.module.account.dto.AccountRequests.*;
import com.thors.module.account.mapper.AccountMapper;
import com.thors.module.account.service.AccountService;
import com.thors.security.SessionAccess;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/accounts")
public class AccountController {
  private final AccountService service;
  private final SessionAccess sessions;

  public AccountController(AccountService service, SessionAccess sessions) {
    this.service = service;
    this.sessions = sessions;
  }

  @GetMapping
  Object list() {
    return service.list(sessions.current()).stream().map(AccountMapper::view).toList();
  }

  @PostMapping
  Object create(@Valid @RequestBody Create r) {
    return AccountMapper.view(service.create(sessions.current(), r));
  }

  @PatchMapping("/{id}")
  Object edit(@PathVariable int id, @Valid @RequestBody Edit r) {
    return AccountMapper.view(service.edit(sessions.current(), id, r));
  }

  @PostMapping("/{id}/reset-password")
  Object reset(@PathVariable int id, @Valid @RequestBody Password r) {
    service.resetByManager(sessions.current(), id, r);
    return Map.of(
        "message", "Đã đặt mật khẩu ban đầu mới. Người dùng cần xác minh OTP khi đăng nhập.");
  }

  @PatchMapping("/profile")
  Object profile(@Valid @RequestBody Edit r) {
    return AccountMapper.view(service.profile(sessions.current(), r));
  }

  @PostMapping("/profile/phone")
  Object phone(@Valid @RequestBody Phone r) {
    return AccountMapper.view(service.phone(sessions.current(), r.phone()));
  }
}
