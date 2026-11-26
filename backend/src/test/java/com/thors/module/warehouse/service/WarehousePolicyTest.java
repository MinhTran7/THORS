package com.thors.module.warehouse.service;

import static org.junit.jupiter.api.Assertions.*;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;

/**
 * Unit test cho WarehousePolicy (phân quyền module Kho) theo sheet "WarehousePolicy" của
 * Report-5.1_Unit Test. Lớp này không dùng DB nên không cần mock.
 * Loại: N = Normal, A = Abnormal, B = Boundary.
 */
@DisplayName("WarehousePolicy Unit Test")
class WarehousePolicyTest {
  private final WarehousePolicy policy = new WarehousePolicy();

  private static final Account OWNER = account(1, "OWNER");
  private static final Account FAMILY = account(2, "FAMILY_MEMBER");
  private static final Account CUSTOMER = account(3, "CUSTOMER");
  private static final Account ADMIN = account(4, "ADMIN");
  private static final Account STAFF = account(5, "STAFF");

  private static Account account(int id, String role) {
    return new Account(id, role, "User " + id, "", "u" + id + "@thors.vn", null, null, null, "ACTIVE", null, null, null, 0, null);
  }

  private static void denied(Executable call) {
    var e = assertThrows(ApiException.class, call);
    assertEquals(403, e.status);
    assertEquals("WAREHOUSE_FORBIDDEN", e.code);
    assertEquals("Bạn không có quyền thực hiện thao tác kho này.", e.getMessage());
  }

  private static Map<String, Object> doc(String type, int createdBy) {
    return Map.of("receipt_type", type, "created_by", createdBy);
  }

  @Nested
  @DisplayName("view(Account a)")
  class View {
    @Test
    @DisplayName("UTC001 - N - OWNER được xem kho")
    void utc001() {
      assertDoesNotThrow(() -> policy.view(OWNER));
    }

    @Test
    @DisplayName("UTC002 - N - FAMILY_MEMBER được xem kho")
    void utc002() {
      assertDoesNotThrow(() -> policy.view(FAMILY));
    }

    @Test
    @DisplayName("UTC003 - A - CUSTOMER không được xem kho")
    void utc003() {
      denied(() -> policy.view(CUSTOMER));
    }

    @Test
    @DisplayName("UTC004 - A - ADMIN không được xem kho")
    void utc004() {
      denied(() -> policy.view(ADMIN));
    }

    @Test
    @DisplayName("UTC005 - A - STAFF (nhân viên bán hàng) không được xem kho")
    void utc005() {
      denied(() -> policy.view(STAFF));
    }
  }

  @Nested
  @DisplayName("owner(Account a)")
  class Owner {
    @Test
    @DisplayName("UTC006 - N - OWNER được làm thao tác chỉ dành cho chủ shop")
    void utc006() {
      assertDoesNotThrow(() -> policy.owner(OWNER));
    }

    @Test
    @DisplayName("UTC007 - A - FAMILY_MEMBER bị chặn")
    void utc007() {
      denied(() -> policy.owner(FAMILY));
    }
  }

  @Nested
  @DisplayName("create(Account a, String type)")
  class Create {
    @Test
    @DisplayName("UTC008 - N - FAMILY_MEMBER lập phiếu đặt hàng (PURCHASE_ORDER)")
    void utc008() {
      assertDoesNotThrow(() -> policy.create(FAMILY, "PURCHASE_ORDER"));
    }

    @Test
    @DisplayName("UTC009 - N - FAMILY_MEMBER lập phiếu nhập (RECEIPT)")
    void utc009() {
      assertDoesNotThrow(() -> policy.create(FAMILY, "RECEIPT"));
    }

    @Test
    @DisplayName("UTC010 - N - FAMILY_MEMBER lập phiếu trả NCC (SUPPLIER_RETURN)")
    void utc010() {
      assertDoesNotThrow(() -> policy.create(FAMILY, "SUPPLIER_RETURN"));
    }

    @Test
    @DisplayName("UTC011 - A - FAMILY_MEMBER lập loại phiếu khác (STOCK_COUNT)")
    void utc011() {
      denied(() -> policy.create(FAMILY, "STOCK_COUNT"));
    }

    @Test
    @DisplayName("UTC012 - N - OWNER lập mọi loại phiếu")
    void utc012() {
      assertDoesNotThrow(() -> policy.create(OWNER, "STOCK_COUNT"));
      assertDoesNotThrow(() -> policy.create(OWNER, "PURCHASE_ORDER"));
    }

    @Test
    @DisplayName("UTC013 - B - FAMILY_MEMBER, loại phiếu null")
    void utc013() {
      denied(() -> policy.create(FAMILY, null));
    }

    @Test
    @DisplayName("UTC014 - B - FAMILY_MEMBER, loại phiếu viết thường 'receipt'")
    void utc014() {
      denied(() -> policy.create(FAMILY, "receipt"));
    }
  }

  @Nested
  @DisplayName("edit(Account a, Map doc)")
  class Edit {
    @Test
    @DisplayName("UTC015 - N - FAMILY_MEMBER sửa phiếu nhập do chính mình lập")
    void utc015() {
      assertDoesNotThrow(() -> policy.edit(FAMILY, doc("RECEIPT", 2)));
    }

    @Test
    @DisplayName("UTC016 - A - FAMILY_MEMBER sửa phiếu nhập do người khác lập")
    void utc016() {
      denied(() -> policy.edit(FAMILY, doc("RECEIPT", 1)));
    }

    @Test
    @DisplayName("UTC017 - N - OWNER sửa phiếu do FAMILY_MEMBER lập")
    void utc017() {
      assertDoesNotThrow(() -> policy.edit(OWNER, doc("RECEIPT", 2)));
    }

    @Test
    @DisplayName("UTC018 - A - FAMILY_MEMBER sửa phiếu kiểm kê của chính mình")
    void utc018() {
      denied(() -> policy.edit(FAMILY, doc("STOCK_COUNT", 2)));
    }

    @Test
    @DisplayName("UTC019 - N - FAMILY_MEMBER sửa phiếu đặt hàng do chính mình lập")
    void utc019() {
      assertDoesNotThrow(() -> policy.edit(FAMILY, doc("PURCHASE_ORDER", 2)));
    }
  }
}
