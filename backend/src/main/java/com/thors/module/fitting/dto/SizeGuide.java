package com.thors.module.fitting.dto;

import com.thors.module.fitting.entity.SizeChartRow;
import java.util.List;

/**
 * Dữ liệu "Gợi ý size" trên trang sản phẩm của cửa hàng.
 *
 * @param chart bảng size (rỗng = không có bảng size nào, kể cả bảng chuẩn -> không hiện khung gợi ý)
 * @param recommendation gợi ý (null khi khách chưa có số đo hoặc không có bảng size)
 * @param hasSavedProfile khách đang đăng nhập và đã lưu số đo
 * @param standard true = sản phẩm chưa có bảng size riêng, đang dùng bảng size chuẩn (ước lượng)
 * @param kind loại hàng: TOP | DRESS | BOTTOM | SHOES | NONE (SHOES -> giao diện nhắc chọn theo size giày thường đi)
 */
public record SizeGuide(
        List<SizeChartRow> chart, SizeRecommendation recommendation, boolean hasSavedProfile, boolean standard, String kind) {
}
