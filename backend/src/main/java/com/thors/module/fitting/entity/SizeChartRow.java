package com.thors.module.fitting.entity;

import java.math.BigDecimal;

/**
 * Một dòng bảng size của sản phẩm: size + khoảng số đo phù hợp. Giá trị null = không quy định.
 * Quần áo dùng chiều cao / cân nặng / các vòng; giày dép dùng chiều dài bàn chân (foot).
 * Dùng chung cho dữ liệu trong DB và dữ liệu Owner gửi lên / trả về.
 */
public record SizeChartRow(
        String sizeLabel,
        BigDecimal heightMin,
        BigDecimal heightMax,
        BigDecimal weightMin,
        BigDecimal weightMax,
        BigDecimal chestMin,
        BigDecimal chestMax,
        BigDecimal waistMin,
        BigDecimal waistMax,
        BigDecimal hipMin,
        BigDecimal hipMax,
        BigDecimal footMin,
        BigDecimal footMax,
        Integer sortOrder) {
}
