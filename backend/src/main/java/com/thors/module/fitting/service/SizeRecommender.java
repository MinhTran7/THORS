package com.thors.module.fitting.service;

import com.thors.module.fitting.dto.BodyProfileRequest;
import com.thors.module.fitting.dto.SizeRecommendation;
import com.thors.module.fitting.dto.SizeRecommendation.MeasureFit;
import com.thors.module.fitting.dto.SizeRecommendation.SizeFit;
import com.thors.module.fitting.entity.SizeChartRow;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.function.Function;

/**
 * Thuật toán gợi ý size theo luật (rule-based), không đụng DB: dễ đọc, dễ test.
 *
 * <p>Với mỗi size, so từng số đo của khách với khoảng [min, max] trong bảng size:
 * nằm trong khoảng = 0 điểm phạt; ngoài khoảng = khoảng cách chia độ rộng khoảng (lệch 1 khoảng = 1 điểm).
 * Điểm của size = trung bình có trọng số các số đo (vòng ngực / eo / hông quan trọng hơn chiều cao, cân nặng).
 * Size có điểm thấp nhất được gợi ý; nếu size đó hết hàng thì đề xuất thêm size gần nhất còn hàng.
 *
 * <p>Kiểu mặc: thích ôm -> coi các vòng nhỏ đi 2 cm; thích rộng -> lớn thêm 4 cm (nên nghiêng về size lớn hơn).
 */
public final class SizeRecommender {

    private SizeRecommender() {
    }

    /** Một loại số đo: lấy min/max từ bảng size, lấy giá trị từ số đo khách. */
    private record Measure(
            String key,
            String label,
            double weight,
            boolean circumference,
            Function<SizeChartRow, BigDecimal> min,
            Function<SizeChartRow, BigDecimal> max,
            Function<BodyProfileRequest, BigDecimal> value) {
    }

    private static final List<Measure> MEASURES = List.of(
            new Measure("chest", "Ngực", 3, true, SizeChartRow::chestMin, SizeChartRow::chestMax, BodyProfileRequest::chestCm),
            new Measure("waist", "Eo", 3, true, SizeChartRow::waistMin, SizeChartRow::waistMax, BodyProfileRequest::waistCm),
            new Measure("hip", "Hông", 3, true, SizeChartRow::hipMin, SizeChartRow::hipMax, BodyProfileRequest::hipCm),
            new Measure("height", "Chiều cao", 1, false, SizeChartRow::heightMin, SizeChartRow::heightMax, BodyProfileRequest::heightCm),
            new Measure("weight", "Cân nặng", 1, false, SizeChartRow::weightMin, SizeChartRow::weightMax, BodyProfileRequest::weightKg),
            // Giày dép: chân dài hơn khoảng của size -> "chật"; ngắn hơn -> "rộng" (không cộng/trừ theo kiểu mặc)
            new Measure("foot", "Bàn chân", 3, false, SizeChartRow::footMin, SizeChartRow::footMax, BodyProfileRequest::footLengthCm));

    /** Khoảng quá hẹp (vd. 90-90) vẫn coi rộng tối thiểu 2 đơn vị để điểm phạt không bị phóng đại. */
    private static final double MIN_RANGE = 2.0;

    /**
     * @param chart bảng size của sản phẩm
     * @param body số đo khách (gender bỏ qua)
     * @param sizesInStock các size còn ít nhất 1 biến thể bán online còn hàng
     * @param usedSavedProfile chỉ để ghi lại vào kết quả
     */
    public static SizeRecommendation recommend(
            List<SizeChartRow> chart, BodyProfileRequest body, Set<String> sizesInStock, boolean usedSavedProfile) {
        double shift = switch (body.fitPreference() == null ? "REGULAR" : body.fitPreference()) {
            case "SLIM" -> -2;
            case "LOOSE" -> 4;
            default -> 0;
        };

        List<SizeFit> fits = new ArrayList<>();
        for (SizeChartRow row : chart) {
            List<MeasureFit> details = new ArrayList<>();
            double penalty = 0;
            double weights = 0;
            for (Measure m : MEASURES) {
                BigDecimal min = m.min().apply(row);
                BigDecimal max = m.max().apply(row);
                BigDecimal raw = m.value().apply(body);
                if (min == null || max == null || raw == null) continue; // size / khách không có số đo này
                double v = raw.doubleValue() + (m.circumference() ? shift : 0);
                double lo = min.doubleValue();
                double hi = max.doubleValue();
                double width = Math.max(hi - lo, MIN_RANGE);
                String status;
                double p;
                if (v > hi) {
                    p = (v - hi) / width;
                    status = m.key().equals("height") ? "SHORT" : "TIGHT"; // cao hơn khoảng -> đồ bị ngắn
                } else if (v < lo) {
                    p = (lo - v) / width;
                    status = m.key().equals("height") ? "LONG" : "LOOSE";
                } else {
                    p = 0;
                    status = "FIT";
                }
                penalty += m.weight() * p;
                weights += m.weight();
                details.add(new MeasureFit(m.key(), m.label(), BigDecimal.valueOf(v), min, max, status));
            }
            if (weights == 0) continue; // không có số đo nào để so với size này
            double score = Math.round(penalty / weights * 1000) / 1000.0;
            fits.add(new SizeFit(row.sizeLabel(), score, sizesInStock.contains(row.sizeLabel()), details));
        }

        if (fits.isEmpty()) {
            return new SizeRecommendation(null, null, false, null, usedSavedProfile, List.of());
        }
        // Khớp nhất trước; bằng điểm thì giữ thứ tự bảng size (sort ổn định)
        fits.sort(Comparator.comparingDouble(SizeFit::score));
        SizeFit best = fits.get(0);
        String confidence = best.score() == 0 ? "HIGH" : best.score() <= 0.5 ? "MEDIUM" : "LOW";
        String alternative = best.inStock()
                ? null
                : fits.stream().filter(SizeFit::inStock).map(SizeFit::size).findFirst().orElse(null);
        return new SizeRecommendation(best.size(), confidence, best.inStock(), alternative, usedSavedProfile, fits);
    }
}
