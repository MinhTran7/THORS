
package com.thors.module.category.service;

import com.thors.module.category.entity.Category;
import com.thors.module.category.repository.CategoryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.thors.module.category.dto.CreateCategoryRequest;
import java.util.List;
import java.util.Set;
import com.thors.common.ApiException;
import com.thors.module.category.dto.UpdateCategoryRequest;

/**
 * Danh mục 2 cấp: danh mục gốc (vd "Giày") và danh mục con (vd "Giày nam").
 * Mỗi danh mục có thể gắn đối tượng khách hàng (Nam / Nữ / Trẻ em / Nam & Nữ) để cửa hàng lọc theo giới tính.
 */
@Service
public class CategoryService {

    /** Đối tượng hợp lệ của danh mục. */
    public static final Set<String> TARGET_GROUPS = Set.of("MEN", "WOMEN", "KIDS", "UNISEX");

    private final CategoryRepository categoryRepository;

    public CategoryService(CategoryRepository categoryRepository) {
        this.categoryRepository = categoryRepository;
    }

    public List<Category> getAllCategories() {
        return categoryRepository.findAll();
    }


    @Transactional
    public void createCategory(CreateCategoryRequest request) {

        // 1. Kiểm tra dữ liệu gửi lên
        if (request == null) {
            throw new ApiException(
                    400,
                    "CATEGORY_REQUIRED",
                    "Vui lòng nhập thông tin danh mục."
            );
        }

        // 2. Kiểm tra tên danh mục
        String categoryName = validateName(request.getCategoryName());

        // 3. Kiểm tra mô tả
        String description = validateDescription(request.getDescription());

        // 4. Kiểm tra tên danh mục trùng
        if (categoryRepository.existsByName(categoryName)) {
            throw new ApiException(
                    409,
                    "CATEGORY_NAME_EXISTS",
                    "Danh mục \"" + categoryName + "\" đã tồn tại. Muốn chia theo Nam / Nữ / Trẻ em, hãy chọn \""
                            + categoryName + "\" làm danh mục cha và đặt tên riêng, ví dụ \""
                            + categoryName + " trẻ em\"."
            );
        }

        // 5. Danh mục cha + đối tượng
        String targetGroup = normalizeTargetGroup(request.getTargetGroup());
        Integer parentId = request.getParentId();
        if (parentId != null) {
            validateParent(parentId, null);
        }

        // 6. Lưu danh mục
        if (parentId == null && targetGroup == null) {
            categoryRepository.insert(categoryName, description);
        } else {
            requireHierarchySupport();
            categoryRepository.insert(categoryName, description, parentId, targetGroup);
        }
    }


    @Transactional
    public void updateCategory(
            int categoryId,
            UpdateCategoryRequest request) {

        // 1. Kiểm tra danh mục có tồn tại không
        Category current = categoryRepository.findById(categoryId)
                .orElseThrow(() -> new ApiException(
                        404,
                        "CATEGORY_NOT_FOUND",
                        "Không tìm thấy danh mục."
                ));

        // 2. Kiểm tra dữ liệu gửi lên
        if (request == null) {
            throw new ApiException(
                    400,
                    "CATEGORY_REQUIRED",
                    "Vui lòng nhập thông tin danh mục."
            );
        }

        // 3. Kiểm tra tên danh mục
        String categoryName = validateName(request.getCategoryName());

        // 4. Kiểm tra mô tả
        String description = validateDescription(request.getDescription());

        // 5. Kiểm tra tên trùng với danh mục khác
        if (categoryRepository.existsByNameExceptId(
                categoryName, categoryId)) {

            throw new ApiException(
                    409,
                    "CATEGORY_NAME_EXISTS",
                    "Tên danh mục đã tồn tại."
            );
        }

        // 6. Danh mục cha + đối tượng
        String targetGroup = normalizeTargetGroup(request.getTargetGroup());
        Integer parentId = request.getParentId();
        if (parentId != null) {
            if (parentId == categoryId) {
                throw new ApiException(
                        400,
                        "CATEGORY_PARENT_SELF",
                        "Danh mục không thể là danh mục cha của chính nó."
                );
            }
            // Đang có danh mục con thì không thể trở thành danh mục con (chỉ 2 cấp)
            if (current.getChildCount() > 0) {
                throw new ApiException(
                        409,
                        "CATEGORY_HAS_CHILDREN",
                        "Danh mục \"" + current.getCategoryName() + "\" đang có " + current.getChildCount()
                                + " danh mục con nên không thể chọn danh mục cha (chỉ hỗ trợ 2 cấp)."
                );
            }
            // Giữ nguyên danh mục cha cũ thì không bắt buộc cha đang hoạt động
            boolean parentChanged = !parentId.equals(current.getParentId());
            validateParent(parentId, parentChanged ? null : parentId);
        }

        // 7. Cập nhật danh mục
        int updatedRows;
        if (categoryRepository.supportsHierarchy()) {
            updatedRows = categoryRepository.update(
                    categoryId, categoryName, description, parentId, targetGroup);
        } else if (parentId == null && targetGroup == null) {
            updatedRows = categoryRepository.update(
                    categoryId,
                    categoryName,
                    description
            );
        } else {
            throw hierarchyUnavailable();
        }

        if (updatedRows == 0) {
            throw new ApiException(
                    404,
                    "CATEGORY_NOT_FOUND",
                    "Không tìm thấy danh mục."
            );
        }
    }

