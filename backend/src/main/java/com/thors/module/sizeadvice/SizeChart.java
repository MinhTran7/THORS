package com.thors.module.sizeadvice;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Bảng size chung và cách phân loại sản phẩm theo kiểu size. Đây là nơi DUY NHẤT chứa bảng size:
 * frontend lấy kết quả qua API, không tự tính, để hai bên không lệch nhau.
 *
 * <p>Mỗi kiểu size có một thang (scale) xếp từ nhỏ tới lớn; mọi phép tính gợi ý làm trên chỉ số
 * của thang này, nên "tăng 1 size" chỉ là +1.
 */
public final class SizeChart {
    private SizeChart() {}

    public enum SizeType {
        /** Áo, áo khoác: S/M/L... theo chiều cao + cân nặng. */
        TOP,
        /** Quần, váy: size số theo vòng eo, chủ yếu theo cân nặng. */
        BOTTOM,
        /** Giày dép: size EU theo chiều dài bàn chân. */
        SHOE,
        /** Túi xách, phụ kiện, freesize: không gợi ý size. */
        NONE
    }

    public static final List<String> TOP_SCALE = List.of("XS", "S", "M", "L", "XL", "XXL", "3XL");
    // Cận trên (tính cả cận) của chiều cao / cân nặng cho từng size áo, cùng thứ tự với TOP_SCALE.
    private static final int[] TOP_MAX_HEIGHT = {157, 163, 169, 175, 180, 185, Integer.MAX_VALUE};
    private static final int[] TOP_MAX_WEIGHT = {47, 55, 62, 70, 78, 86, Integer.MAX_VALUE};

    public static final List<String> BOTTOM_SCALE =
            List.of("26", "27", "28", "29", "30", "31", "32", "33", "34", "36", "38");
    private static final int[] BOTTOM_MAX_WEIGHT = {44, 48, 52, 57, 62, 67, 72, 77, 83, 90, Integer.MAX_VALUE};
    /** Cao hơn mức này thì quần nhích lên 1 size cho đủ dài. */
    private static final int BOTTOM_TALL_CM = 180;

    public static final List<String> SHOE_SCALE =
            List.of("34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46");
    // Size EU n vừa bàn chân dài tới 225 + 5 × (n − 35) mm (35 = 22,5 cm, 40 = 25 cm...).
    private static int shoeMaxFootMm(int index) {
        return index == SHOE_SCALE.size() - 1 ? Integer.MAX_VALUE : 220 + 5 * index;
    }

    public static List<String> scale(SizeType type) {
        return switch (type) {
            case TOP -> TOP_SCALE;
            case BOTTOM -> BOTTOM_SCALE;
            case SHOE -> SHOE_SCALE;
            case NONE -> List.of();
        };
    }

    /** Chỉ số của size trong thang, -1 nếu không thuộc thang (vd "Freesize"). Chấp nhận "2XL", "XXXL". */
    public static int indexOf(SizeType type, String size) {
        if (size == null) return -1;
        String s = size.trim().toUpperCase(Locale.ROOT);
        if (type == SizeType.TOP) {
            s = switch (s) {
                case "2XL" -> "XXL";
                case "XXXL" -> "3XL";
                default -> s;
            };
        }
        return scale(type).indexOf(s);
    }

    public static String sizeAt(SizeType type, int index) {
        List<String> scale = scale(type);
        return scale.get(Math.max(0, Math.min(index, scale.size() - 1)));
    }

    public static int clamp(SizeType type, int index) {
        return Math.max(0, Math.min(index, scale(type).size() - 1));
    }

    // ---------------------------------------------------------------- Bảng size theo số đo

    /** Chỉ số size áo theo chiều cao (cm); null nếu thiếu số đo. */
    public static Integer topIndexByHeight(Integer heightCm) {
        return heightCm == null ? null : firstFit(TOP_MAX_HEIGHT, heightCm);
    }

    public static Integer topIndexByWeight(Integer weightKg) {
        return weightKg == null ? null : firstFit(TOP_MAX_WEIGHT, weightKg);
    }

