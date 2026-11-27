package com.thors.common;

import java.util.Locale;

public final class ContactNormalizer {
  private ContactNormalizer() {}

  // Kiểm tra + chuẩn hóa email (kiểm tra dữ liệu nhập lần 2 ở backend, sau Yup ở frontend):
  // phải có dạng xxx@yyy.zzz, bỏ khoảng trắng đầu/cuối, đổi chữ thường, tối đa 100 ký tự. Sai → 400 EMAIL.
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

  public static final String PHONE_RULE = "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.";

  /**
   * Số điện thoại người dùng nhập vào tài khoản: đúng 10 chữ số, bắt đầu bằng 0 (cho phép khoảng trắng,
   * dấu chấm, gạch ngang khi gõ). Trả về dạng 0xxxxxxxxx để lưu; trống = null. Việc so trùng / đăng nhập
   * vẫn dùng {@link #phone} để nhận cả số cũ đã lưu dạng +84.
   */
  public static String phoneInput(String value) {
    if (value == null || value.isBlank()) return null;
    String p = value.trim().replaceAll("[ .\\-]", "");
    if (!p.matches("0\\d{9}")) throw new ApiException(400, "PHONE", PHONE_RULE);
    return p;
  }

  public static String channel(String value) {
    return identifier(value).contains("@") ? "EMAIL" : "SMS";
  }

  public static String phone(String value) {
    if (value == null || value.isBlank()) return null;
    String p = value.trim().replaceAll("[ \u002d()]", "");
    if (p.startsWith("0")) p = "+84" + p.substring(1);
    if (p.startsWith("84")) p = "+" + p;
    // Số VN đủ 10 chữ số: 0 + 9 số, hoặc +84 thay cho số 0 (+84 + 9 số)
    if (!p.matches("\\+84[0-9]{9}"))
      throw new ApiException(
              400, "PHONE", "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.");
    return p;
  }

  public static String identifier(String value) {
    if (value == null || value.isBlank())
      throw new ApiException(400, "IDENTIFIER", "Nhập email hoặc số điện thoại.");
    return value.contains("@") ? email(value) : phone(value);
  }

  public static void password(String p) {
    if (p == null || p.length() < 6 || p.length() > 64)
      throw new ApiException(400, "PASSWORD", "Mật khẩu cần từ 6 đến 64 ký tự.");
    // BCrypt chỉ dùng 72 byte đầu; chữ có dấu chiếm 2–3 byte nên mật khẩu nhiều chữ có dấu sẽ vượt giới hạn.
    if (p.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72)
      throw new ApiException(400, "PASSWORD",
              "Mật khẩu có nhiều chữ có dấu nên bị quá dài. Hãy bớt chữ có dấu hoặc rút ngắn mật khẩu.");
  }

  public static String name(String n) {
    if (n == null || n.isBlank() || n.trim().length() > 100)
      throw new ApiException(400, "NAME", "Họ tên cần 1–100 ký tự.");
    return n.trim();
  }
}
