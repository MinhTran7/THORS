package com.thors.common;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;

/**
 * Unit test cho ContactNormalizer (kiểm tra dữ liệu nhập ở backend) theo sheet "ContactNormalizer"
 * của Report-5.1_Unit Test. Mỗi test mang đúng mã Test Case ID trong sheet.
 * Loại: N = Normal, A = Abnormal, B = Boundary.
 */
@DisplayName("ContactNormalizer Unit Test")
class ContactNormalizerTest {

  private static ApiException fails(Executable call, String code) {
    var e = assertThrows(ApiException.class, call);
    assertEquals(400, e.status);
    assertEquals(code, e.code);
    return e;
  }

  @Nested
  @DisplayName("email(String)")
  class Email {
    @Test
    @DisplayName("UTC001 - N - email hợp lệ được giữ nguyên")
    void utc001() {
      assertEquals("minh@thors.vn", ContactNormalizer.email("minh@thors.vn"));
    }

    @Test
    @DisplayName("UTC002 - N - bỏ khoảng trắng đầu/cuối và đổi chữ thường")
    void utc002() {
      assertEquals("minh@thors.vn", ContactNormalizer.email("  Minh@THORS.vn  "));
    }

    @Test
    @DisplayName("UTC003 - A - email null")
    void utc003() {
      fails(() -> ContactNormalizer.email(null), "EMAIL");
    }

    @Test
    @DisplayName("UTC004 - A - thiếu ký tự @")
    void utc004() {
      fails(() -> ContactNormalizer.email("minh.thors.vn"), "EMAIL");
    }

    @Test
    @DisplayName("UTC005 - A - có khoảng trắng ở giữa")
    void utc005() {
      fails(() -> ContactNormalizer.email("minh tran@thors.vn"), "EMAIL");
    }

    @Test
    @DisplayName("UTC006 - A - thiếu phần tên miền sau dấu chấm")
    void utc006() {
      fails(() -> ContactNormalizer.email("minh@thors"), "EMAIL");
    }

    @Test
    @DisplayName("UTC007 - A - email là chuỗi rỗng")
    void utc007() {
      fails(() -> ContactNormalizer.email(""), "EMAIL");
    }

    @Test
    @DisplayName("UTC008 - A - email có 2 dấu @")
    void utc008() {
      fails(() -> ContactNormalizer.email("minh@@thors.vn"), "EMAIL");
    }

    @Test
    @DisplayName("UTC009 - B - email dài đúng 100 ký tự")
    void utc009() {
      String email = "a".repeat(91) + "@thors.vn"; // 91 + 9 = 100
      assertEquals(100, email.length());
      assertEquals(email, ContactNormalizer.email(email));
    }

    @Test
    @DisplayName("UTC010 - B - email dài 101 ký tự")
    void utc010() {
      String email = "a".repeat(92) + "@thors.vn"; // 101
      var e = fails(() -> ContactNormalizer.email(email), "EMAIL");
      assertEquals("Email quá dài.", e.getMessage());
    }
  }

  @Nested
  @DisplayName("password(String)")
  class Password {
    @Test
    @DisplayName("UTC011 - N - mật khẩu 8 ký tự hợp lệ")
    void utc011() {
      assertDoesNotThrow(() -> ContactNormalizer.password("thors123"));
    }

    @Test
    @DisplayName("UTC012 - A - mật khẩu null")
    void utc012() {
      fails(() -> ContactNormalizer.password(null), "PASSWORD");
    }

    @Test
    @DisplayName("UTC013 - B - mật khẩu 5 ký tự (dưới tối thiểu)")
    void utc013() {
      var e = fails(() -> ContactNormalizer.password("12345"), "PASSWORD");
      assertEquals("Mật khẩu cần từ 6 đến 64 ký tự.", e.getMessage());
    }

    @Test
    @DisplayName("UTC014 - B - mật khẩu đúng 6 ký tự (tối thiểu)")
    void utc014() {
      assertDoesNotThrow(() -> ContactNormalizer.password("123456"));
    }

    @Test
    @DisplayName("UTC015 - B - mật khẩu đúng 64 ký tự (tối đa)")
    void utc015() {
      assertDoesNotThrow(() -> ContactNormalizer.password("a".repeat(64)));
    }

    @Test
    @DisplayName("UTC016 - B - mật khẩu 65 ký tự (vượt tối đa)")
    void utc016() {
      fails(() -> ContactNormalizer.password("a".repeat(65)), "PASSWORD");
    }

