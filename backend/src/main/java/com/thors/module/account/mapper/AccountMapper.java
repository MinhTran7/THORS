package com.thors.module.account.mapper;

import com.thors.module.account.dto.AccountView;
import com.thors.module.account.entity.Account;

public final class AccountMapper {
  private AccountMapper() {}

  public static AccountView view(Account a) {
    return new AccountView(
            a.id(),
            a.role(),
            a.fullName(),
            a.email(),
            a.phone(),
            a.status(),
            a.verified("EMAIL"),
            a.verified("SMS"),
            a.googleSubject() != null,
            !a.passwordHash().startsWith("!"),
            a.avatarUrl());
  }
}