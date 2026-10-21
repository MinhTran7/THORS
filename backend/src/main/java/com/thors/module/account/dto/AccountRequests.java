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

  /** fullName bắt buộc; các trường còn lại null = giữ nguyên, chuỗi rỗng = xóa (address, avatarUrl). */
  public record UpdateProfile(
          @NotBlank @Size(max = 100) String fullName,
          @Size(max = 15) String phone,
          @Size(max = 255) String address,
          @Size(max = 500) String avatarUrl) {}

  public record StatusChange(@NotBlank String status) {}

  public record Password(@NotBlank String password, @NotBlank String confirmPassword) {}

  public record Phone(@NotBlank String phone) {}

  /** Chủ cửa hàng quên mật khẩu gửi yêu cầu để Admin đặt lại. */
  public record PasswordResetRequest(@NotBlank String identifier) {}
}