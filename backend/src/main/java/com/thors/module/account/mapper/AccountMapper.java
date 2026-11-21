package com.thors.module.account.mapper;

import com.thors.module.account.dto.AccountView;
import com.thors.module.account.entity.Account;

public final class AccountMapper {
  private AccountMapper() {}

  // Đổi Account thành dữ liệu gửi cho frontend; chỉ gồm các trường được phép lộ ra (không có password_hash)
  public static AccountView view(Account a) {
    return view(a, false);
  }

  public static AccountView view(Account a, boolean passwordChangeRequired) {
    return new AccountView(
            a.id(),
            a.role(),
            a.fullName(),
            a.email(),
            a.phone(),
            a.status(),
            a.emailVerifiedAt() != null,
            false, // SMS verification is no longer supported; preserve API shape.
            a.googleSubject() != null,
            !a.passwordHash().startsWith("!"),
            a.avatarUrl(),
            passwordChangeRequired);
  }
}