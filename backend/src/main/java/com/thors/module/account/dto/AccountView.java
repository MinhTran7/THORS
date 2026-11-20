package com.thors.module.account.dto;

public record AccountView(
        int id,
        String role,
        String fullName,
        String email,
        String phone,
        String status,
        boolean emailVerified,
        boolean phoneVerified,
        boolean googleLinked,
        boolean passwordEnabled,
        String avatarUrl,
        /** true: phải đổi mật khẩu trước khi dùng hệ thống (tài khoản do Admin / Owner tạo). */
        boolean passwordChangeRequired) {}