package com.thors.module.sizeadvice;

import com.thors.module.sizeadvice.SizeChart.SizeType;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Thuật toán gợi ý size cho một sản phẩm cụ thể (không truy cập DB, để dễ kiểm thử).
 *
 * <p>Gộp 4 nguồn, xếp từ yếu tới mạnh:
 *
 * <ol>
 *   <li><b>Bảng size</b> theo số đo trong hồ sơ (+ kiểu mặc ôm/rộng với áo).
 *   <li><b>Lịch sử của chính khách</b>: các món cùng loại đã nhận; đánh giá Chật → lẽ ra cần lớn hơn 1
 *       size, Rộng → nhỏ hơn 1 size, Vừa hoặc giữ lại không trả → đúng size. Có điều chỉnh theo form
 *       của món đó (món form nhỏ mà mặc vừa thì size "thật" của khách nhỏ hơn).
 *   <li><b>Form của sản phẩm này</b> theo đánh giá của mọi khách: đa số thấy chật → tăng 1 size.
 *   <li><b>Khách có số đo giống bạn</b> đã mua sản phẩm này và thấy vừa.
 * </ol>
 */
public final class SizeAdvisor {
    private SizeAdvisor() {}

    /** Số đánh giá tối thiểu để kết luận form của một sản phẩm. */
    static final int MIN_FIT_VOTES = 3;
    /** Số khách có số đo giống để đưa ra thống kê / ghi đè gợi ý. */
    static final int MIN_SIMILAR_TO_SHOW = 2;
    static final int MIN_SIMILAR_TO_OVERRIDE = 3;
    static final int SIMILAR_BODY_CM_KG = 4;
    static final int SIMILAR_FOOT_MM = 5;

    public record Profile(Integer heightCm, Integer weightKg, Integer footMm, String fitPreference) {}

    /** Đếm đánh giá Chật / Vừa / Rộng. */
    public record FitStats(int tight, int fit, int loose) {
        public static final FitStats EMPTY = new FitStats(0, 0, 0);

        public int total() {
            return tight + fit + loose;
        }

        /** +1 nếu form nhỏ (quá nửa thấy chật), −1 nếu form rộng, 0 nếu chưa đủ dữ liệu hoặc vừa. */
        public int offset() {
            if (total() < MIN_FIT_VOTES) return 0;
            if (tight * 2 > total()) return 1;
            if (loose * 2 > total()) return -1;
            return 0;
        }
    }

    /**
     * Một món khách đã nhận. fit: TIGHT / TRUE / LOOSE, null = không đánh giá. explicit = khách tự đánh
     * giá (mạnh hơn suy ra từ lý do đổi trả hoặc từ việc giữ lại món hàng).
     */
    public record PastItem(int sizeIndex, String fit, boolean explicit, int productOffset) {}

    /** Một khách khác đã mua sản phẩm này, thấy vừa, kèm số đo lúc đánh giá. */
    public record Peer(String size, Integer heightCm, Integer weightKg, Integer footMm) {}

    public record SizeCount(String size, int count) {}

    public record Advice(
            String sizeType,
            /** BODY = thiếu chiều cao/cân nặng, FOOT = thiếu chiều dài bàn chân, null = đủ. */
            String missing,
            String size,
            /** HIGH / MEDIUM / LOW */
            String confidence,
            boolean inStock,
            List<String> reasons,
            FitStats productFit,
            List<SizeCount> similar) {}

