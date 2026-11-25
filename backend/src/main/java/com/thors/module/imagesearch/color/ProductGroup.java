package com.thors.module.imagesearch.color;

import java.text.Normalizer;
import java.util.Locale;

/** Nhóm hàng, dùng để chọn câu mô tả màu phù hợp ("a red backpack" thay vì "a red shirt"). */
public enum ProductGroup {
    CLOTHES, FOOTWEAR, HANDBAG, BACKPACK,
    /** Mặt thắt lưng: màu là màu kim loại (bạc / vàng), không kiểm màu. */
    BELT;

    /** Đoán nhóm theo tên danh mục / sản phẩm (vd "Giày Da Nam", "Balo Nữ", "Túi Xách Nữ"). */
    public static ProductGroup of(String categoryName, String productName) {
        String text = fold(categoryName) + " " + fold(productName);
        if (text.contains("that lung") || text.contains("mat khoa")) return BELT;
        if (text.contains("balo") || text.contains("ba lo")) return BACKPACK;
        if (text.contains("tui")) return HANDBAG;
        if (text.contains("giay") || text.contains("dep") || text.contains("sandal") || text.contains("guoc")) return FOOTWEAR;
        return CLOTHES;
    }

    /** Viết thường, bỏ dấu tiếng Việt, gộp khoảng trắng. */
    public static String fold(String s) {
        if (s == null) return "";
        String n = Normalizer.normalize(s.toLowerCase(Locale.ROOT), Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .replace('đ', 'd');
        return n.replaceAll("\\s+", " ").trim();
    }
}
