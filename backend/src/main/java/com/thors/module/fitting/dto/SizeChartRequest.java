package com.thors.module.fitting.dto;

import com.thors.module.fitting.entity.SizeChartRow;
import java.util.List;

/** Owner lưu cả bảng size một lần (ghi đè bảng cũ). Danh sách rỗng = xóa bảng size. */
public record SizeChartRequest(List<SizeChartRow> rows) {
}
