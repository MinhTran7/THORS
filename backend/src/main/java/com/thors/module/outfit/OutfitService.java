package com.thors.module.outfit;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.fitting.dto.BodyProfileRequest;
import com.thors.module.fitting.dto.SizeRecommendation;
import com.thors.module.fitting.repository.SizeChartRepository;
import com.thors.module.fitting.service.SizeGuideService;
import com.thors.module.outfit.OutfitComposer.Candidate;
import com.thors.module.outfit.OutfitDtos.Alternative;
import com.thors.module.outfit.OutfitDtos.OutfitItem;
import com.thors.module.outfit.OutfitDtos.OutfitRequest;
import com.thors.module.outfit.OutfitDtos.OutfitResponse;
import com.thors.module.outfit.OutfitDtos.OutfitView;
import com.thors.module.outfit.OutfitTags.Role;
import com.thors.module.shop.repository.ShopRepository;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;

/**
 * Phối đồ cho khách: lấy sản phẩm đang bán, chọn size (theo số đo) + màu còn hàng cho từng sản phẩm,
 * rồi để OutfitComposer ghép bộ trong ngân sách. Giá dùng giá niêm yết của biến thể (chưa trừ khuyến mãi).
 */
@Service
public class OutfitService {

    private static final long MIN_BUDGET = 50_000;
    private static final long MAX_BUDGET = 100_000_000;
    private static final int MAX_OUTFITS = 5;
    /** Số món thay thế tối đa cho khách chọn khi "Đổi món". */
    private static final int MAX_ALTERNATIVES = 12;

    private final OutfitRepository repo;
    private final ShopRepository shop;
    private final SizeChartRepository charts;
    private final SizeGuideService sizes;

    public OutfitService(OutfitRepository repo, ShopRepository shop, SizeChartRepository charts, SizeGuideService sizes) {
        this.repo = repo;
        this.shop = shop;
        this.charts = charts;
        this.sizes = sizes;
    }

    /** Các món đã lọc (còn hàng, đúng giới tính, size, màu) + món khách đang giữ + phong cách thích. */
    private record Pool(List<Candidate> candidates, Map<Role, Candidate> locked, Set<String> liked, boolean usedBody) {
    }

    /** @param actor khách đang đăng nhập (null = khách vãng lai) */
    public OutfitResponse suggest(OutfitRequest r, Account actor) {
        Pool pool = pool(r, actor);
        List<Candidate> candidates = pool.candidates();
        Map<Role, Candidate> locked = pool.locked();
        List<OutfitComposer.Outfit> outfits = OutfitComposer.compose(candidates, r.occasion(), pool.liked(), r.budget(),
                locked, MAX_OUTFITS);
        boolean usedBody = pool.usedBody();
        if (outfits.isEmpty()) {
            long cheapest = OutfitComposer.cheapestTotal(candidates, locked);
            String message = cheapest < 0
                    ? "Cửa hàng chưa có đủ sản phẩm phù hợp để phối một bộ (cần áo + quần, hoặc đầm)."
                    : cheapest > r.budget()
                            ? "Chưa có bộ nào trong ngân sách " + vnd(r.budget()) + ". Bộ rẻ nhất khoảng " + vnd(cheapest) + "."
                            : "Chưa tìm được bộ phù hợp, hãy thử dịp hoặc ngân sách khác.";
            return new OutfitResponse(List.of(), message, usedBody);
        }
        return new OutfitResponse(outfits.stream().map(o -> view(o, r, usedBody)).toList(), null, usedBody);
    }

    /**
     * "Đổi món": các món khách có thể chọn thay cho một vai trò (áo / quần / đầm / giày) trong bộ đang xem,
     * điểm cao nhất trước. keepDetailIds = các món còn lại của bộ (giữ nguyên).
     *
     * @param role vai trò cần đổi (TOP, BOTTOM, DRESS, SHOES)
     * @param currentProductId món đang mặc ở vai trò đó (không đưa vào danh sách)
     */
    public List<Alternative> alternatives(OutfitRequest r, String role, Integer currentProductId, Account actor) {
        Role wanted;
        try {
            wanted = Role.valueOf(role == null ? "" : role);
        } catch (IllegalArgumentException e) {
            throw invalid("Món cần đổi không hợp lệ.");
        }
        Pool pool = pool(r, actor);
        long keptTotal = pool.locked().entrySet().stream()
                .filter(e -> e.getKey() != wanted)
                .mapToLong(e -> e.getValue().price()).sum();
        return pool.candidates().stream()
                .filter(c -> c.role() == wanted)
                .filter(c -> currentProductId == null || c.productId() != currentProductId)
                .sorted(Comparator.comparingDouble((Candidate c) -> -OutfitComposer.itemScore(c, r.occasion(), pool.liked()))
                        .thenComparingLong(Candidate::price))
                .limit(MAX_ALTERNATIVES)
                .map(c -> new Alternative(item(c, pool.usedBody()), keptTotal + c.price(), keptTotal + c.price() <= r.budget(),
                        c.occasions().contains(r.occasion())))
                .toList();
    }

