package com.thors.module.product.service;

import com.thors.common.ApiException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Mã sản phẩm (SKU, cột product.sku) và mã biến thể (dùng lại cột product_detail.barcode).
 *
 * <ul>
 *   <li>SKU: chữ in hoa, số, dấu "-"; 3–30 ký tự; không trùng. Để trống thì tự tạo dạng TH + 6 chữ số
 *       (TH000001, TH000002…).</li>
 *   <li>Mã biến thể: SKU-SIZE-MÀU, vd TH000001-42-DEN (bỏ dấu, viết hoa), tối đa 32 ký tự (giới hạn cột barcode,
 *       khớp định dạng máy quét của module Kho). Mã đã có thì không bao giờ tự đổi để tem đã in vẫn đúng.</li>
 * </ul>
 * Cột product.sku đến từ migration 2026-11-10_product_sku.sql; DB chưa chạy migration thì bỏ qua SKU.
 */
public class ProductCodes {

    static final int SKU_MAX = 30;
    static final int CODE_MAX = 32;
    private static final Pattern SKU_PATTERN = Pattern.compile("[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?");

    private final JdbcTemplate jdbc;

    public ProductCodes(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ==========================================
    // CHUẨN HÓA / KIỂM TRA
    // ==========================================

    /** Bỏ dấu tiếng Việt (đ → d), viết thường — dùng so trùng "Đen" với "Den" giống collation của DB. */
    public static String fold(String value) {
        if (value == null) return "";
        String s = value.trim().toLowerCase(Locale.ROOT).replace('đ', 'd');
        return Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
    }

    /** Khóa so trùng biến thể (size + màu), không phân biệt hoa/thường và dấu. */
    public static String variantKey(String size, String color) {
        return fold(size) + "\u0000" + fold(color);
    }

    /** Chữ + số in hoa, không dấu; ký tự khác thành "-" (gộp, bỏ ở hai đầu). */
    static String slug(String value) {
        String s = fold(value).toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", "-");
        return s.replaceAll("^-+|-+$", "");
    }

    /** null/rỗng → null (tự tạo). Sai định dạng → 400. */
    public static String normalizeSku(String raw) {
        return normalize(raw, SKU_MAX, "INVALID_SKU", "Mã sản phẩm (SKU)");
    }

    public static String normalizeVariantCode(String raw) {
        return normalize(raw, CODE_MAX, "INVALID_VARIANT_CODE", "Mã biến thể");
    }

    private static String normalize(String raw, int max, String code, String label) {
        if (raw == null || raw.isBlank()) return null;
        String value = raw.trim().toUpperCase(Locale.ROOT);
        if (value.length() < 3 || value.length() > max || !SKU_PATTERN.matcher(value).matches()) {
            throw new ApiException(400, code, label + " \"" + raw.trim() + "\" không hợp lệ: chỉ gồm chữ in hoa, số và dấu \"-\", dài 3–"
                    + max + " ký tự, không bắt đầu/kết thúc bằng \"-\".");
        }
        return value;
    }

    /** Tiền tố theo tên danh mục: nhiều từ → chữ cái đầu (tối đa 4), một từ → 3 chữ đầu. */
    static String categoryPrefix(String categoryName) {
        String[] words = slug(categoryName).split("-");
        List<String> parts = new ArrayList<>();
        for (String w : words) {
            if (!w.isEmpty()) parts.add(w);
        }
        if (parts.isEmpty()) return "SP";
        if (parts.size() == 1) {
            String w = parts.get(0);
            return w.substring(0, Math.min(3, w.length()));
        }
        StringBuilder sb = new StringBuilder();
        for (String w : parts) {
            if (sb.length() < 4) sb.append(w.charAt(0));
        }
        return sb.toString();
    }

    /** Mã biến thể gợi ý: SKU-SIZE-MÀU, cắt bớt phần màu nếu quá 32 ký tự. */
    static String defaultVariantCode(String sku, String size, String color) {
        String base = sku + "-" + slug(size);
        String colorPart = slug(color);
        String code = colorPart.isEmpty() ? base : base + "-" + colorPart;
        if (code.length() > CODE_MAX) code = code.substring(0, CODE_MAX);
        return code.replaceAll("-+$", "");
    }

    // ==========================================
    // TRUY VẤN DB
    // ==========================================

    /** DB đã có cột product.sku chưa. */
    public boolean supportsSku() {
        try {
            jdbc.queryForList("SELECT sku FROM product WHERE 1 = 0");
            return true;
        } catch (BadSqlGrammarException e) {
            return false;
        }
    }

    public boolean skuExists(String sku, Integer exceptProductId) {
        Integer n = exceptProductId == null
                ? jdbc.queryForObject("SELECT COUNT(*) FROM product WHERE sku = ?", Integer.class, sku)
                : jdbc.queryForObject("SELECT COUNT(*) FROM product WHERE sku = ? AND product_id <> ?",
                        Integer.class, sku, exceptProductId);
        return n != null && n > 0;
    }

    public boolean variantCodeExists(String code) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM product_detail WHERE barcode = ?", Integer.class, code);
        return n != null && n > 0;
    }

