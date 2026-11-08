package com.thors.module.account.controller;

import com.thors.module.account.dto.AccountRequests.*;
import com.thors.module.account.mapper.AccountMapper;
import com.thors.module.account.service.AccountService;
import com.thors.module.account.service.AuditLogService;
import com.thors.module.account.service.AvatarImageService;
import com.thors.module.sizeadvice.SizeAdviceSchema;
import com.thors.security.SessionAccess;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/accounts")
public class AccountController {
  private final AccountService service;
  private final AuditLogService audits;
  private final AvatarImageService avatars;
  private final SessionAccess sessions;
  private final SizeAdviceSchema sizeAdviceSchema;

  public AccountController(
      AccountService service,
      AuditLogService audits,
      AvatarImageService avatars,
      SessionAccess sessions,
      SizeAdviceSchema sizeAdviceSchema) {
    this.service = service;
    this.audits = audits;
    this.avatars = avatars;
    this.sessions = sessions;
    this.sizeAdviceSchema = sizeAdviceSchema;
  }

  // ----- Profile (mọi người dùng đã đăng nhập) -----

  @GetMapping("/profile")
  Object profile() {
    return service.profile(sessions.current());
  }

  @PatchMapping("/profile")
  Object updateProfile(@Valid @RequestBody UpdateProfile r) {
    return service.updateProfile(sessions.current(), r);
  }

  /**
   * PUT /api/accounts/profile/avatar (multipart, field "file"): gọi khi người dùng bấm Lưu. Đẩy ảnh lên
   * Cloudinary, đặt làm avatar, xóa ảnh cũ; trả về hồ sơ mới.
   */
  @PutMapping(value = "/profile/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  Object replaceAvatar(@RequestPart("file") MultipartFile file) {
    return avatars.replace(sessions.current(), file);
  }

  /** DELETE /api/accounts/profile/avatar: gỡ avatar và xóa ảnh trên Cloudinary; trả về hồ sơ mới. */
  @DeleteMapping("/profile/avatar")
  Object removeAvatar() {
    return avatars.remove(sessions.current());
  }

  @PostMapping("/profile/phone")
  Object phone(@Valid @RequestBody Phone r) {
    return AccountMapper.view(service.phone(sessions.current(), r.phone()));
  }

  /** Chiều cao (cm) / cân nặng (kg) để gợi ý size; trả về { heightCm, weightKg } (null nếu chưa nhập). */
  // Trả 503 SIZE_ADVICE_UNAVAILABLE (thay vì lỗi SQL) khi database chưa chạy migration gợi ý size.
  @GetMapping("/profile/body-measurements")
  Object bodyMeasurements() {
    sizeAdviceSchema.require();
    return service.bodyMeasurements(sessions.current());
  }

  @PutMapping("/profile/body-measurements")
  Object updateBodyMeasurements(@Valid @RequestBody BodyMeasurements r) {
    sizeAdviceSchema.require();
    return service.updateBodyMeasurements(sessions.current(), r);
  }

  /** Lần đăng nhập gần nhất và các hoạt động gần đây của chính người đang đăng nhập. */
  @GetMapping("/profile/activity")
  Object activity(@RequestParam(defaultValue = "8") int limit) {
    return audits.mine(sessions.current(), limit);
  }

  // ----- Owner / Admin -----

  /** GET /api/accounts?q=&role=&status=&page=0&size=20 */
  @GetMapping
  Object list(
          @RequestParam(required = false) String q,
          @RequestParam(required = false) String role,
          @RequestParam(required = false) String status,
          @RequestParam(defaultValue = "0") int page,
          @RequestParam(defaultValue = "20") int size) {
    return service.list(sessions.current(), q, role, status, page, size);
  }

  @GetMapping("/summary")
  Object summary() {
    return service.summary(sessions.current());
  }

  /** Admin: các yêu cầu đặt lại mật khẩu của Shop Owner chưa xử lý. */
  @GetMapping("/password-reset-requests")
  Object resetRequests() {
    return service.resetRequests(sessions.current());
  }

  @GetMapping("/{id}")
  Object detail(@PathVariable int id) {
    return service.detail(sessions.current(), id);
  }

  @PostMapping
  Object create(@Valid @RequestBody Create r) {
    return AccountMapper.view(service.create(sessions.current(), r));
  }

  @PatchMapping("/{id}")
  Object edit(@PathVariable int id, @Valid @RequestBody Edit r) {
    return AccountMapper.view(service.edit(sessions.current(), id, r));
  }

  @PatchMapping("/{id}/status")
  Object status(@PathVariable int id, @Valid @RequestBody StatusChange r) {
    return AccountMapper.view(service.changeStatus(sessions.current(), id, r.status()));
  }

  @PostMapping("/{id}/lock")
  Object lock(@PathVariable int id) {
    return AccountMapper.view(service.lock(sessions.current(), id));
  }

  @PostMapping("/{id}/unlock")
  Object unlock(@PathVariable int id) {
    return AccountMapper.view(service.unlock(sessions.current(), id));
  }

  @PostMapping("/{id}/reset-password")
  Object reset(@PathVariable int id, @Valid @RequestBody Password r) {
    service.resetByManager(sessions.current(), id, r);
    return Map.of("message", "Đã đặt lại mật khẩu. Người dùng cần đăng nhập lại bằng mật khẩu mới.");
  }
}