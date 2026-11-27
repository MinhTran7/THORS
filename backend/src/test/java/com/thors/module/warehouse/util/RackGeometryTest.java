package com.thors.module.warehouse.util;

import static org.junit.jupiter.api.Assertions.*;

import com.thors.common.ApiException;
import com.thors.module.warehouse.util.RackGeometry.Box;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Unit test cho RackGeometry (vị trí kệ trên sơ đồ kho: tính chiều cao, kiểm tra chồng lấn, tự dời kệ)
 * theo sheet "RackGeometry" của Report-5.1_Unit Test. Kệ rộng 190 px, các kệ cách nhau tối thiểu 24 px,
 * tọa độ trong khoảng 0–1800. Loại: N = Normal, A = Abnormal, B = Boundary.
 */
@DisplayName("RackGeometry Unit Test")
class RackGeometryTest {

  private static Map<String, Object> rack(int id, String code, Object x, Object y) {
    var m = new HashMap<String, Object>();
    m.put("rack_id", id);
    m.put("rack_code", code);
    m.put("coordinate_x", x);
    m.put("coordinate_y", y);
    return m;
  }

  private static Map<String, Object> tier(int rackId) {
    return Map.of("rack_id", rackId);
  }

  @Nested
  @DisplayName("height(long count)")
  class Height {
    @Test
    @DisplayName("UTC001 - B - kệ 0 tầng cao 134 px")
    void utc001() {
      assertEquals(134, RackGeometry.height(0));
    }

    @Test
    @DisplayName("UTC002 - N - kệ 1 tầng cao 174 px")
    void utc002() {
      assertEquals(174, RackGeometry.height(1));
    }

    @Test
    @DisplayName("UTC003 - N - kệ 3 tầng cao 262 px (mỗi tầng thêm 44 px)")
    void utc003() {
      assertEquals(262, RackGeometry.height(3));
    }
  }

  @Nested
  @DisplayName("box(Map rack, List tiers)")
  class BoxTests {
    @Test
    @DisplayName("UTC004 - N - lấy tọa độ và chỉ đếm tầng của đúng kệ đó")
    void utc004() {
      var b = RackGeometry.box(rack(1, "A", 100, 200), List.of(tier(1), tier(1), tier(2)));
      assertEquals(new Box(1, 100, 200, RackGeometry.height(2)), b);
    }

    @Test
    @DisplayName("UTC005 - A - thiếu tọa độ (null) thì dùng mặc định 40")
    void utc005() {
      var b = RackGeometry.box(rack(1, "A", null, null), List.of());
      assertEquals(40, b.x());
      assertEquals(40, b.y());
    }

    @Test
    @DisplayName("UTC006 - B - tọa độ âm bị kéo về 0")
    void utc006() {
      assertEquals(0, RackGeometry.box(rack(1, "A", -50, -1), List.of()).x());
    }

    @Test
    @DisplayName("UTC007 - B - tọa độ vượt 1800 bị kéo về 1800")
    void utc007() {
      assertEquals(1800, RackGeometry.box(rack(1, "A", 1801, 0), List.of()).x());
    }

    @Test
    @DisplayName("UTC008 - B - tọa độ đúng 0 và đúng 1800 được giữ nguyên")
    void utc008() {
      assertEquals(0, RackGeometry.box(rack(1, "A", 0, 0), List.of()).x());
      assertEquals(1800, RackGeometry.box(rack(1, "A", 1800, 0), List.of()).x());
    }

    @Test
    @DisplayName("UTC009 - N - tọa độ lẻ được làm tròn 2 chữ số")
    void utc009() {
      assertEquals(12.35, RackGeometry.box(rack(1, "A", 12.345, 0), List.of()).x());
    }

    @Test
    @DisplayName("UTC010 - A - tọa độ NaN thì dùng mặc định 40")
    void utc010() {
      assertEquals(40, RackGeometry.box(rack(1, "A", Double.NaN, 0), List.of()).x());
    }
  }

  @Nested
  @DisplayName("overlap(Box a, Box b) / collision(Box, List)")
  class Overlap {
    private final Box a = new Box(1, 0, 0, 134);

    @Test
    @DisplayName("UTC011 - N - hai kệ cách xa nhau không chồng")
    void utc011() {
      assertFalse(RackGeometry.overlap(a, new Box(2, 500, 500, 134)));
    }

    @Test
    @DisplayName("UTC012 - N - hai kệ đặt trùng chỗ thì chồng")
    void utc012() {
      assertTrue(RackGeometry.overlap(a, new Box(2, 0, 0, 134)));
    }