    @Transactional
    public void changeCategoryStatus(int categoryId, String status) {

        // 1. Kiểm tra danh mục có tồn tại không
        Category category = categoryRepository.findById(categoryId)
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

        // 3. Ràng buộc cha – con
        if (status.equals("INACTIVE")) {
            int activeChildren = categoryRepository.countActiveChildren(categoryId);
            if (activeChildren > 0) {
                throw new ApiException(
                        409,
                        "CATEGORY_HAS_ACTIVE_CHILDREN",
                        "Còn " + activeChildren + " danh mục con đang hoạt động. Hãy ngưng các danh mục con trước."
                );
            }
        } else if (category.getParentId() != null) {
            Category parent = categoryRepository.findById(category.getParentId()).orElse(null);
            if (parent != null && !"ACTIVE".equals(parent.getStatus())) {
                throw new ApiException(
                        409,
                        "PARENT_CATEGORY_INACTIVE",
                        "Danh mục cha \"" + parent.getCategoryName()
                                + "\" đang ngưng hoạt động. Hãy kích hoạt danh mục cha trước."
                );
            }
        }

        // 4. Cập nhật trạng thái
        int updated = categoryRepository.updateStatus(categoryId, status);

        if (updated == 0) {
            throw new ApiException(
                    404,
                    "CATEGORY_NOT_FOUND",
                    "Không tìm thấy danh mục."
            );
        }
    }

    // ==========================================
    // HELPERS
    // ==========================================

    private String validateName(String categoryName) {
        if (categoryName == null || categoryName.isBlank()) {
            throw new ApiException(
                    400,
                    "CATEGORY_NAME_REQUIRED",
                    "Vui lòng nhập tên danh mục."
            );
        }

        categoryName = categoryName.trim();

        if (categoryName.length() > 100) {
            throw new ApiException(
                    400,
                    "CATEGORY_NAME_LENGTH",
                    "Tên danh mục không được vượt quá 100 ký tự."
            );
        }
        return categoryName;
    }

    private String validateDescription(String description) {
        if (description != null) {
            description = description.trim();

            if (description.length() > 255) {
                throw new ApiException(
                        400,
                        "CATEGORY_DESCRIPTION_LENGTH",
                        "Mô tả không được vượt quá 255 ký tự."
                );
            }
        }
        return description;
    }

    /** null / rỗng -> null (không áp dụng); ngoài MEN/WOMEN/KIDS/UNISEX -> 400. */
    static String normalizeTargetGroup(String targetGroup) {
        if (targetGroup == null || targetGroup.isBlank()) {
            return null;
        }
        String value = targetGroup.trim().toUpperCase();
        if (!TARGET_GROUPS.contains(value)) {
            throw new ApiException(
                    400,
                    "INVALID_TARGET_GROUP",
                    "Đối tượng không hợp lệ (chỉ nhận Nam, Nữ, Trẻ em hoặc Nam & Nữ)."
            );
        }
        return value;
    }

    /**
     * Danh mục cha phải tồn tại, là danh mục gốc (chỉ 2 cấp) và đang hoạt động.
     * keepInactiveParentId: id danh mục cha hiện tại — giữ nguyên thì cho phép dù cha đã ngưng.
     */
    private void validateParent(int parentId, Integer keepInactiveParentId) {
        requireHierarchySupport();

        Category parent = categoryRepository.findById(parentId)
                .orElseThrow(() -> new ApiException(
                        400,
                        "PARENT_CATEGORY_NOT_FOUND",
                        "Danh mục cha không tồn tại."
                ));

        if (parent.getParentId() != null) {
            throw new ApiException(
                    400,
                    "PARENT_CATEGORY_NOT_ROOT",
                    "\"" + parent.getCategoryName()
                            + "\" đã là danh mục con nên không thể làm danh mục cha (chỉ hỗ trợ 2 cấp)."
            );
        }

        if (!"ACTIVE".equals(parent.getStatus()) && !Integer.valueOf(parentId).equals(keepInactiveParentId)) {
            throw new ApiException(
                    400,
                    "PARENT_CATEGORY_INACTIVE",
                    "Danh mục cha \"" + parent.getCategoryName() + "\" đang ngưng hoạt động."
            );
        }
    }

    private void requireHierarchySupport() {
        if (!categoryRepository.supportsHierarchy()) {
            throw hierarchyUnavailable();
        }
    }

    private static ApiException hierarchyUnavailable() {
        return new ApiException(
                409,
                "CATEGORY_HIERARCHY_UNAVAILABLE",
                "Cơ sở dữ liệu chưa hỗ trợ danh mục cha / đối tượng. "
                        + "Hãy chạy migration database/migrations/2026-11-10_category_hierarchy.sql."
        );
    }

}
