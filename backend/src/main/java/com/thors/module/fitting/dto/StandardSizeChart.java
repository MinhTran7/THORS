package com.thors.module.fitting.dto;

import com.thors.module.fitting.entity.SizeChartRow;
import java.util.List;

/**
 * Bảng size chuẩn tính sẵn cho một sản phẩm.
 *
 * @param kind TOP | DRESS | BOTTOM | SHOES | NONE (loại hàng nhận từ danh mục)
 * @param targetGroup đối tượng của danh mục (MEN / WOMEN / UNISEX / KIDS / null)
 * @param rows các dòng tra được (rỗng = không có bảng chuẩn cho loại / size này)
 */
public record StandardSizeChart(String kind, String targetGroup, List<SizeChartRow> rows) {
}
