package com.thors.module.sizeadvice;

import static org.junit.jupiter.api.Assertions.*;

import com.thors.module.sizeadvice.SizeAdvisor.Advice;
import com.thors.module.sizeadvice.SizeAdvisor.FitStats;
import com.thors.module.sizeadvice.SizeAdvisor.PastItem;
import com.thors.module.sizeadvice.SizeAdvisor.Peer;
import com.thors.module.sizeadvice.SizeAdvisor.Profile;
import com.thors.module.sizeadvice.SizeChart.SizeType;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SizeAdvisorTest {
    private static final Profile MEDIUM_BODY = new Profile(168, 60, null, null);

    private static Map<String, Integer> stock(Object... sizeAndQty) {
        Map<String, Integer> m = new LinkedHashMap<>();
        for (int i = 0; i < sizeAndQty.length; i += 2) m.put((String) sizeAndQty[i], (Integer) sizeAndQty[i + 1]);
        return m;
    }

    private static final Map<String, Integer> TOPS = stock("S", 5, "M", 5, "L", 5, "XL", 5);

    @Test
    @DisplayName("Phân loại theo danh mục, có dấu hoặc không dấu; danh mục lạ thì đoán theo size")
    void classify() {
        assertEquals(SizeType.TOP, SizeChart.classify("Áo", List.of("M")));
        assertEquals(SizeType.BOTTOM, SizeChart.classify("Quần", List.of("30")));
        assertEquals(SizeType.SHOE, SizeChart.classify("Giày dép", List.of("38")));
        assertEquals(SizeType.NONE, SizeChart.classify("Túi xách", List.of("Freesize")));
        assertEquals(SizeType.SHOE, SizeChart.classify("Hàng mới", List.of("37", "38", "39")));
        assertEquals(SizeType.BOTTOM, SizeChart.classify("Hàng mới", List.of("29", "30", "31")));
        assertEquals(SizeType.TOP, SizeChart.classify("Hàng mới", List.of("S", "M", "2XL")));
        assertEquals(SizeType.NONE, SizeChart.classify("Hàng mới", List.of("F")));
    }

    @Test
    @DisplayName("Bảng size: áo theo chiều cao + cân nặng, quần theo cân nặng, giày theo bàn chân")
    void chart() {
        assertEquals("M", SizeChart.sizeAt(SizeType.TOP, SizeChart.chartIndex(SizeType.TOP, 168, 60, null)));
        assertEquals("XL", SizeChart.sizeAt(SizeType.TOP, SizeChart.chartIndex(SizeType.TOP, 183, 58, null)));
        assertEquals("30", SizeChart.sizeAt(SizeType.BOTTOM, SizeChart.chartIndex(SizeType.BOTTOM, 168, 60, null)));
        assertEquals("31", SizeChart.sizeAt(SizeType.BOTTOM, SizeChart.chartIndex(SizeType.BOTTOM, 185, 60, null)));
        assertEquals("40", SizeChart.sizeAt(SizeType.SHOE, SizeChart.chartIndex(SizeType.SHOE, null, null, 250)));
        assertEquals("39", SizeChart.sizeAt(SizeType.SHOE, SizeChart.chartIndex(SizeType.SHOE, null, null, 242)));
        assertNull(SizeChart.chartIndex(SizeType.SHOE, 170, 60, null));
    }

    @Test
    @DisplayName("Chỉ có số đo: gợi ý theo bảng, độ tin cậy thấp")
    void chartOnly() {
        Advice a = SizeAdvisor.advise(SizeType.TOP, TOPS, MEDIUM_BODY, List.of(), FitStats.EMPTY, List.of());
        assertEquals("M", a.size());
        assertEquals("LOW", a.confidence());
        assertTrue(a.inStock());
    }

    @Test
    @DisplayName("Thích mặc rộng: áo tăng 1 size")
    void loosePreference() {
        Profile p = new Profile(168, 60, null, "LOOSE");
        assertEquals("L", SizeAdvisor.advise(SizeType.TOP, TOPS, p, List.of(), FitStats.EMPTY, List.of()).size());
    }

    @Test
    @DisplayName("Thiếu số đo và chưa có lịch sử: báo thiếu, không gợi ý")
    void missingProfile() {
        Profile empty = new Profile(null, null, null, null);
        Advice a = SizeAdvisor.advise(SizeType.SHOE, stock("38", 1, "39", 1), empty, List.of(), FitStats.EMPTY, List.of());
        assertEquals("FOOT", a.missing());
        assertNull(a.size());
    }

    @Test
    @DisplayName("Đã 2 lần đánh giá áo M là chật: lịch sử thắng bảng size, gợi ý L")
    void historyWins() {
        int m = SizeChart.indexOf(SizeType.TOP, "M");
        List<PastItem> history = List.of(new PastItem(m, "TIGHT", true, 0), new PastItem(m, "TIGHT", true, 0));
        Advice a = SizeAdvisor.advise(SizeType.TOP, TOPS, MEDIUM_BODY, history, FitStats.EMPTY, List.of());
        assertEquals("L", a.size());
        assertEquals("HIGH", a.confidence());
    }

    @Test
    @DisplayName("Món cũ form nhỏ mặc vừa: không bị kéo lên size lớn")
    void historyAdjustedByProductForm() {
        int l = SizeChart.indexOf(SizeType.TOP, "L");
        // Mua L của một mẫu form nhỏ (+1) và thấy vừa → size "thật" là M
        List<PastItem> history = List.of(new PastItem(l, "TRUE", true, 1), new PastItem(l, "TRUE", true, 1));
        assertEquals("M", SizeAdvisor.advise(SizeType.TOP, TOPS, MEDIUM_BODY, history, FitStats.EMPTY, List.of()).size());
    }

    @Test
    @DisplayName("Mẫu form nhỏ (đa số khách thấy chật): tăng 1 size")
    void smallProductForm() {
        Advice a = SizeAdvisor.advise(SizeType.TOP, TOPS, MEDIUM_BODY, List.of(), new FitStats(7, 2, 1), List.of());
        assertEquals("L", a.size());
        assertEquals("MEDIUM", a.confidence());
        assertTrue(a.reasons().stream().anyMatch(r -> r.contains("form nhỏ")));
    }

    @Test
    @DisplayName("Ít đánh giá thì chưa kết luận form")
    void tooFewVotes() {
        assertEquals(0, new FitStats(2, 0, 0).offset());
        assertEquals(0, new FitStats(3, 3, 0).offset());
        assertEquals(-1, new FitStats(0, 1, 4).offset());
    }

    @Test
    @DisplayName("≥3 khách có số đo giống bạn mặc vừa size L: chọn L")
    void similarCustomersOverride() {
        List<Peer> peers = List.of(
                new Peer("L", 170, 62, null),
                new Peer("L", 166, 58, null),
                new Peer("L", 168, 61, null),
                new Peer("S", 155, 45, null)); // khác số đo, không tính
        Advice a = SizeAdvisor.advise(SizeType.TOP, TOPS, MEDIUM_BODY, List.of(), FitStats.EMPTY, peers);
        assertEquals("L", a.size());
        assertEquals("HIGH", a.confidence());
        assertEquals(3, a.similar().get(0).count());
    }

    @Test
    @DisplayName("Size gợi ý không bán: chọn size gần nhất; hết hàng thì báo")
    void nearestOfferedAndStock() {
        Map<String, Integer> s = stock("S", 3, "L", 0);
        Advice a = SizeAdvisor.advise(SizeType.TOP, s, MEDIUM_BODY, List.of(), FitStats.EMPTY, List.of());
        assertEquals("L", a.size()); // M không có, S và L cách đều → chọn size lớn hơn
        assertFalse(a.inStock());
    }

    @Test
    @DisplayName("Túi xách: không gợi ý")
    void noneType() {
        Advice a = SizeAdvisor.advise(SizeType.NONE, stock("Freesize", 3), MEDIUM_BODY, List.of(), FitStats.EMPTY, List.of());
        assertEquals("NONE", a.sizeType());
        assertNull(a.size());
    }

    @Test
    @DisplayName("Suy ra Chật/Rộng từ lý do đổi trả")
    void returnReason() {
        assertEquals("TIGHT", SizeAdvisor.fitFromReturnReason("Áo bị chật ở vai"));
        assertEquals("LOOSE", SizeAdvisor.fitFromReturnReason("Đổi size, quần hơi rộng"));
        assertNull(SizeAdvisor.fitFromReturnReason("Sản phẩm bị lỗi đường may"));
    }
}
