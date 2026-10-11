package com.thors.module.account.entity;

import java.time.LocalDateTime;

public record Account(
    int id,
    String role,
    String fullName,
    String username,
    String passwordHash,
    String email,
    String phone,
    String status,
    LocalDateTime emailVerifiedAt,
    LocalDateTime phoneVerifiedAt,
    String googleSubject,
    long authVersion,
    Integer createdBy) {
  public boolean active() {
    return "ACTIVE".equals(status);
  }

  public boolean pending() {
    return "PENDING_VERIFICATION".equals(status);
  }

  public boolean verified(String channel) {
    return "EMAIL".equals(channel) ? emailVerifiedAt != null : phoneVerifiedAt != null;
  }
}
