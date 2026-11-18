package com.thors.module.outfit;

import com.thors.module.outfit.OutfitTags.Role;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Thuật toán phối đồ theo luật (không đụng DB, dễ test).
 *
 * <p>1. Mỗi món (đã chọn sẵn size + màu còn hàng) có điểm riêng: hợp dịp +4, mỗi phong cách khách thích +2,
 * size vừa +2 / hơi lệch +1 / lệch nhiều -1.
 * <br>2. Mỗi vai trò (áo, quần, đầm, giày) giữ tối đa {@value #PER_ROLE} món điểm cao nhất (bằng điểm: rẻ hơn trước).
 * <br>3. Ghép theo 2 khuôn: áo + quần/chân váy + giày, hoặc đầm + giày (không có giày hợp thì bỏ giày).
 * <br>4. Bộ vượt ngân sách bị loại. Điểm bộ = tổng điểm món + phối màu (tối đa 1 màu nổi, còn lại trung tính: +2;
 * từ 3 màu nổi: -2) + chút điểm cho bộ dùng gần hết ngân sách (mua được đồ tốt hơn).
 * <br>5. Trả về các bộ điểm cao nhất, không trùng nhau.
 */
public final class OutfitComposer {

    private OutfitComposer() {
    }

    public static final int PER_ROLE = 6;

    /** Một món có thể đưa vào bộ: một biến thể cụ thể (size + màu) của một sản phẩm. */
    public record Candidate(
            int productId,
            String productName,
            String imageUrl,
            Role role,
            int detailId,
            String size,
            String color,
            long price,
            Set<String> occasions,
            Set<String> styles,
            String sizeConfidence) { // HIGH | MEDIUM | LOW | null (chưa có số đo / không có bảng size)
    }

    public record Outfit(List<Candidate> items, long total, double score) {
    }

    private static final List<List<Role>> TEMPLATES = List.of(
            List.of(Role.TOP, Role.BOTTOM, Role.SHOES),
            List.of(Role.DRESS, Role.SHOES),
            List.of(Role.TOP, Role.BOTTOM),
            List.of(Role.DRESS));

    public static double itemScore(Candidate c, String occasion, Set<String> likedStyles) {
        double s = c.occasions().contains(occasion) ? 4 : 0;
        s += c.styles().stream().filter(likedStyles::contains).count() * 2.0;
        if ("HIGH".equals(c.sizeConfidence())) s += 2;
        else if ("MEDIUM".equals(c.sizeConfidence())) s += 1;
        else if ("LOW".equals(c.sizeConfidence())) s -= 1;
        return s;
    }

    /**
     * @param candidates các món còn hàng (đã lọc giới tính, màu tránh, món bị loại)
     * @param locked vai trò -> món khách muốn giữ (khi bấm "Đổi món" ở một món khác)
     * @param limit số bộ tối đa trả về
     */
    public static List<Outfit> compose(List<Candidate> candidates, String occasion, Set<String> likedStyles,
            long budget, Map<Role, Candidate> locked, int limit) {
        Map<Role, List<Candidate>> byRole = candidates.stream()
                .collect(Collectors.groupingBy(Candidate::role));
        Map<Role, List<Candidate>> top = new java.util.EnumMap<>(Role.class);
        for (Role role : Role.values()) {
            if (locked.containsKey(role)) {
                top.put(role, List.of(locked.get(role)));
                continue;
            }
            top.put(role, byRole.getOrDefault(role, List.of()).stream()
                    .sorted(Comparator.comparingDouble((Candidate c) -> -itemScore(c, occasion, likedStyles))
                            .thenComparingLong(Candidate::price))
                    .limit(PER_ROLE).toList());
        }

        List<Outfit> all = new ArrayList<>();
        boolean fullFound = false;
        for (List<Role> template : TEMPLATES) {
            // Khuôn không giày chỉ dùng khi không ghép được bộ có giày nào
            if (!template.contains(Role.SHOES) && fullFound) continue;
            // Đang giữ một món thì khuôn phải chứa vai trò của món đó
            if (!template.containsAll(locked.keySet())) continue;
            if (template.stream().anyMatch(r -> top.get(r).isEmpty())) continue;
            int before = all.size();
            combine(template, 0, new ArrayList<>(), top, occasion, likedStyles, budget, all);
            if (template.contains(Role.SHOES) && all.size() > before) fullFound = true;
        }

        all.sort(Comparator.comparingDouble((Outfit o) -> -o.score()).thenComparingLong(Outfit::total));
        List<Outfit> result = new ArrayList<>();
        Set<Set<Integer>> seen = new HashSet<>();
        for (Outfit o : all) {
            if (!seen.add(o.items().stream().map(Candidate::productId).collect(Collectors.toSet()))) continue;
            result.add(o);
            if (result.size() >= limit) break;
        }
        return result;
    }

    private static void combine(List<Role> template, int i, List<Candidate> picked, Map<Role, List<Candidate>> top,
            String occasion, Set<String> liked, long budget, List<Outfit> out) {
        if (i == template.size()) {
            long total = picked.stream().mapToLong(Candidate::price).sum();
            if (total > budget) return;
            double score = picked.stream().mapToDouble(c -> itemScore(c, occasion, liked)).sum()
                    + colorScore(picked) + (budget > 0 ? (double) total / budget : 0);
            out.add(new Outfit(List.copyOf(picked), total, Math.round(score * 100) / 100.0));
            return;
        }
        for (Candidate c : top.get(template.get(i))) {
            picked.add(c);
            combine(template, i + 1, picked, top, occasion, liked, budget, out);
            picked.remove(picked.size() - 1);
        }
    }

    /** Tối đa 1 màu nổi (còn lại trung tính) = dễ mặc: +2; 3 màu nổi trở lên = rối: -2. */
    public static double colorScore(List<Candidate> items) {
        long bold = items.stream().filter(c -> !OutfitTags.isNeutral(c.color())).count();
        return bold <= 1 ? 2 : bold >= 3 ? -2 : 0;
    }

    /** Tổng tiền bộ rẻ nhất có thể ghép (để báo khi ngân sách quá thấp); -1 nếu không ghép được bộ nào. */
    public static long cheapestTotal(List<Candidate> candidates, Map<Role, Candidate> locked) {
        Map<Role, Long> min = new java.util.EnumMap<>(Role.class);
        for (Candidate c : candidates) min.merge(c.role(), c.price(), Math::min);
        locked.forEach((r, c) -> min.put(r, c.price()));
        long best = -1;
        for (List<Role> t : TEMPLATES) {
            if (!t.containsAll(locked.keySet()) || !t.stream().allMatch(min::containsKey)) continue;
            long sum = t.stream().mapToLong(min::get).sum();
            if (best < 0 || sum < best) best = sum;
        }
        return best;
    }
}