    /** Tiền tố SKU tự tạo: TH + 6 chữ số (vd TH000001), cùng kiểu mã của cửa hàng THORS. */
    static final String SKU_PREFIX = "TH";
    private static final Pattern NUMBERED_SKU = Pattern.compile(SKU_PREFIX + "(\\d{6,9})");

    /**
     * SKU kế tiếp: TH + (số lớn nhất trong các SKU dạng TH000123 + 1), đủ 6 chữ số (TH000124).
     * Không phụ thuộc danh mục; categoryId giữ lại để không đổi API.
     */
    public String suggestSku(Integer categoryId) {
        int max = 0;
        List<String> used = jdbc.queryForList(
                "SELECT sku FROM product WHERE sku LIKE ?", String.class, SKU_PREFIX + "%");
        if (used != null) {
            for (String sku : used) {
                Matcher m = sku == null ? null : NUMBERED_SKU.matcher(sku);
                if (m != null && m.matches()) max = Math.max(max, Integer.parseInt(m.group(1)));
            }
        }
        for (int n = max + 1; ; n++) {
            String candidate = String.format(Locale.ROOT, "%s%06d", SKU_PREFIX, n);
            if (!skuExists(candidate, null)) return candidate;
        }
    }

    /**
     * Gán mã cho các biến thể chưa có mã của một sản phẩm: TH + id biến thể đủ 6 chữ số (biến thể #58 -> TH000058),
     * giống hệt cách module Kho tạo mã vạch (WarehouseBarcodes); mã đã bị dùng thì thêm hậu tố -1, -2…
     * Mã đã có không bao giờ bị đổi để tem đã in vẫn đúng. Trả về số biến thể vừa được gán mã.
     */
    public int assignVariantCodes(int productId) {
        List<Integer> ids = jdbc.queryForList(
                "SELECT detail_id FROM product_detail WHERE product_id = ? AND (barcode IS NULL OR barcode = '')"
                        + " ORDER BY detail_id",
                Integer.class, productId);
        if (ids == null) return 0;
        int assigned = 0;
        for (Integer id : ids) {
            if (id == null) continue;
            String base = String.format(Locale.ROOT, "TH%06d", id);
            String code = base;
            for (int n = 1; variantCodeExists(code); n++) {
                code = base + "-" + n;
            }
            assigned += jdbc.update(
                    "UPDATE product_detail SET barcode = ? WHERE detail_id = ? AND (barcode IS NULL OR barcode = '')",
                    code, id);
        }
        return assigned;
    }

    /** Mã biến thể tự tạo, không trùng DB và không trùng các mã đã chọn trong cùng lần lưu. */
    public String uniqueVariantCode(String sku, String size, String color, Set<String> taken) {
        String base = defaultVariantCode(sku, size, color);
        String code = base;
        for (int n = 2; taken.contains(code) || variantCodeExists(code); n++) {
            String suffix = "-" + n;
            String head = base.length() + suffix.length() > CODE_MAX
                    ? base.substring(0, CODE_MAX - suffix.length()).replaceAll("-+$", "")
                    : base;
            code = head + suffix;
        }
        taken.add(code);
        return code;
    }
}
