package com.thors.module.fitting.controller;

import com.thors.module.fitting.dto.SizeChartRequest;
import com.thors.module.fitting.dto.StandardSizeChart;
import com.thors.module.fitting.entity.SizeChartRow;
import com.thors.module.fitting.service.SizeChartService;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

/**
 * Bảng size của sản phẩm (trang quản trị). Quyền theo SecurityConfig có sẵn cho /api/products/**:
 * GET: Owner + Family Member; PUT / POST: chỉ Owner.
 */
@RestController
@RequestMapping("/api/products/{productId}/size-chart")
public class SizeChartController {

    private final SizeChartService service;

    public SizeChartController(SizeChartService service) {
        this.service = service;
    }

    @GetMapping
    public List<SizeChartRow> get(@PathVariable int productId) {
        return service.get(productId);
    }

    /** Lưu cả bảng (ghi đè). rows rỗng = xóa bảng size. */
    @PutMapping
    public List<SizeChartRow> save(@PathVariable int productId, @RequestBody SizeChartRequest request) {
        return service.save(productId, request == null ? null : request.rows());
    }

    /** Bảng size chuẩn tính theo danh mục + size của sản phẩm (chưa lưu; Owner xem / sửa rồi bấm Lưu). */
    @GetMapping("/standard")
    public StandardSizeChart standard(@PathVariable int productId) {
        return service.standard(productId);
    }

    /** Dùng bảng size của sản phẩm này cho mọi sản phẩm cùng danh mục. */
    @PostMapping("/apply-to-category")
    public Map<String, Integer> applyToCategory(@PathVariable int productId) {
        return Map.of("updated", service.applyToCategory(productId));
    }

    /** Sao chép bảng size từ sản phẩm khác (chỉ các size trùng). */
    @PostMapping("/copy")
    public List<SizeChartRow> copy(@PathVariable int productId, @RequestParam("from") int sourceProductId) {
        return service.copyFrom(productId, sourceProductId);
    }
}
