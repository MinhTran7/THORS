package com.thors.module.outfit;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Thẻ dùng để phối đồ: dịp mặc, phong cách, vai trò trong bộ đồ, màu trung tính.
 * Sản phẩm chưa được Owner gắn thẻ -> đoán theo tên sản phẩm + tên danh mục (không phân biệt dấu).
 */
public final class OutfitTags {

    private OutfitTags() {
    }

    /** Dịp mặc (mã -> nhãn tiếng Việt). Thứ tự = thứ tự hiển thị. */
    public static final Map<String, String> OCCASIONS = ordered(
            "WORK", "Đi làm",
            "PARTY", "Đi tiệc / đám cưới",
            "DATE", "Hẹn hò",
            "CASUAL", "Dạo phố",
            "SPORT", "Thể thao",
            "TRAVEL", "Du lịch");

    /** Phong cách (mã -> nhãn). */
    public static final Map<String, String> STYLES = ordered(
            "BASIC", "Cơ bản",
            "ELEGANT", "Thanh lịch",
            "STREET", "Đường phố",
            "SPORTY", "Năng động",
            "CUTE", "Dễ thương",
            "VINTAGE", "Cổ điển");

    /** Vai trò trong bộ đồ, suy ra từ danh mục. */
    public enum Role { TOP, BOTTOM, DRESS, SHOES, ACCESSORY, NONE }

    public static final Map<Role, String> ROLE_LABELS = Map.of(
            Role.TOP, "Áo", Role.BOTTOM, "Quần / chân váy", Role.DRESS, "Đầm / váy liền",
            Role.SHOES, "Giày dép", Role.ACCESSORY, "Phụ kiện", Role.NONE, "Khác");

    // Từ khóa (đã bỏ dấu, viết thường) -> thẻ. So theo nguyên từ để "da" (da thật) không khớp "dam".
    private static final Map<String, List<String>> OCCASION_WORDS = Map.of(
            "WORK", List.of("so mi", "cong so", "quan au", "au", "kaki", "giay da", "vest", "blazer", "polo", "chan vay", "cao got"),
            "PARTY", List.of("dam", "vay", "cao got", "giay da", "vest", "lua", "da hoi", "tiec", "ren"),
            "DATE", List.of("dam", "vay", "baby doll", "cao got", "so mi", "polo", "giay da", "ren", "lua"),
            "CASUAL", List.of("thun", "phong", "jean", "short", "hoodie", "hooldy", "sneaker", "the thao", "dep", "sandal",
                    "balo", "kaki", "polo", "basic", "tui xach"),
            "SPORT", List.of("the thao", "giu nhiet", "sneaker", "jogger", "gym"),
            "TRAVEL", List.of("short", "dep", "sandal", "balo", "thun", "phong", "jean", "sneaker", "the thao"));

    private static final Map<String, List<String>> STYLE_WORDS = Map.of(
            "BASIC", List.of("basic", "thun", "phong", "co tron", "classic", "tron"),
            "ELEGANT", List.of("so mi", "au", "vest", "lua", "da", "cao got", "dam", "classic", "tui xach"),
            "STREET", List.of("jean", "hoodie", "hooldy", "oversize", "sneaker", "cargo"),
            "SPORTY", List.of("the thao", "giu nhiet", "sneaker", "jogger"),
            "CUTE", List.of("baby doll", "hello kitty", "gau", "no", "charm", "hoa"),
            "VINTAGE", List.of("vintage", "retro"));

    private static final List<String> NEUTRAL_COLORS = List.of(
            "den", "trang", "xam", "ghi", "be", "kem", "nau", "navy", "xanh than", "bac", "black", "white", "grey",
            "gray", "beige");

    public static String fold(String s) {
        if (s == null) return "";
        String noMarks = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        return noMarks.replace('đ', 'd').replace('Đ', 'D').toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
    }

    private static boolean hasWord(String folded, String word) {
        return (" " + folded + " ").contains(" " + word + " ");
    }

