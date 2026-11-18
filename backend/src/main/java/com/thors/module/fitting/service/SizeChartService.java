package com.thors.module.fitting.service;

import com.thors.common.ApiException;
import com.thors.module.fitting.dto.StandardSizeChart;
import com.thors.module.fitting.entity.SizeChartRow;
import com.thors.module.fitting.repository.SizeChartRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Supplier;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Bảng size của sản phẩm: xem, lưu (ghi đè), sao chép từ sản phẩm khác. Quyền do SecurityConfig chặn theo URL. */
@Service
public class SizeChartService {

    private final SizeChartRepository charts;

    public SizeChartService(SizeChartRepository charts) {
        this.charts = charts;
    }

    public List<SizeChartRow> get(int productId) {
        requireProduct(productId);
        return whenReady(() -> charts.findByProduct(productId));
    }

    @Transactional
    public List<SizeChartRow> save(int productId, List<SizeChartRow> rows) {
        requireProduct(productId);
        List<SizeChartRow> clean = validate(rows, new HashSet<>(charts.sizesOf(productId)));
        if (clean.stream().anyMatch(r -> r.footMin() != null) && !charts.supportsFoot()) {
            throw new ApiException(503, "SIZE_CHART_UNAVAILABLE",
                    "Chưa lưu được size giày (chưa chạy migration thêm cột chiều dài bàn chân).");
        }
        return whenReady(() -> {
            charts.replace(productId, clean);
            return charts.findByProduct(productId);
        });
    }

    /** Chép bảng size của sản phẩm nguồn; chỉ giữ các size mà sản phẩm đích cũng có. */
    @Transactional
    public List<SizeChartRow> copyFrom(int productId, int sourceProductId) {
        if (productId == sourceProductId) throw invalid("Hãy chọn một sản phẩm khác để sao chép.");
        requireProduct(productId);
        requireProduct(sourceProductId);
        Set<String> sizes = new HashSet<>(charts.sizesOf(productId));
        List<SizeChartRow> source = whenReady(() -> charts.findByProduct(sourceProductId));
        List<SizeChartRow> matching = source.stream().filter(r -> sizes.contains(r.sizeLabel())).toList();
        if (matching.isEmpty()) {
            throw invalid("Sản phẩm nguồn không có bảng size, hoặc không có size nào trùng với sản phẩm này.");
        }
        return save(productId, matching);
    }

    /** Bảng size chuẩn cho sản phẩm (để Owner bấm "Điền theo bảng size chuẩn" rồi sửa và lưu). */
    public StandardSizeChart standard(int productId) {
        requireProduct(productId);
        var info = charts.categoryInfo(productId);
        List<String> names = info == null ? List.of() : info.names();
        String target = info == null ? null : info.targetGroup();
        var kind = StandardSizeCharts.detectKind(names);
        return new StandardSizeChart(kind.name(), target,
                StandardSizeCharts.rowsFor(kind, target, StandardSizeCharts.sortSizes(charts.sizesOf(productId))));
    }

    /**
     * Dùng bảng size của sản phẩm này cho mọi sản phẩm khác cùng danh mục (ghi đè bảng cũ của chúng).
     * Mỗi sản phẩm chỉ nhận các size nó đang có. Trả về số sản phẩm đã cập nhật.
     */
    @Transactional
    public int applyToCategory(int productId) {
        requireProduct(productId);
        List<SizeChartRow> source = whenReady(() -> charts.findByProduct(productId));
        if (source.isEmpty()) throw invalid("Hãy lưu bảng size cho sản phẩm này trước khi áp dụng cho cả danh mục.");
        var info = charts.categoryInfo(productId);
        if (info == null) return 0;
        int updated = 0;
        for (int other : charts.otherProductsInCategory(info.categoryId(), productId)) {
            Set<String> sizes = new HashSet<>(charts.sizesOf(other));
            List<SizeChartRow> rows = source.stream().filter(r -> sizes.contains(r.sizeLabel())).toList();
            if (rows.isEmpty()) continue;
            charts.replace(other, rows);
            updated++;
        }
        return updated;
    }

    /**
     * Kiểm tra từng dòng: size phải có trong sản phẩm, không trùng; mỗi cặp min/max nhập đủ cả hai,
     * min <= max, trong khoảng hợp lý; mỗi dòng có ít nhất 1 số đo. Public static để test riêng.
     */
    public static List<SizeChartRow> validate(List<SizeChartRow> rows, Set<String> productSizes) {
        if (rows == null) throw invalid("Thiếu dữ liệu bảng size.");
        List<SizeChartRow> clean = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        int order = 0;
        for (SizeChartRow r : rows) {
            String size = r.sizeLabel() == null ? "" : r.sizeLabel().trim();
            if (!productSizes.contains(size)) throw invalid("Size \"" + size + "\" không có trong sản phẩm này.");
            if (!seen.add(size)) throw invalid("Size \"" + size + "\" bị nhập 2 lần.");
            BigDecimal[] h = pair(size, "chiều cao", r.heightMin(), r.heightMax(), 50, 220);
            BigDecimal[] w = pair(size, "cân nặng", r.weightMin(), r.weightMax(), 3, 200);
            BigDecimal[] c = pair(size, "vòng ngực", r.chestMin(), r.chestMax(), 40, 160);
            BigDecimal[] wa = pair(size, "vòng eo", r.waistMin(), r.waistMax(), 35, 160);
            BigDecimal[] hp = pair(size, "vòng hông", r.hipMin(), r.hipMax(), 40, 170);
            BigDecimal[] f = pair(size, "chiều dài bàn chân", r.footMin(), r.footMax(), 9, 35);
            if (h[0] == null && w[0] == null && c[0] == null && wa[0] == null && hp[0] == null && f[0] == null) {
                throw invalid("Size " + size + " chưa có số đo nào.");
            }
            clean.add(new SizeChartRow(size, h[0], h[1], w[0], w[1], c[0], c[1], wa[0], wa[1], hp[0], hp[1], f[0], f[1],
                    order++));
        }
        return clean;
    }

    private static BigDecimal[] pair(String size, String label, BigDecimal min, BigDecimal max, int lo, int hi) {
        if (min == null && max == null) return new BigDecimal[] {null, null};
        if (min == null || max == null) throw invalid("Size " + size + ": nhập đủ cả \"từ\" và \"đến\" cho " + label + ".");
        if (min.compareTo(max) > 0) throw invalid("Size " + size + ": " + label + " \"từ\" phải nhỏ hơn hoặc bằng \"đến\".");
        if (min.compareTo(BigDecimal.valueOf(lo)) < 0 || max.compareTo(BigDecimal.valueOf(hi)) > 0) {
            throw invalid("Size " + size + ": " + label + " phải trong khoảng " + lo + " - " + hi + ".");
        }
        return new BigDecimal[] {min.setScale(1, RoundingMode.HALF_UP), max.setScale(1, RoundingMode.HALF_UP)};
    }

    private void requireProduct(int productId) {
        if (!charts.productExists(productId)) throw new ApiException(404, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm.");
    }

    private static ApiException invalid(String message) {
        return new ApiException(400, "SIZE_CHART_INVALID", message);
    }

    /** Chưa chạy migration (chưa có bảng product_size_chart) -> báo lỗi dễ hiểu. */
    static <T> T whenReady(Supplier<T> work) {
        try {
            return work.get();
        } catch (BadSqlGrammarException e) {
            throw new ApiException(503, "SIZE_CHART_UNAVAILABLE",
                    "Tính năng bảng size chưa sẵn sàng (chưa tạo bảng product_size_chart).");
        }
    }
}