    public static Advice advise(
            SizeType type,
            Map<String, Integer> stockBySize,
            Profile profile,
            List<PastItem> history,
            FitStats productFit,
            List<Peer> peers) {
        List<String> scale = SizeChart.scale(type);
        List<Integer> offered = stockBySize.keySet().stream()
                .map(s -> SizeChart.indexOf(type, s))
                .filter(i -> i >= 0)
                .distinct()
                .sorted()
                .toList();
        if (type == SizeType.NONE || offered.isEmpty())
            return new Advice(SizeType.NONE.name(), null, null, null, false, List.of(), FitStats.EMPTY, List.of());

        List<String> reasons = new ArrayList<>();
        String missing = type == SizeType.SHOE ? "FOOT" : "BODY";

        // 1. Bảng size
        Integer chart = SizeChart.chartIndex(type, profile.heightCm(), profile.weightKg(), profile.footMm());
        if (chart != null) {
            missing = null;
            int shift = SizeChart.preferenceShift(type, profile.fitPreference());
            chart = SizeChart.clamp(type, chart + shift);
            reasons.add(chartReason(type, profile, scale.get(chart), shift));
        }

        // 2. Lịch sử của chính khách
        double weightSum = 0, indexSum = 0, explicitWeight = 0;
        for (PastItem p : history) {
            double w = p.explicit() ? 1.0 : 0.5;
            int fitShift = "TIGHT".equals(p.fit()) ? 1 : "LOOSE".equals(p.fit()) ? -1 : 0;
            indexSum += w * (p.sizeIndex() + fitShift - p.productOffset());
            weightSum += w;
            if (p.explicit()) explicitWeight += w;
        }
        Integer personal = weightSum == 0 ? null : (int) Math.round(indexSum / weightSum);
        if (personal != null) {
            personal = SizeChart.clamp(type, personal);
            reasons.add(String.format(
                    "Từ %d món %s bạn đã mua trước đây, size hợp với bạn thường là %s.",
                    history.size(), typeLabel(type), scale.get(personal)));
        }

        if (chart == null && personal == null)
            return new Advice(type.name(), missing, null, null, false, List.of(), productFit, List.of());

        int generic;
        if (personal == null) generic = chart;
        else if (chart == null || explicitWeight >= 2) generic = personal;
        else generic = (int) Math.ceil((chart + personal) / 2.0);

        // 3. Form của sản phẩm này
        int offset = productFit.offset();
        if (offset != 0)
            reasons.add(String.format(
                    "Mẫu này form %s: %d/%d khách thấy %s, nên %s 1 size.",
                    offset > 0 ? "nhỏ" : "rộng",
                    offset > 0 ? productFit.tight() : productFit.loose(),
                    productFit.total(),
                    offset > 0 ? "chật" : "rộng",
                    offset > 0 ? "tăng" : "giảm"));
        int target = SizeChart.clamp(type, generic + offset);

        // 4. Khách có số đo giống bạn
        List<SizeCount> similar = similarSizes(type, profile, peers);
        boolean similarOverride = false;
        if (!similar.isEmpty() && similar.get(0).count() >= MIN_SIMILAR_TO_SHOW) {
            SizeCount top = similar.get(0);
            reasons.add(String.format(
                    "%d khách có số đo giống bạn đã mua mẫu này size %s và thấy vừa.", top.count(), top.size()));
            int topIndex = SizeChart.indexOf(type, top.size());
            if (top.count() >= MIN_SIMILAR_TO_OVERRIDE && topIndex >= 0 && topIndex != target) {
                target = topIndex;
                similarOverride = true;
            }
        }

        // Chọn size gần nhất mà sản phẩm có bán (bằng nhau thì chọn size lớn hơn)
        final int wanted = target;
        int chosen = offered.stream()
                .min(Comparator.comparingInt((Integer i) -> Math.abs(i - wanted)).thenComparing(i -> -i))
                .orElseThrow();
        if (chosen != wanted)
            reasons.add(String.format(
                    "Mẫu này không có size %s, size gần nhất là %s.", scale.get(wanted), scale.get(chosen)));

        String chosenSize = scale.get(chosen);
        boolean inStock = stockBySize.entrySet().stream()
                .anyMatch(e -> SizeChart.indexOf(type, e.getKey()) == chosen && e.getValue() > 0);

        String confidence;
        if (similarOverride || explicitWeight >= 2) confidence = "HIGH";
        else if (personal != null || productFit.total() >= MIN_FIT_VOTES) confidence = "MEDIUM";
        else confidence = "LOW";

        return new Advice(type.name(), missing, chosenSize, confidence, inStock, reasons, productFit, similar);
    }

    /** Size mà các khách có số đo gần giống đã chọn (và thấy vừa), nhiều nhất trước. */
    static List<SizeCount> similarSizes(SizeType type, Profile me, List<Peer> peers) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (Peer p : peers) {
            if (!isSimilar(type, me, p)) continue;
            int i = SizeChart.indexOf(type, p.size());
            if (i < 0) continue;
            counts.merge(SizeChart.sizeAt(type, i), 1, Integer::sum);
        }
        return counts.entrySet().stream()
                .map(e -> new SizeCount(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingInt(SizeCount::count).reversed())
                .toList();
    }

    private static boolean isSimilar(SizeType type, Profile me, Peer p) {
        if (type == SizeType.SHOE)
            return me.footMm() != null && p.footMm() != null
                    && Math.abs(me.footMm() - p.footMm()) <= SIMILAR_FOOT_MM;
        return me.heightCm() != null && me.weightKg() != null && p.heightCm() != null && p.weightKg() != null
                && Math.abs(me.heightCm() - p.heightCm()) <= SIMILAR_BODY_CM_KG
                && Math.abs(me.weightKg() - p.weightKg()) <= SIMILAR_BODY_CM_KG;
    }

    private static String chartReason(SizeType type, Profile p, String size, int shift) {
        String base = type == SizeType.SHOE
                ? String.format("Bàn chân dài %.1f cm ứng với size %s theo bảng size.", p.footMm() / 10.0, size)
                : String.format("Với %d cm, %d kg, bảng size gợi ý %s", p.heightCm(), p.weightKg(), size);
        if (type == SizeType.SHOE) return base;
        if (shift > 0) return base + " (đã tăng 1 size vì bạn thích mặc rộng).";
        if (shift < 0) return base + " (đã giảm 1 size vì bạn thích mặc ôm).";
        return base + ".";
    }

    static String typeLabel(SizeType type) {
        return switch (type) {
            case TOP -> "áo";
            case BOTTOM -> "quần";
            case SHOE -> "giày dép";
            case NONE -> "";
        };
    }

    // ---------------------------------------------------------------- Suy ra Chật/Rộng từ lý do đổi trả

    private static final Set<String> TIGHT_WORDS = Set.of("chat", "nho", "bo", "ngan", "chiet");
    private static final Set<String> LOOSE_WORDS = Set.of("rong", "lon", "to", "dai", "thung");

    /** TIGHT / LOOSE nếu lý do đổi trả nói về size (vd "áo bị chật"), ngược lại null. */
    public static String fitFromReturnReason(String reason) {
        Set<String> words = SizeChart.words(reason);
        boolean tight = words.stream().anyMatch(TIGHT_WORDS::contains);
        boolean loose = words.stream().anyMatch(LOOSE_WORDS::contains);
        if (tight == loose) return null; // không nói gì về size, hoặc mâu thuẫn
        return tight ? "TIGHT" : "LOOSE";
    }
}
