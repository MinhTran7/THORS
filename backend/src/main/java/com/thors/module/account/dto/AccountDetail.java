package com.thors.module.account.dto;

import java.time.LocalDateTime;

/** Thông tin đầy đủ của một tài khoản (View Profile, View Staff Details). */
public record AccountDetail(
        int id,
        String role,
        String fullName,
        String email,
        String phone,
        String address,
        String avatarUrl,
        String status,
        boolean googleLinked,
        boolean passwordEnabled,
        LocalDateTime createdAt,
        Integer createdById,
        String createdByName) {}