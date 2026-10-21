package com.thors.module.account.entity;

import java.time.LocalDateTime;

/** Một dòng của bảng user (kèm role_name và vài giá trị tính từ audit_log). */
public record Account(
        int id,
        String role,
        String fullName,
        String passwordHash,
        String email,
        String phone,
        String address,
        String avatarUrl,
        String status,
        LocalDateTime createdAt,
        LocalDateTime emailVerifiedAt,
        String googleSubject,
        long authVersion,
        Integer createdBy) {
  public boolean active() {
    return "ACTIVE".equals(status);
  }

  public boolean pending() {
    return "PENDING_VERIFICATION".equals(status);
  }

  /**
   * Bảng user không còn lưu mốc xác minh email/SĐT. Tài khoản đã qua bước xác minh ban đầu (không
   * còn PENDING_VERIFICATION) được coi là đã xác minh; kênh SMS còn cần có số điện thoại.
   */
  public boolean verified(String channel) {
    return "EMAIL".equals(channel) && emailVerifiedAt != null;
  }
}