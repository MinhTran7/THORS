package com.thors.common;

import java.util.Locale;

public final class ContactNormalizer {
  private ContactNormalizer() {}

  public static String email(String value) {
    if (value == null || !value.trim().matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))
      throw new ApiException(400, "EMAIL", "Email không hợp lệ.");
    String e = value.trim().toLowerCase(Locale.ROOT);
    if (e.length() > 100) throw new ApiException(400, "EMAIL", "Email quá dài.");
    return e;
  }

  public static String optionalEmail(String value) {
    return value == null || value.isBlank() ? null : email(value);
  }

  /** Keep the entered number; canonicalization is only for matching and delivery. */
  public static String phoneInput(String value) {
    if (value == null || value.isBlank()) return null;
    phone(value);
    String entered = value.trim();
    if (entered.length() > 15)
      throw new ApiException(400, "PHONE", "Số điện thoại tối đa 15 ký tự.");
    return entered;
  }

  public static String channel(String value) {
    return identifier(value).contains("@") ? "EMAIL" : "SMS";
  }

  public static String phone(String value) {
    if (value == null || value.isBlank()) return null;
    String p = value.trim().replaceAll("[ \u002d()]", "");
    if (p.startsWith("0")) p = "+84" + p.substring(1);
    if (p.startsWith("84")) p = "+" + p;
    if (p.length() > 15 || !p.matches("\\+[1-9][0-9]{7,14}"))
      throw new ApiException(
              400, "PHONE", "Số điện thoại không hợp lệ. Ví dụ: 0912345678 hoặc +84912345678.");
    return p;
  }

  public static String identifier(String value) {
    if (value == null || value.isBlank())
      throw new ApiException(400, "IDENTIFIER", "Nhập email hoặc số điện thoại.");
    return value.contains("@") ? email(value) : phone(value);
  }

  public static void password(String p) {
    if (p == null
            || p.length() < 10
            || p.length() > 64
            || p.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72)
      throw new ApiException(400, "PASSWORD", "Mật khẩu cần 10–64 ký tự và tối đa 72 byte.");
  }

  public static String name(String n) {
    if (n == null || n.isBlank() || n.trim().length() > 100)
      throw new ApiException(400, "NAME", "Họ tên cần 1–100 ký tự.");
    return n.trim();
  }
}
