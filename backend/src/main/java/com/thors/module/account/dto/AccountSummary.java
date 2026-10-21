package com.thors.module.account.dto;

import java.util.Map;

/** Số lượng tài khoản trong phạm vi quản lý của người gọi, theo trạng thái và vai trò. */
public record AccountSummary(long total, Map<String, Long> byStatus, Map<String, Long> byRole) {}