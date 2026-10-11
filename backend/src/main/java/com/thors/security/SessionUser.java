package com.thors.security;

import com.thors.module.account.entity.Account;
import java.io.Serializable;

public record SessionUser(int userId, long authVersion, String passwordHash, String role) implements Serializable {
  public static SessionUser from(Account a) {
    return new SessionUser(a.id(), a.authVersion(), a.passwordHash(), a.role());
  }
}
