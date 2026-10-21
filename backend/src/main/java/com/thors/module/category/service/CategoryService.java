
package com.thors.module.category.service;

import com.thors.module.category.entity.Category;
import com.thors.module.category.repository.CategoryRepository;
import org.springframework.stereotype.Service;
import com.thors.module.category.dto.CreateCategoryRequest;
import java.util.List;
import com.thors.common.ApiException;
import com.thors.module.category.dto.UpdateCategoryRequest;
@Service
public class CategoryService {

    private final CategoryRepository categoryRepository;

    public CategoryService(CategoryRepository categoryRepository) {
        this.categoryRepository = categoryRepository;
    }

    public List<Category> getAllCategories() {
        return categoryRepository.findAll();
    }


    public void createCategory(CreateCategoryRequest request) {

        // 1. Kiểm tra dữ liệu gửi lên
        if (request == null) {
            throw new ApiException(
                    400,
                    "CATEGORY_REQUIRED",
                    "Category information is required."
            );
        }

        // 2. Kiểm tra tên danh mục
        String categoryName = request.getCategoryName();

        if (categoryName == null || categoryName.isBlank()) {
            throw new ApiException(
                    400,
                    "CATEGORY_NAME_REQUIRED",
                    "Category name is required."
            );
        }

        categoryName = categoryName.trim();

        if (categoryName.length() > 100) {
            throw new ApiException(
                    400,
                    "CATEGORY_NAME_LENGTH",
                    "Category name must not exceed 100 characters."
            );
        }

        // 3. Kiểm tra mô tả
        String description = request.getDescription();

        if (description != null) {
            description = description.trim();

            if (description.length() > 255) {
                throw new ApiException(
                        400,
                        "CATEGORY_DESCRIPTION_LENGTH",
                        "Description must not exceed 255 characters."
                );
            }
        }

        // 4. Kiểm tra tên danh mục trùng
        if (categoryRepository.existsByName(categoryName)) {
            throw new ApiException(
                    409,
                    "CATEGORY_NAME_EXISTS",
                    "Category name already exists."
            );
        }

        // 5. Lưu danh mục
        categoryRepository.insert(categoryName, description);
    }


    public void updateCategory(
            int categoryId,
            UpdateCategoryRequest request) {

        // 1. Kiểm tra danh mục có tồn tại không
        if (categoryRepository.findById(categoryId).isEmpty()) {
            throw new ApiException(
                    404,
                    "CATEGORY_NOT_FOUND",
                    "Category not found."
            );
        }

        // 2. Kiểm tra dữ liệu gửi lên
        if (request == null) {
            throw new ApiException(
                    400,
                    "CATEGORY_REQUIRED",
                    "Category information is required."
            );
        }

        // 3. Kiểm tra tên danh mục
        String categoryName = request.getCategoryName();

        if (categoryName == null || categoryName.isBlank()) {
            throw new ApiException(
                    400,
                    "CATEGORY_NAME_REQUIRED",
                    "Category name is required."
            );
        }

        categoryName = categoryName.trim();

        if (categoryName.length() > 100) {
            throw new ApiException(
                    400,
                    "CATEGORY_NAME_LENGTH",
                    "Category name must not exceed 100 characters."
            );
        }

        // 4. Kiểm tra mô tả
        String description = request.getDescription();

        if (description != null) {
            description = description.trim();

            if (description.length() > 255) {
                throw new ApiException(
                        400,
                        "CATEGORY_DESCRIPTION_LENGTH",
                        "Description must not exceed 255 characters."
                );
            }
        }

        // 5. Kiểm tra tên trùng với danh mục khác
        if (categoryRepository.existsByNameExceptId(
                categoryName, categoryId)) {

            throw new ApiException(
                    409,
                    "CATEGORY_NAME_EXISTS",
                    "Category name already exists."
            );
        }

        // 6. Cập nhật danh mục
        int updatedRows = categoryRepository.update(
                categoryId,
                categoryName,
                description
        );

        if (updatedRows == 0) {
            throw new ApiException(
                    404,
                    "CATEGORY_NOT_FOUND",
                    "Category not found."
            );
        }
    }

    public void changeCategoryStatus(int categoryId, String status) {

        // 1. Kiểm tra danh mục có tồn tại không
        categoryRepository.findById(categoryId)
                .orElseThrow(() -> new ApiException(
                        404,
                        "CATEGORY_NOT_FOUND",
                        "Không tìm thấy danh mục."
                ));

        // 2. Kiểm tra trạng thái hợp lệ
        if (status == null ||
                (!status.equals("ACTIVE") && !status.equals("INACTIVE"))) {

            throw new ApiException(
                    400,
                    "INVALID_CATEGORY_STATUS",
                    "Trạng thái danh mục không hợp lệ."
            );
        }

        // 3. Cập nhật trạng thái
        int updated = categoryRepository.updateStatus(categoryId, status);

        if (updated == 0) {
            throw new ApiException(
                    404,
                    "CATEGORY_NOT_FOUND",
                    "Không tìm thấy danh mục."
            );
        }
    }

}