    private Pool pool(OutfitRequest r, Account actor) {
        if (r == null || r.occasion() == null || !OutfitTags.OCCASIONS.containsKey(r.occasion())) {
            throw invalid("Vui lòng chọn dịp mặc.");
        }
        if (r.budget() == null || r.budget() < MIN_BUDGET || r.budget() > MAX_BUDGET) {
            throw invalid("Ngân sách phải từ 50.000 ₫ đến 100.000.000 ₫.");
        }

        BodyProfileRequest body = sizes.savedProfile(actor).orElse(null);
        Optional<OutfitRepository.StyleProfileRow> saved = actor == null || !"CUSTOMER".equals(actor.role())
                ? Optional.empty()
                : repo.styleProfile(actor.id());
        // Giới tính bắt buộc (để không trộn đồ nam / nữ): khách chọn trên trang, hoặc theo số đo đã lưu
        String gender = r.gender() != null && !r.gender().isBlank() ? r.gender() : body == null ? null : body.gender();
        if (!"MALE".equals(gender) && !"FEMALE".equals(gender)) throw invalid("Hãy chọn phối đồ nam hay nữ.");
        Set<String> liked = new LinkedHashSet<>(r.styles() != null && !r.styles().isEmpty()
                ? r.styles()
                : saved.map(s -> OutfitTags.parseCodes(s.preferredStyles(), OutfitTags.STYLES)).orElse(List.of()));
        List<String> avoid = r.avoidColors() != null && !r.avoidColors().isEmpty()
                ? r.avoidColors()
                : saved.map(s -> s.avoidColors() == null ? List.<String>of() : List.of(s.avoidColors().split(","))).orElse(List.of());
        Set<Integer> keep = new HashSet<>(r.keepDetailIds() == null ? List.of() : r.keepDetailIds());
        Set<Integer> excluded = new HashSet<>(r.excludeProductIds() == null ? List.of() : r.excludeProductIds());

        List<Candidate> candidates = new ArrayList<>();
        Map<Role, Candidate> locked = new EnumMap<>(Role.class);
        Map<Integer, OutfitRepository.StyleRow> styles = repo.allStyles();
        for (var p : repo.activeProducts()) {
            var info = charts.categoryInfo(p.productId());
            if (info == null) continue;
            // Đối tượng: theo tên sản phẩm nếu rõ ("nữ", "nam & nữ"...), không thì theo danh mục
            String target = OutfitTags.resolveTarget(p.productName(), info.targetGroup());
            if ("KIDS".equals(info.targetGroup()) || !genderAllows(gender, target)) continue;
            Role role = OutfitTags.roleOf(info.names());
            if (role == Role.NONE || role == Role.ACCESSORY) continue;

            List<Map<String, Object>> variants = shop.findVariants(p.productId()).stream()
                    .filter(v -> v.get("stock") instanceof Number n && n.intValue() > 0 && v.get("price") != null)
                    .toList();
            if (variants.isEmpty()) continue;

            var style = styles.get(p.productId());
            Set<String> occasions = style != null && style.occasions() != null
                    ? new LinkedHashSet<>(OutfitTags.parseCodes(style.occasions(), OutfitTags.OCCASIONS))
                    : OutfitTags.guessOccasions(p.productName(), info.names());
            Set<String> tags = style != null && style.styles() != null
                    ? new LinkedHashSet<>(OutfitTags.parseCodes(style.styles(), OutfitTags.STYLES))
                    : OutfitTags.guessStyles(p.productName(), info.names());
            String image = shop.findImageUrls(p.productId()).stream().findFirst().orElse(null);

            // Món khách đang giữ: dùng đúng biến thể đó
            var kept = variants.stream().filter(v -> keep.contains(detailId(v))).findFirst();
            if (kept.isPresent()) {
                locked.put(role, candidate(p, image, role, kept.get(), occasions, tags, null));
                continue;
            }
            if (excluded.contains(p.productId())) continue;

            // Size: theo số đo (size gợi ý còn hàng, hoặc size thay thế); chưa có số đo -> chọn tạm
            String size = null;
            String confidence = null;
            SizeRecommendation rec = body == null ? null : sizes.recommendFor(p.productId(), variants, info, body);
            if (rec != null && rec.recommendedSize() != null) {
                size = rec.inStock() ? rec.recommendedSize() : rec.alternativeSize();
                confidence = rec.inStock() ? rec.confidence() : "LOW";
                if (size == null) continue; // không còn size nào gần vừa
            }
            final String wanted = size;
            // Màu: bỏ màu khách tránh; ưu tiên màu trung tính, rồi biến thể còn nhiều hàng
            var pick = variants.stream()
                    .filter(v -> wanted == null || wanted.equals(String.valueOf(v.get("size"))))
                    .filter(v -> !OutfitTags.matchesAny(String.valueOf(v.get("color")), avoid))
                    .min(Comparator.comparing((Map<String, Object> v) -> !OutfitTags.isNeutral(String.valueOf(v.get("color"))))
                            .thenComparing(v -> -((Number) v.get("stock")).intValue()));
            if (pick.isEmpty()) continue;
            candidates.add(candidate(p, image, role, pick.get(), occasions, tags, confidence));
        }
        return new Pool(candidates, locked, liked, body != null);
    }

