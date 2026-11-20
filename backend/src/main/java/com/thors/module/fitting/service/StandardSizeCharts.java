package com.thors.module.fitting.service;

import com.thors.module.fitting.entity.SizeChartRow;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Bảng size chuẩn tham khảo (số đo cơ thể phổ biến ở Việt Nam) để Owner khỏi nhập tay:
 * - Nút "Điền theo bảng size chuẩn" trong trang quản trị.
 * - Sản phẩm chưa có bảng size riêng -> gợi ý size dùng bảng chuẩn (ghi rõ là ước lượng).
 *
 * <p>Loại hàng nhận từ tên danh mục (cả danh mục cha): Áo / Váy, đầm / Quần / Giày, dép / còn lại không cần size.
 * Size chữ (S, M, L...) tra bảng theo đối tượng nam / nữ; size quần dạng số (26-40) = vòng eo tính bằng inch.
 * Số liệu là mức phổ biến, mỗi xưởng may có thể lệch: Owner vẫn sửa được sau khi điền.
 */
public final class StandardSizeCharts {

    private StandardSizeCharts() {
    }

    /** TOP: áo; DRESS: váy / đầm; BOTTOM: quần; SHOES: giày dép (theo chiều dài bàn chân); NONE: không cần size. */
    public enum Kind { TOP, DRESS, BOTTOM, SHOES, NONE }

    /** Nhận loại hàng từ tên các danh mục (con -> cha), không phân biệt dấu / hoa thường. */
    public static Kind detectKind(List<String> categoryNames) {
        String text = fold(String.join(" ", categoryNames));
        if (text.matches(".*\\b(giay|dep|sandal|boot|sneaker|guoc)\\b.*")) return Kind.SHOES;
        if (text.matches(".*\\b(vay|dam)\\b.*")) return Kind.DRESS;
        if (text.matches(".*\\b(quan|jean|short)\\b.*")) return Kind.BOTTOM;
        if (text.matches(".*\\b(ao|so mi|hoodie|sweater|polo)\\b.*")) return Kind.TOP;
        return Kind.NONE;
    }

    private static String fold(String s) {
        String noMarks = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        return noMarks.replace('đ', 'd').replace('Đ', 'D').toLowerCase(Locale.ROOT);
    }

    // [chiều cao min, max, cân nặng min, max, ngực min, max, eo min, max, hông min, max]; NaN = không quy định
    private static final double N = Double.NaN;

    private static final Map<String, double[]> MEN = Map.of(
            "XS", new double[] {155, 161, 45, 51, 80, 84, 64, 68, 82, 86},
            "S", new double[] {160, 166, 50, 58, 84, 88, 68, 72, 86, 90},
            "M", new double[] {165, 171, 57, 65, 88, 92, 72, 76, 90, 94},
            "L", new double[] {170, 176, 64, 72, 92, 96, 76, 80, 94, 98},
            "XL", new double[] {174, 180, 71, 80, 96, 100, 80, 86, 98, 102},
            "XXL", new double[] {177, 185, 79, 90, 100, 106, 86, 92, 102, 108},
            "3XL", new double[] {180, 188, 88, 100, 106, 112, 92, 98, 108, 114});

    private static final Map<String, double[]> WOMEN = Map.of(
            "XS", new double[] {148, 153, 38, 43, 76, 80, 58, 62, 82, 86},
            "S", new double[] {150, 156, 41, 47, 80, 84, 62, 66, 86, 90},
            "M", new double[] {155, 160, 46, 52, 84, 88, 66, 70, 90, 94},
            "L", new double[] {158, 164, 51, 58, 88, 92, 70, 74, 94, 98},
            "XL", new double[] {162, 168, 57, 64, 92, 96, 74, 78, 98, 102},
            "XXL", new double[] {165, 172, 63, 72, 96, 102, 78, 84, 102, 108},
            "3XL", new double[] {168, 175, 70, 80, 102, 108, 84, 90, 108, 114});

    private static String normalizeLetter(String size) {
        String s = size.trim().toUpperCase(Locale.ROOT);
        return switch (s) {
            case "2XL", "XXL" -> "XXL";
            case "3XL", "XXXL" -> "3XL";
            default -> s;
        };
    }