    /**
     * Size theo bảng (chưa tính kiểu mặc, lịch sử, form sản phẩm); null nếu thiếu số đo cần cho kiểu
     * size này.
     *
     * <ul>
     *   <li>Áo: trung bình chỉ số theo chiều cao và theo cân nặng, làm tròn lên.
     *   <li>Quần: theo cân nặng, người cao trên 180 cm +1.
     *   <li>Giày: theo chiều dài bàn chân.
     * </ul>
     */
    public static Integer chartIndex(SizeType type, Integer heightCm, Integer weightKg, Integer footMm) {
        switch (type) {
            case TOP -> {
                if (heightCm == null || weightKg == null) return null;
                int h = topIndexByHeight(heightCm);
                int w = topIndexByWeight(weightKg);
                return (h + w + 1) / 2; // trung bình làm tròn lên
            }
            case BOTTOM -> {
                if (weightKg == null) return null;
                int i = firstFit(BOTTOM_MAX_WEIGHT, weightKg);
                if (heightCm != null && heightCm > BOTTOM_TALL_CM) i++;
                return clamp(type, i);
            }
            case SHOE -> {
                if (footMm == null) return null;
                for (int i = 0; i < SHOE_SCALE.size(); i++) if (footMm <= shoeMaxFootMm(i)) return i;
                return SHOE_SCALE.size() - 1;
            }
            default -> {
                return null;
            }
        }
    }

    /** Kiểu mặc chỉ ảnh hưởng áo: ôm −1 size, rộng +1 size. */
    public static int preferenceShift(SizeType type, String fitPreference) {
        if (type != SizeType.TOP || fitPreference == null) return 0;
        return switch (fitPreference) {
            case "SNUG" -> -1;
            case "LOOSE" -> 1;
            default -> 0;
        };
    }

    private static int firstFit(int[] maxima, int value) {
        for (int i = 0; i < maxima.length; i++) if (value <= maxima[i]) return i;
        return maxima.length - 1;
    }

    // ---------------------------------------------------------------- Phân loại sản phẩm

    private static final Set<String> SHOE_WORDS = Set.of("giay", "dep", "sandal", "boot", "boots", "sneaker", "guoc");
    private static final Set<String> NONE_WORDS =
            Set.of("tui", "balo", "vi", "mu", "non", "kinh", "that", "khan", "tat", "vo", "phu", "trang");
    private static final Set<String> BOTTOM_WORDS = Set.of("quan", "vay", "short", "jean", "jeans");
    private static final Set<String> TOP_WORDS = Set.of("ao", "somi", "hoodie", "khoac", "polo", "len");

    /**
     * Kiểu size của sản phẩm: ưu tiên tên danh mục (Giày, Dép, Túi, Quần, Áo...), nếu danh mục không
     * rõ thì đoán theo các size đang bán.
     */
    public static SizeType classify(String categoryName, Collection<String> sizes) {
        Set<String> words = words(categoryName);
        if (words.stream().anyMatch(SHOE_WORDS::contains)) return SizeType.SHOE;
        if (words.stream().anyMatch(NONE_WORDS::contains)) return SizeType.NONE;
        if (words.stream().anyMatch(BOTTOM_WORDS::contains)) return SizeType.BOTTOM;
        if (words.stream().anyMatch(TOP_WORDS::contains)) return SizeType.TOP;
        return classifyBySizes(sizes);
    }

    static SizeType classifyBySizes(Collection<String> sizes) {
        if (sizes == null || sizes.isEmpty()) return SizeType.NONE;
        if (sizes.stream().allMatch(s -> indexOf(SizeType.TOP, s) >= 0)) return SizeType.TOP;
        if (!sizes.stream().allMatch(s -> s != null && s.trim().matches("\\d{2}"))) return SizeType.NONE;
        int min = sizes.stream().mapToInt(s -> Integer.parseInt(s.trim())).min().orElse(0);
        int max = sizes.stream().mapToInt(s -> Integer.parseInt(s.trim())).max().orElse(0);
        if (min >= 34 && max >= 37) return SizeType.SHOE;
        if (max <= 38) return SizeType.BOTTOM;
        return SizeType.NONE;
    }

    /** Chữ thường, bỏ dấu tiếng Việt, tách theo khoảng trắng/ký tự đặc biệt. */
    static Set<String> words(String text) {
        if (text == null) return Set.of();
        String plain = Normalizer.normalize(text, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .replace('đ', 'd')
                .replace('Đ', 'D')
                .toLowerCase(Locale.ROOT);
        return Arrays.stream(plain.split("[^a-z0-9]+")).filter(w -> !w.isEmpty()).collect(Collectors.toSet());
    }
}
