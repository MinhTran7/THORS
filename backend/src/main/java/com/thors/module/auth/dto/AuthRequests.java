package com.thors.module.auth.dto;

import jakarta.validation.constraints.*;

public final class AuthRequests {
  private AuthRequests() {}

  public record Register(
          @NotBlank(message = "Nhập họ tên.") String fullName,
          @NotBlank(message = "Nhập email hoặc số điện thoại.") String identifier,
          @NotBlank(message = "Nhập mật khẩu.") String password,
          @NotBlank(message = "Xác nhận mật khẩu.") String confirmPassword) {}

  // Dữ liệu gửi lên khi đăng nhập: POST /api/auth/login { identifier, password }.
  // identifier là email. @NotBlank: trống thì ApiErrors.validation trả 400 với câu lỗi ghi ở đây.
  public record Login(
          @NotBlank(message = "Nhập email hoặc số điện thoại.") String identifier,
          @NotBlank(message = "Nhập mật khẩu.") String password) {}

  public record Activation(
          @NotBlank String identifier, @NotBlank String password) {}

  public record Forgot(@NotBlank String identifier) {}

  public record Code(
          @Pattern(regexp = "[0-9]{6}", message = "OTP gồm 6 chữ số.") @NotNull String code) {}

  public record Reset(@NotBlank String password, @NotBlank String confirmPassword) {}

  public record Channel(@NotBlank String channel) {}

  public record ChangePassword(
          @NotBlank String currentPassword,
          @NotBlank String password,
          @NotBlank String confirmPassword) {}
}
