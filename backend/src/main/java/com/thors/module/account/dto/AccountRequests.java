package com.thors.module.account.dto;

import jakarta.validation.constraints.*;

public class AccountRequests {
  public record Create(
          @NotBlank String role,
          @NotBlank String fullName,
          @NotBlank @Email String email,
          String phone,
          @NotBlank String password,
          @NotBlank String confirmPassword) {}

  public record Edit(@NotBlank String fullName, String status) {}

  /**
   * fullName bắt buộc; các trường còn lại null = giữ nguyên, address rỗng = xóa. Ảnh đại diện không đổi
   * qua đây mà qua PUT/DELETE /api/accounts/profile/avatar (backend tự tải ảnh lên và ghi link).
   */
  public record UpdateProfile(
          @NotBlank @Size(max = 100) String fullName,
          @Size(max = 15) String phone,
          @Size(max = 255) String address) {}

  /**
   * Số đo và kiểu mặc để gợi ý size; null = xóa giá trị đó. Phạm vi khớp CHECK trong migration
   * 2026-11-08. footLengthCm lưu thành mm (làm tròn 1 chữ số thập phân).
   */
  public record BodyMeasurements(
          @Min(value = 100, message = "Chiều cao phải từ 100 đến 220 cm.")
          @Max(value = 220, message = "Chiều cao phải từ 100 đến 220 cm.")
          Integer heightCm,
          @Min(value = 30, message = "Cân nặng phải từ 30 đến 150 kg.")
          @Max(value = 150, message = "Cân nặng phải từ 30 đến 150 kg.")
          Integer weightKg,
          @DecimalMin(value = "15", message = "Chiều dài bàn chân phải từ 15 đến 32 cm.")
          @DecimalMax(value = "32", message = "Chiều dài bàn chân phải từ 15 đến 32 cm.")
          Double footLengthCm,
          @Pattern(regexp = "SNUG|REGULAR|LOOSE", message = "Kiểu mặc không hợp lệ.")
          String fitPreference) {}

  public record StatusChange(@NotBlank String status) {}

  public record Password(@NotBlank String password, @NotBlank String confirmPassword) {}

  public record Phone(@NotBlank String phone) {}

  /** Chủ cửa hàng quên mật khẩu gửi yêu cầu để Admin đặt lại. */
  public record PasswordResetRequest(@NotBlank String identifier) {}
}