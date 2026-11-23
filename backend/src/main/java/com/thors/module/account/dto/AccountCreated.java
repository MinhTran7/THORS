package com.thors.module.account.dto;

import com.fasterxml.jackson.annotation.JsonUnwrapped;

/**
 * Kết quả POST /api/accounts: các trường của {@link AccountView} (giữ nguyên dạng JSON cũ) cộng thêm
 * {@code mailSent} cho biết đã gửi được email thông tin đăng nhập tới người dùng mới hay chưa.
 */
public record AccountCreated(@JsonUnwrapped AccountView account, boolean mailSent) {}
