
package com.thors.module.category.controller;

import com.thors.module.category.dto.CreateCategoryRequest;
import com.thors.module.category.dto.UpdateCategoryRequest;
import com.thors.module.category.entity.Category;
import com.thors.module.category.service.CategoryService;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.thors.module.category.dto.UpdateCategoryStatusRequest;
import com.thors.module.category.dto.TransferCategoryProductsRequest;
import org.springframework.web.bind.annotation.PatchMapping;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/categories")
public class CategoryController {

    private final CategoryService categoryService;

    public CategoryController(CategoryService categoryService) {
        this.categoryService = categoryService;
    }

    // 1. View Category List
    @GetMapping
    public List<Category> getAllCategories() {
        return categoryService.getAllCategories();
    }

    // 2. Add Category
    @PostMapping
    public ResponseEntity<Category> createCategory(
            @RequestBody CreateCategoryRequest request) {

        Category created = categoryService.createCategory(request);

        // 201 kèm danh mục vừa tạo (có categoryId) - khỏi phải tải lại danh sách để tìm theo tên
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(created);
    }

    // 3. Update Category
    @PutMapping("/{categoryId}")
    public ResponseEntity<Void> updateCategory(
            @PathVariable int categoryId,
            @RequestBody UpdateCategoryRequest request) {

        categoryService.updateCategory(categoryId, request);

        return ResponseEntity.ok().build();
    }

    @PatchMapping("/{categoryId}/status")
    public ResponseEntity<Void> changeCategoryStatus(
            @PathVariable int categoryId,
            @RequestBody UpdateCategoryStatusRequest request) {

        categoryService.changeCategoryStatus(
                categoryId,
                request.getStatus()
        );

        return ResponseEntity.ok().build();
    }

    // Chuyển toàn bộ sản phẩm gắn trực tiếp sang một danh mục lá (chỉ OWNER - SecurityConfig: POST /api/categories/**)
    @PostMapping("/{categoryId}/transfer-products")
    public ResponseEntity<Map<String, Object>> transferProducts(
            @PathVariable int categoryId,
            @RequestBody TransferCategoryProductsRequest request) {

        return ResponseEntity.ok(categoryService.transferProducts(categoryId, request));
    }

}