    /**
     * Bảng chuẩn cho các size của sản phẩm; size nào không tra được thì bỏ qua (vd. size số trên áo).
     *
     * @param targetGroup MEN / WOMEN / UNISEX / KIDS / tự nhập (trẻ em chưa có bảng chuẩn)
     */
    public static List<SizeChartRow> rowsFor(Kind kind, String targetGroup, List<String> sizes) {
        List<SizeChartRow> rows = new ArrayList<>();
        if (kind == Kind.SHOES) return shoeRows(sizes);
        if (kind == Kind.NONE || "KIDS".equals(targetGroup)) return rows;
        boolean women = kind == Kind.DRESS || "WOMEN".equals(targetGroup);
        Map<String, double[]> table = women ? WOMEN : MEN; // UNISEX / chưa rõ: dùng bảng nam
        int order = 0;
        for (String size : sizes) {
            double[] v = table.get(normalizeLetter(size));
            if (v != null) {
                rows.add(switch (kind) {
                    // Áo: chiều cao, cân nặng, ngực, eo
                    case TOP -> row(size, order++, v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], N, N);
                    // Váy / đầm: ngực, eo, hông + chiều cao
                    case DRESS -> row(size, order++, v[0], v[1], N, N, v[4], v[5], v[6], v[7], v[8], v[9]);
                    // Quần size chữ: eo, hông + chiều cao
                    default -> row(size, order++, v[0], v[1], N, N, N, N, v[6], v[7], v[8], v[9]);
                });
                continue;
            }
            // Quần size số 26-40 = vòng eo (inch) -> cm, cho phép lệch +-1.3 cm (khoảng nửa inch)
            if (kind == Kind.BOTTOM && size.trim().matches("\\d{2}")) {
                int inch = Integer.parseInt(size.trim());
                if (inch >= 24 && inch <= 44) {
                    double cm = inch * 2.54;
                    rows.add(row(size, order++, N, N, N, N, N, N, cm - 1.3, cm + 1.3, N, N));
                }
            }
        }
        return rows;
    }

    /**
     * Size giày EU (cả trẻ em, 15-50) -> chiều dài bàn chân (cm). Quy ước phổ biến:
     * size EU = 1.5 x (chiều dài bàn chân + 1.5 cm)  =>  bàn chân ~ size / 1.5 - 1.5 (vd. 38 -> ~23.8 cm).
     * Hai size liền nhau cách ~0.67 cm nên mỗi size nhận khoảng +-0.33 cm quanh giá trị giữa.
     * Size không phải số (vd. dép S / M / L) thì bỏ qua.
     */
    private static List<SizeChartRow> shoeRows(List<String> sizes) {
        List<SizeChartRow> rows = new ArrayList<>();
        int order = 0;
        for (String size : sizes) {
            String s = size.trim();
            if (!s.matches("\\d{2}(\\.5)?")) continue;
            double eu = Double.parseDouble(s);
            if (eu < 15 || eu > 50) continue;
            double foot = eu / 1.5 - 1.5;
            rows.add(row(size, order++, N, N, N, N, N, N, N, N, N, N, foot - 0.33, foot + 0.33));
        }
        return rows;
    }

    private static final List<String> LETTER_ORDER = List.of("XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL");

    /** Sắp size theo thứ tự hợp lý: size chữ XS < S < M < L...; size số tăng dần; còn lại theo chữ cái. */
    public static List<String> sortSizes(List<String> sizes) {
        List<String> sorted = new ArrayList<>(sizes);
        sorted.sort((a, b) -> {
            int ia = LETTER_ORDER.indexOf(normalizeLetter(a));
            int ib = LETTER_ORDER.indexOf(normalizeLetter(b));
            if (ia >= 0 && ib >= 0) return Integer.compare(ia, ib);
            boolean na = a.trim().matches("\\d+(\\.\\d+)?");
            boolean nb = b.trim().matches("\\d+(\\.\\d+)?");
            if (na && nb) return Double.compare(Double.parseDouble(a.trim()), Double.parseDouble(b.trim()));
            if (ia >= 0 != ib >= 0) return ia >= 0 ? -1 : 1; // size chữ đứng trước
            if (na != nb) return na ? -1 : 1;
            return a.compareTo(b);
        });
        return sorted;
    }

    /** v: 10 số (chiều cao, cân nặng, ngực, eo, hông: min/max) + tùy chọn 2 số bàn chân. */
    private static SizeChartRow row(String size, int order, double... v) {
        double footMin = v.length > 10 ? v[10] : N;
        double footMax = v.length > 11 ? v[11] : N;
        return new SizeChartRow(size, d(v[0]), d(v[1]), d(v[2]), d(v[3]), d(v[4]), d(v[5]), d(v[6]), d(v[7]),
                d(v[8]), d(v[9]), d(footMin), d(footMax), order);
    }

    private static BigDecimal d(double v) {
        return Double.isNaN(v) ? null : BigDecimal.valueOf(v).setScale(1, RoundingMode.HALF_UP);
    }
}