    @Test
    @DisplayName("UTC013 - B - cách ngang đúng 214 px (190 + 24) không chồng")
    void utc013() {
      assertFalse(RackGeometry.overlap(a, new Box(2, 214, 0, 134)));
    }

    @Test
    @DisplayName("UTC014 - B - cách ngang 213 px thì chồng")
    void utc014() {
      assertTrue(RackGeometry.overlap(a, new Box(2, 213, 0, 134)));
    }

    @Test
    @DisplayName("UTC015 - B - cách dọc đúng chiều cao + 24 px không chồng")
    void utc015() {
      assertFalse(RackGeometry.overlap(a, new Box(2, 0, 158, 134)));
    }

    @Test
    @DisplayName("UTC016 - B - cách dọc 157 px (thiếu 1 px) thì chồng")
    void utc016() {
      assertTrue(RackGeometry.overlap(a, new Box(2, 0, 157, 134)));
    }

    @Test
    @DisplayName("UTC017 - N - collision bỏ qua chính kệ đang xét (cùng id)")
    void utc017() {
      assertTrue(RackGeometry.collision(a, List.of(new Box(1, 0, 0, 134))).isEmpty());
      assertEquals(2, RackGeometry.collision(a, List.of(new Box(2, 10, 10, 134))).orElseThrow().id());
    }
  }

  @Nested
  @DisplayName("requireFree(Map candidate, List racks, List tiers)")
  class RequireFree {
    @Test
    @DisplayName("UTC018 - N - vị trí trống thì cho đặt")
    void utc018() {
      assertDoesNotThrow(() ->
          RackGeometry.requireFree(rack(2, "B", 600, 0), List.of(rack(1, "A", 0, 0)), List.of()));
    }

    @Test
    @DisplayName("UTC019 - A - chồng lên kệ A thì báo lỗi 409 kèm mã kệ")
    void utc019() {
      var e = assertThrows(ApiException.class, () ->
          RackGeometry.requireFree(rack(2, "B", 50, 0), List.of(rack(1, "A", 0, 0)), List.of()));
      assertEquals(409, e.status);
      assertEquals("WAREHOUSE_CONFLICT", e.code);
      assertEquals("Vị trí này chồng lên kệ A. Hãy để cách kệ khác ít nhất 24 px.", e.getMessage());
    }

    @Test
    @DisplayName("UTC020 - N - di chuyển chính kệ đó trong vùng cũ không bị coi là chồng")
    void utc020() {
      assertDoesNotThrow(() ->
          RackGeometry.requireFree(rack(1, "A", 10, 10), List.of(rack(1, "A", 0, 0)), List.of()));
    }
  }

  @Nested
  @DisplayName("normalize(List racks, List tiers)")
  class Normalize {
    @Test
    @DisplayName("UTC021 - N - các kệ không chồng giữ nguyên vị trí")
    void utc021() {
      var out = RackGeometry.normalize(List.of(rack(1, "A", 0, 0), rack(2, "B", 600, 0)), List.of());
      assertEquals(0.0, out.get(0).get("coordinate_x"));
      assertEquals(600.0, out.get(1).get("coordinate_x"));
    }

    @Test
    @DisplayName("UTC022 - N - kệ id lớn hơn bị chồng được dời sang chỗ trống gần nhất, kệ id nhỏ giữ nguyên")
    void utc022() {
      var out = RackGeometry.normalize(List.of(rack(1, "A", 0, 0), rack(2, "B", 0, 0)), List.of());
      assertEquals(0.0, out.get(0).get("coordinate_x"));
      assertEquals(0.0, out.get(0).get("coordinate_y"));
      var moved = new Box(2, (double) out.get(1).get("coordinate_x"), (double) out.get(1).get("coordinate_y"), 134);
      assertFalse(RackGeometry.overlap(new Box(1, 0, 0, 134), moved));
      assertEquals(214.0, moved.x());
      assertEquals(0.0, moved.y());
    }

    @Test
    @DisplayName("UTC023 - N - không làm thay đổi Map đầu vào, giữ các cột khác")
    void utc023() {
      var input = rack(2, "B", 0, 0);
      var out = RackGeometry.normalize(List.of(rack(1, "A", 0, 0), input), List.of());
      assertEquals(0, input.get("coordinate_x"));
      assertEquals("B", out.get(1).get("rack_code"));
    }
  }
}