    @Test
    @DisplayName("UTC017 - B - 24 ký tự có dấu = đúng 72 byte")
    void utc017() {
      assertDoesNotThrow(() -> ContactNormalizer.password("ệ".repeat(24)));
    }

    @Test
    @DisplayName("UTC018 - B - 25 ký tự có dấu = 75 byte (vượt 72 byte)")
    void utc018() {
      var e = fails(() -> ContactNormalizer.password("ệ".repeat(25)), "PASSWORD");
      assertEquals("Mật khẩu có nhiều chữ có dấu nên bị quá dài. Hãy bớt chữ có dấu hoặc rút ngắn mật khẩu.", e.getMessage());
    }
  }

  @Nested
  @DisplayName("name(String)")
  class Name {
    @Test
    @DisplayName("UTC019 - N - họ tên có dấu được bỏ khoảng trắng đầu/cuối")
    void utc019() {
      assertEquals("Trần Minh", ContactNormalizer.name("  Trần Minh "));
    }

    @Test
    @DisplayName("UTC020 - A - họ tên null")
    void utc020() {
      fails(() -> ContactNormalizer.name(null), "NAME");
    }

    @Test
    @DisplayName("UTC021 - A - họ tên chỉ có khoảng trắng")
    void utc021() {
      fails(() -> ContactNormalizer.name("   "), "NAME");
    }

    @Test
    @DisplayName("UTC022 - B - họ tên đúng 1 ký tự (tối thiểu)")
    void utc022() {
      assertEquals("A", ContactNormalizer.name("A"));
    }

    @Test
    @DisplayName("UTC023 - B - họ tên đúng 100 ký tự")
    void utc023() {
      assertEquals(100, ContactNormalizer.name("a".repeat(100)).length());
    }

    @Test
    @DisplayName("UTC024 - B - họ tên 101 ký tự")
    void utc024() {
      fails(() -> ContactNormalizer.name("a".repeat(101)), "NAME");
    }
  }

  @Nested
  @DisplayName("phone(String) / identifier(String) / channel(String)")
  class PhoneAndIdentifier {
    @Test
    @DisplayName("UTC025 - N - số '0912 345 678' (có dấu cách) đổi sang +84912345678")
    void utc025() {
      assertEquals("+84912345678", ContactNormalizer.phone("0912 345 678"));
    }

    @Test
    @DisplayName("UTC026 - N - số trống trả về null")
    void utc026() {
      assertNull(ContactNormalizer.phone("  "));
    }

    @Test
    @DisplayName("UTC027 - A - số 12345 chỉ có 5 chữ số (số VN phải đủ 10 chữ số)")
    void utc027() {
      var e = fails(() -> ContactNormalizer.phone("12345"), "PHONE");
      assertEquals("Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.", e.getMessage());
    }

    @Test
    @DisplayName("UTC028 - A - identifier trống")
    void utc028() {
      fails(() -> ContactNormalizer.identifier(" "), "IDENTIFIER");
    }

    @Test
    @DisplayName("UTC029 - N - channel: có @ là EMAIL, không có là SMS")
    void utc029() {
      assertEquals("EMAIL", ContactNormalizer.channel("minh@thors.vn"));
      assertEquals("SMS", ContactNormalizer.channel("0912345678"));
    }

    @Test
    @DisplayName("UTC030 - B - số 9 chữ số '091234567' (thiếu 1 số) bị từ chối")
    void utc030() {
      fails(() -> ContactNormalizer.phone("091234567"), "PHONE");
    }

    @Test
    @DisplayName("UTC031 - B - số 11 chữ số '09123456789' (thừa 1 số) bị từ chối")
    void utc031() {
      fails(() -> ContactNormalizer.phone("09123456789"), "PHONE");
    }

    @Test
    @DisplayName("UTC032 - B - '+84' + 9 số hợp lệ; '+84' + 10 số bị từ chối")
    void utc032() {
      assertEquals("+84912345678", ContactNormalizer.phone("+84912345678"));
      fails(() -> ContactNormalizer.phone("+849123456789"), "PHONE");
    }

    @Test
    @DisplayName("UTC033 - N - số '84912345678' (thiếu dấu +) vẫn được nhận")
    void utc033() {
      assertEquals("+84912345678", ContactNormalizer.phone("84912345678"));
    }
  }
}
