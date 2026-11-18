package com.thors.module.account;

import static org.junit.jupiter.api.Assertions.*;

import com.thors.module.account.dto.AccountView;
import com.thors.module.account.entity.Account;
import com.thors.module.account.mapper.AccountMapper;
import java.time.LocalDateTime;
import java.util.Arrays;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Unit test cho AccountMapper theo sheet "Account" (UTC-ACC-081..082). */
@DisplayName("AccountMapper.view(Account a)")
class AccountMapperUnitTest {
  private static final LocalDateTime VERIFIED = LocalDateTime.of(2026, 11, 1, 0, 0);

  @Test
  @DisplayName("UTC-ACC-081: đã xác minh email, liên kết Google, có mật khẩu và avatar")
  void acc081() {
    var a = new Account(10, "FAMILY_MEMBER", "Le Thi Gia Dinh", "$2a$10$hash", "family@shop.com", "0901112233",
            "123 Le Loi", "https://res.cloudinary.com/x.png", "ACTIVE", VERIFIED, VERIFIED, "g-sub", 0, 2);

    AccountView v = AccountMapper.view(a);

    assertEquals(10, v.id());
    assertEquals("FAMILY_MEMBER", v.role());
    assertEquals("Le Thi Gia Dinh", v.fullName());
    assertEquals("family@shop.com", v.email());
    assertEquals("0901112233", v.phone());
    assertEquals("ACTIVE", v.status());
    assertTrue(v.emailVerified());
    assertFalse(v.phoneVerified());
    assertTrue(v.googleLinked());
    assertTrue(v.passwordEnabled());
    assertEquals("https://res.cloudinary.com/x.png", v.avatarUrl());
    assertTrue(Arrays.stream(AccountView.class.getRecordComponents())
            .noneMatch(c -> c.getName().toLowerCase().contains("password") && c.getType() == String.class),
            "AccountView không được chứa passwordHash");
  }

  @Test
  @DisplayName("UTC-ACC-082: chưa xác minh email, chưa liên kết Google, không có mật khẩu")
  void acc082() {
    var a = new Account(15, "CUSTOMER", "Google User", "!GOOGLE_AUTH", "g@gmail.com", null, null, null,
            "ACTIVE", VERIFIED, null, null, 0, null);

    AccountView v = AccountMapper.view(a);

    assertEquals(15, v.id());
    assertFalse(v.emailVerified());
    assertFalse(v.phoneVerified());
    assertFalse(v.googleLinked());
    assertFalse(v.passwordEnabled());
  }
}
