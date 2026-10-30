
package com.thors.module.category.controller;

import com.thors.module.category.dto.CreateCategoryRequest;
import com.thors.module.category.dto.UpdateCategoryRequest;
import com.thors.module.category.entity.Category;
import com.thors.module.category.service.CategoryService;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.thors.module.category.dto.UpdateCategoryStatusRequest;
import org.springframework.web.bind.annotation.PatchMapping;
import java.util.List;

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
    public ResponseEntity<Void> createCategory(
            @RequestBody CreateCategoryRequest request) {

        categoryService.createCategory(request);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .build();
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

}