    private static OutfitItem item(Candidate c, boolean usedBody) {
        return new OutfitItem(c.role().name(), OutfitTags.ROLE_LABELS.get(c.role()), c.productId(), c.productName(),
                c.imageUrl(), c.detailId(), c.size(), c.color(), c.price(), sizeNote(c, usedBody));
    }

    private static boolean genderAllows(String gender, String target) {
        if (gender == null || target == null || "UNISEX".equals(target)) return true;
        if ("MALE".equals(gender)) return "MEN".equals(target);
        if ("FEMALE".equals(gender)) return "WOMEN".equals(target);
        return true;
    }

    private static int detailId(Map<String, Object> v) {
        return ((Number) v.get("detailId")).intValue();
    }

    private static Candidate candidate(OutfitRepository.ProductRow p, String image, Role role, Map<String, Object> v,
            Set<String> occasions, Set<String> styles, String confidence) {
        long price = v.get("price") instanceof BigDecimal b ? b.longValue() : ((Number) v.get("price")).longValue();
        return new Candidate(p.productId(), p.productName(), image, role, detailId(v), String.valueOf(v.get("size")),
                String.valueOf(v.get("color")), price, occasions, styles, confidence);
    }

    private static OutfitView view(OutfitComposer.Outfit o, OutfitRequest r, boolean usedBody) {
        List<OutfitItem> items = o.items().stream().map(c -> item(c, usedBody)).toList();

        List<String> reasons = new ArrayList<>();
        long matched = o.items().stream().filter(c -> c.occasions().contains(r.occasion())).count();
        String occasion = OutfitTags.OCCASIONS.get(r.occasion()).toLowerCase(Locale.ROOT);
        reasons.add(matched == o.items().size()
                ? "Cả bộ hợp dịp " + occasion
                : matched + "/" + o.items().size() + " món hợp dịp " + occasion);
        if (OutfitComposer.colorScore(o.items()) > 0) reasons.add("Phối màu trung tính, dễ mặc");
        if (!usedBody) reasons.add("Chưa có số đo của bạn: size đang chọn tạm, hãy kiểm tra trước khi đặt");
        else if (o.items().stream().allMatch(c -> "HIGH".equals(c.sizeConfidence()) || "MEDIUM".equals(c.sizeConfidence()))) {
            reasons.add("Size các món đều hợp số đo của bạn");
        }
        long remaining = r.budget() - o.total();
        if (remaining > 0) reasons.add("Còn dư " + vnd(remaining) + " so với ngân sách");
        return new OutfitView(items, o.total(), remaining, reasons);
    }

    private static String sizeNote(Candidate c, boolean usedBody) {
        if (!usedBody || c.sizeConfidence() == null) return usedBody ? "Size " + c.size() : "Size " + c.size() + " (chọn tạm)";
        return switch (c.sizeConfidence()) {
            case "HIGH" -> "Size " + c.size() + " vừa với bạn";
            case "MEDIUM" -> "Size " + c.size() + " khá vừa";
            default -> "Size " + c.size() + " (có thể không vừa)";
        };
    }

    static String vnd(long amount) {
        return String.format(Locale.forLanguageTag("vi-VN"), "%,d ₫", amount);
    }

    private static ApiException invalid(String message) {
        return new ApiException(400, "OUTFIT_INVALID", message);
    }
}
