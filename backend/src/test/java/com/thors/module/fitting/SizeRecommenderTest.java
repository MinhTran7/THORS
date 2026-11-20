package com.thors.module.fitting;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.thors.common.ApiException;
import com.thors.module.fitting.dto.BodyProfileRequest;
import com.thors.module.fitting.dto.SizeRecommendation;
import com.thors.module.fitting.entity.SizeChartRow;
import com.thors.module.fitting.service.SizeChartService;
import com.thors.module.fitting.service.SizeRecommender;
import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** Thuật toán gợi ý size + kiểm tra bảng size Owner nhập. */
class SizeRecommenderTest {

    private static BigDecimal d(double v) {
        return BigDecimal.valueOf(v);
    }

    /** Áo: chỉ quy định ngực + eo + chiều cao. */
    private static SizeChartRow shirt(String size, double c1, double c2, double w1, double w2, double h1, double h2) {
        return new SizeChartRow(size, d(h1), d(h2), null, null, d(c1), d(c2), d(w1), d(w2), null, null, null, null, 0);
    }

    private static final List<SizeChartRow> CHART = List.of(
            shirt("S", 80, 86, 64, 70, 150, 158),
            shirt("M", 86, 92, 70, 76, 155, 163),
            shirt("L", 92, 98, 76, 82, 160, 168),
            shirt("XL", 98, 104, 82, 88, 165, 175));

    private static final Set<String> ALL = Set.of("S", "M", "L", "XL");

    private static BodyProfileRequest body(double height, Double chest, Double waist, String fit) {
        return new BodyProfileRequest("FEMALE", d(height), d(52), chest == null ? null : d(chest),
                waist == null ? null : d(waist), null, null, fit);
    }

    @Test
    void exactFitIsHighConfidence() {
        SizeRecommendation r = SizeRecommender.recommend(CHART, body(160, 88.0, 72.0, "REGULAR"), ALL, true);
        assertEquals("M", r.recommendedSize());
        assertEquals("HIGH", r.confidence());
        assertTrue(r.inStock());
        assertNull(r.alternativeSize());
    }

    @Test
    void bestSizeWhenBetweenSizes() {
        // Ngực 88 (vừa M), eo 69 (hơi nhỏ so với M) -> vẫn M, độ tin cậy trung bình, eo "rộng"
        SizeRecommendation r = SizeRecommender.recommend(CHART, body(160, 88.0, 69.0, "REGULAR"), ALL, true);
        assertEquals("M", r.recommendedSize());
        assertEquals("MEDIUM", r.confidence());
        var waist = r.sizes().get(0).details().stream().filter(m -> m.measure().equals("waist")).findFirst().orElseThrow();
        assertEquals("LOOSE", waist.status());
    }

    @Test
    void preferLooseLeansToBiggerSize() {
        // Ngực 91: vừa M; thích rộng (+4 cm) -> 95 -> L
        assertEquals("M", SizeRecommender.recommend(CHART, body(162, 91.0, null, "REGULAR"), ALL, true).recommendedSize());
        assertEquals("L", SizeRecommender.recommend(CHART, body(162, 91.0, null, "LOOSE"), ALL, true).recommendedSize());
    }

    @Test
    void outOfStockSuggestsNearestInStock() {
        SizeRecommendation r = SizeRecommender.recommend(CHART, body(160, 88.0, 72.0, null), Set.of("S", "L"), true);
        assertEquals("M", r.recommendedSize());
        assertFalse(r.inStock());
        assertTrue(Set.of("S", "L").contains(r.alternativeSize()));
    }

    @Test
    void heightOverRangeMeansShort() {
        // Cao 175 với size S (150-158) -> áo bị "ngắn"
        SizeRecommendation r = SizeRecommender.recommend(List.of(CHART.get(0)), body(175, null, null, null), ALL, false);
        assertEquals("SHORT", r.sizes().get(0).details().get(0).status());
    }

    @Test
    void nothingToCompareGivesNoRecommendation() {
        // Bảng size chỉ có vòng hông, khách không nhập hông -> không gợi ý
        var hipOnly = List.of(new SizeChartRow("M", null, null, null, null, null, null, null, null, d(90), d(96), null, null, 0));
        SizeRecommendation r = SizeRecommender.recommend(hipOnly, body(160, 88.0, 70.0, null), ALL, true);
        assertNull(r.recommendedSize());
        assertTrue(r.sizes().isEmpty());
    }

    @Test
    void validateChart() {
        Set<String> sizes = Set.of("S", "M");
        var ok = SizeChartService.validate(List.of(shirt("M", 86, 92, 70, 76, 155, 163), shirt("S", 80, 86, 64, 70, 150, 158)), sizes);
        assertEquals(1, ok.get(1).sortOrder()); // giữ thứ tự Owner nhập
        int status = assertThrows(ApiException.class,
                () -> SizeChartService.validate(List.of(shirt("XL", 98, 104, 82, 88, 165, 175)), sizes)).status;
        assertEquals(400, status); // size không có trong sản phẩm
        assertThrows(ApiException.class,
                () -> SizeChartService.validate(List.of(shirt("M", 92, 86, 70, 76, 155, 163)), sizes)); // min > max
        assertThrows(ApiException.class,
                () -> SizeChartService.validate(List.of(shirt("M", 86, 92, 70, 76, 155, 163), shirt("M", 86, 92, 70, 76, 155, 163)), sizes));
        var half = new SizeChartRow("M", null, null, null, null, d(86), null, null, null, null, null, null, null, 0);
        assertThrows(ApiException.class, () -> SizeChartService.validate(List.of(half), sizes)); // thiếu "đến"
    }
}
