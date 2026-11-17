package com.thors.module.fitting;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.thors.module.fitting.entity.SizeChartRow;
import com.thors.module.fitting.service.StandardSizeCharts;
import com.thors.module.fitting.service.StandardSizeCharts.Kind;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Bảng size chuẩn: nhận loại hàng từ danh mục, tra size chữ / size quần số, sắp thứ tự size. */
class StandardSizeChartsTest {

    @Test
    void detectKindFromCategoryNames() {
        assertEquals(Kind.TOP, StandardSizeCharts.detectKind(List.of("Áo Phông Nam", "Áo")));
        assertEquals(Kind.BOTTOM, StandardSizeCharts.detectKind(List.of("Quần Short Nam", "Quần")));
        assertEquals(Kind.SHOES, StandardSizeCharts.detectKind(List.of("Dép Cao Gót Nữ", "Dép nữ", "Dép")));
        assertEquals(Kind.SHOES, StandardSizeCharts.detectKind(List.of("Giày Da Nam", "Giày nam", "Giày")));
        assertEquals(Kind.NONE, StandardSizeCharts.detectKind(List.of("Balo Nữ", "Balo")));
        assertEquals(Kind.NONE, StandardSizeCharts.detectKind(List.of("Túi Xách Nữ", "Túi xách")));
    }

    @Test
    void letterSizesForMenTop() {
        List<SizeChartRow> rows = StandardSizeCharts.rowsFor(Kind.TOP, "MEN", List.of("S", "M", "L", "30"));
        assertEquals(3, rows.size()); // "30" trên áo không tra được -> bỏ qua
        SizeChartRow m = rows.get(1);
        assertEquals("M", m.sizeLabel());
        assertEquals(0, new BigDecimal("88").compareTo(m.chestMin()));
        assertNull(m.hipMin()); // áo không dùng vòng hông
    }

    @Test
    void numericPantsAreWaistInches() {
        SizeChartRow r = StandardSizeCharts.rowsFor(Kind.BOTTOM, "MEN", List.of("30")).get(0);
        // 30 inch = 76.2 cm, +-1.3
        assertEquals(0, new BigDecimal("74.9").compareTo(r.waistMin()));
        assertEquals(0, new BigDecimal("77.5").compareTo(r.waistMax()));
    }

    @Test
    void shoeSizesAreFootLength() {
        List<SizeChartRow> rows = StandardSizeCharts.rowsFor(Kind.SHOES, "WOMEN", List.of("37", "38", "M"));
        assertEquals(2, rows.size()); // dép size "M" không quy đổi được -> bỏ qua
        SizeChartRow s38 = rows.get(1);
        // 38 / 1.5 - 1.5 = 23.83 -> 23.5 - 24.2 cm
        assertEquals(0, new BigDecimal("23.5").compareTo(s38.footMin()));
        assertEquals(0, new BigDecimal("24.2").compareTo(s38.footMax()));
        assertNull(s38.chestMin());
        // Giày trẻ em cũng quy đổi được (size 20 -> ~11.8 cm)
        assertEquals(1, StandardSizeCharts.rowsFor(Kind.SHOES, "KIDS", List.of("20")).size());
    }

    @Test
    void noStandardForBagsAndKidsClothes() {
        assertTrue(StandardSizeCharts.rowsFor(Kind.NONE, "MEN", List.of("40")).isEmpty());
        assertTrue(StandardSizeCharts.rowsFor(Kind.TOP, "KIDS", List.of("M")).isEmpty());
    }

    @Test
    void footLengthPicksShoeSize() {
        var chart = StandardSizeCharts.rowsFor(Kind.SHOES, "WOMEN", List.of("36", "37", "38", "39"));
        var body = new com.thors.module.fitting.dto.BodyProfileRequest("FEMALE", BigDecimal.valueOf(160),
                BigDecimal.valueOf(50), null, null, null, BigDecimal.valueOf(23.8), null);
        var rec = com.thors.module.fitting.service.SizeRecommender.recommend(chart, body, java.util.Set.of("36", "37", "38", "39"), true);
        assertEquals("38", rec.recommendedSize());
        assertEquals("HIGH", rec.confidence());
    }

    @Test
    void sortSizesLogically() {
        assertEquals(List.of("S", "M", "L", "XL", "XXL"), StandardSizeCharts.sortSizes(List.of("XL", "L", "M", "S", "XXL")));
        assertEquals(List.of("28", "30", "32"), StandardSizeCharts.sortSizes(List.of("32", "28", "30")));
    }
}
