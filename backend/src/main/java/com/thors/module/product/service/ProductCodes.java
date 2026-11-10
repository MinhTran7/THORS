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
 *   <li>SKU: chữ in hoa, số, dấu "-"; 3–30 ký tự; không trùng. Để trống thì tự tạo theo danh mục:
 *       "Giày nam" → GN-0001, "Balo" → BAL-0001.</li>
 *   <li>Mã biến thể: SKU-SIZE-MÀU, vd GN-0001-42-DEN (bỏ dấu, viết hoa), tối đa 32 ký tự (giới hạn cột barcode,
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

    /** SKU kế tiếp cho danh mục: tiền tố + số lớn nhất đang dùng + 1 (vd GN-0003 → GN-0004). */
    public String suggestSku(Integer categoryId) {
        String name = null;
        if (categoryId != null) {
            List<String> names = jdbc.queryForList(
                    "SELECT category_name FROM category WHERE category_id = ?", String.class, categoryId);
            name = names == null || names.isEmpty() ? null : names.get(0);
        }
        String prefix = categoryPrefix(name);
        Pattern numbered = Pattern.compile(Pattern.quote(prefix) + "-(\\d{1,9})");
        int max = 0;
        List<String> used = jdbc.queryForList(
                "SELECT sku FROM product WHERE sku LIKE ?", String.class, prefix + "-%");
        if (used != null) {
            for (String sku : used) {
                Matcher m = sku == null ? null : numbered.matcher(sku);
                if (m != null && m.matches()) max = Math.max(max, Integer.parseInt(m.group(1)));
            }
        }
        for (int n = max + 1; ; n++) {
            String candidate = String.format(Locale.ROOT, "%s-%04d", prefix, n);
            if (!skuExists(candidate, null)) return candidate;
        }
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
