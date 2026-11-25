package com.thors.module.imagesearch.color;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Quy đổi tên màu người bán nhập trong product_detail.color (vd "Xanh Đậm", "Đỏ Mận", "trắng kem")
 * về nhóm màu mà AI đoán được. Trả null nếu không nhận ra (khi đó không kết luận gì về màu).
 *
 * Nhóm màu: den, trang, xam, be, nau, xanh (gồm xanh dương / navy / da trời), xanh-la, do, hong, vang, cam, tim.
 */
public final class ColorNames {

    // Thứ tự quan trọng: cụm dài / cụ thể đứng trước (vd "xanh la" trước "xanh", "trang kem" là trắng)
    private static final Map<String, String> FAMILY_BY_WORD = new LinkedHashMap<>();

    static {
        FAMILY_BY_WORD.put("xanh la", "xanh-la");
        FAMILY_BY_WORD.put("xanh reu", "xanh-la");
        FAMILY_BY_WORD.put("xanh mint", "xanh-la");
        FAMILY_BY_WORD.put("xanh luc", "xanh-la");
        FAMILY_BY_WORD.put("reu", "xanh-la");
        FAMILY_BY_WORD.put("olive", "xanh-la");
        FAMILY_BY_WORD.put("navy", "xanh");
        FAMILY_BY_WORD.put("xanh", "xanh");
        FAMILY_BY_WORD.put("trang kem", "trang");
        FAMILY_BY_WORD.put("trang", "trang");
        FAMILY_BY_WORD.put("kem", "be");
        FAMILY_BY_WORD.put("be", "be");
        FAMILY_BY_WORD.put("nau", "nau");
        FAMILY_BY_WORD.put("bo", "nau");
        FAMILY_BY_WORD.put("den", "den");
        FAMILY_BY_WORD.put("xam", "xam");
        FAMILY_BY_WORD.put("ghi", "xam");
        FAMILY_BY_WORD.put("hong", "hong");
        FAMILY_BY_WORD.put("do", "do");
        FAMILY_BY_WORD.put("vang", "vang");
        FAMILY_BY_WORD.put("cam", "cam");
        FAMILY_BY_WORD.put("tim", "tim");
    }

    private ColorNames() {}

    /** Nhóm màu của tên màu trong DB, hoặc null nếu không nhận ra. Chỉ so theo TỪ đầy đủ ("be" không khớp "bé"... đã bỏ dấu). */
    public static String familyOf(String dbColor) {
        String text = " " + ProductGroup.fold(dbColor) + " ";
        if (text.isBlank()) return null;
        for (Map.Entry<String, String> e : FAMILY_BY_WORD.entrySet()) {
            if (text.contains(" " + e.getKey() + " ")) {
                return e.getValue();
            }
        }
        return null;
    }
}
