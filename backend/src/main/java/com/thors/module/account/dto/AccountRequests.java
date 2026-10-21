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

  public record Password(@NotBlank String password, @NotBlank String confirmPassword) {}

  public record Phone(@NotBlank String phone) {}
}