    /** Vai trò theo tên danh mục (con -> cha). */
    public static Role roleOf(List<String> categoryNames) {
        String t = fold(String.join(" ", categoryNames));
        if (hasAny(t, "giay", "dep", "sandal", "boot", "sneaker", "guoc")) return Role.SHOES;
        if (hasAny(t, "dam", "vay lien", "dam lien")) return Role.DRESS;
        if (hasAny(t, "quan", "jean", "short", "chan vay", "vay")) return Role.BOTTOM;
        if (hasAny(t, "ao", "so mi", "hoodie", "polo", "sweater")) return Role.TOP;
        if (hasAny(t, "tui", "tui xach", "balo", "vi", "that lung", "phu kien", "mu", "non", "kinh", "khan")) return Role.ACCESSORY;
        return Role.NONE;
    }

    private static boolean hasAny(String folded, String... words) {
        return Arrays.stream(words).anyMatch(w -> hasWord(folded, w));
    }

    /**
     * Đối tượng (MEN / WOMEN / UNISEX) đọc từ tên sản phẩm, null nếu tên không nói rõ.
     * Ưu tiên hơn đối tượng của danh mục (danh mục có thể gắn chung chung hoặc gắn nhầm,
     * vd "Áo baby doll" nằm trong danh mục "Áo" gắn Nam).
     */
    public static String targetFromName(String productName) {
        String t = fold(productName);
        if (hasAny(t, "unisex", "nam nu", "nu nam")) return "UNISEX";
        if (hasAny(t, "nu", "baby doll", "vay", "dam", "cao got", "bra")) return "WOMEN";
        if (hasAny(t, "nam")) return "MEN";
        return null;
    }

    /** Đối tượng cuối cùng: theo tên nếu rõ, không thì theo danh mục (null = chưa rõ, dùng chung). */
    public static String resolveTarget(String productName, String categoryTarget) {
        String byName = targetFromName(productName);
        return byName != null ? byName : categoryTarget;
    }

    /** Đoán dịp mặc từ tên sản phẩm + danh mục; không đoán được -> "Dạo phố". */
    public static Set<String> guessOccasions(String productName, List<String> categoryNames) {
        Set<String> found = guess(OCCASION_WORDS, OCCASIONS, productName, categoryNames);
        return found.isEmpty() ? Set.of("CASUAL") : found;
    }

    /** Đoán phong cách; không đoán được -> "Cơ bản". */
    public static Set<String> guessStyles(String productName, List<String> categoryNames) {
        Set<String> found = guess(STYLE_WORDS, STYLES, productName, categoryNames);
        return found.isEmpty() ? Set.of("BASIC") : found;
    }

    private static Set<String> guess(Map<String, List<String>> words, Map<String, String> order, String name,
            List<String> categoryNames) {
        String t = fold(name + " " + String.join(" ", categoryNames));
        Set<String> out = new LinkedHashSet<>();
        for (String code : order.keySet()) {
            if (words.getOrDefault(code, List.of()).stream().anyMatch(w -> hasWord(t, w))) out.add(code);
        }
        return out;
    }

    /** Màu trung tính (đen, trắng, xám, be, nâu, navy...) dễ phối với mọi màu. */
    public static boolean isNeutral(String color) {
        String c = fold(color);
        return NEUTRAL_COLORS.stream().anyMatch(n -> hasWord(c, n));
    }

    /** Màu khách muốn tránh có xuất hiện trong tên màu không (vd tránh "đỏ" -> loại "Đỏ đô"). */
    public static boolean matchesAny(String color, List<String> avoid) {
        String c = fold(color);
        return avoid.stream().map(OutfitTags::fold).filter(a -> !a.isBlank()).anyMatch(a -> hasWord(c, a) || c.equals(a));
    }

    /** "WORK,PARTY" -> [WORK, PARTY], bỏ mã không hợp lệ / trùng. */
    public static List<String> parseCodes(String csv, Map<String, String> allowed) {
        if (csv == null || csv.isBlank()) return List.of();
        return Arrays.stream(csv.split(",")).map(String::trim).map(s -> s.toUpperCase(Locale.ROOT))
                .filter(allowed::containsKey).distinct().toList();
    }

    public static String joinCodes(List<String> codes, Map<String, String> allowed) {
        if (codes == null) return null;
        String joined = codes.stream().map(s -> s == null ? "" : s.trim().toUpperCase(Locale.ROOT))
                .filter(allowed::containsKey).distinct().collect(Collectors.joining(","));
        return joined.isEmpty() ? null : joined;
    }

    private static Map<String, String> ordered(String... kv) {
        Map<String, String> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return java.util.Collections.unmodifiableMap(m);
    }
}
