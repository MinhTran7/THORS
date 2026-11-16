package com.thors.module.imagesearch.service;

import java.math.BigDecimal;
import java.util.List;

/**
 * Kết quả trả cho khách. status:
 *  AVAILABLE          shop có mẫu này và còn hàng (đúng màu nếu nhận ra màu)
 *  OUT_OF_STOCK       có mẫu này nhưng hết hàng (hoặc hết đúng màu khách chụp)
 *  COLOR_UNAVAILABLE  có mẫu này nhưng không có màu khách chụp
 *  SIMILAR            có sản phẩm khá giống nhưng chưa chắc cùng mẫu (product = sản phẩm giống nhất, không có detectedColor)
 *  NOT_FOUND          chưa có mẫu này (vẫn kèm sản phẩm gần giống)
 */
public record ImageSearchResult(
        String status,
        String message,
        Product product,
        DetectedColor detectedColor,
        List<Product> suggestions) {

    /** Thẻ sản phẩm. colors chỉ có ở sản phẩm khớp. score: điểm giống 0..1. */
    public record Product(
            int productId,
            String productName,
            String categoryName,
            String imageUrl,
            BigDecimal minPrice,
            BigDecimal maxPrice,
            double score,
            List<ColorStock> colors) {}

    /** Tồn kho còn bán được của một màu (đã trừ hàng đang giữ cho đơn). matches: trùng nhóm màu khách chụp. */
    public record ColorStock(String color, int stock, boolean matches) {}

    /** Màu AI đoán. confident=false thì không dùng để kết luận "không có màu này". */
    public record DetectedColor(String name, double probability, boolean confident) {}
}
