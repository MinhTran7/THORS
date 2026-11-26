
package com.thors.module.category.service;

import com.thors.module.category.entity.Category;
import com.thors.module.category.repository.CategoryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.thors.module.category.dto.CreateCategoryRequest;
import java.text.Normalizer;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.dao.DataIntegrityViolationException;
import com.thors.common.ApiException;
import com.thors.module.category.dto.UpdateCategoryRequest;
import com.thors.module.category.dto.TransferCategoryProductsRequest;

/**
 * Danh mục nhiều cấp (không giới hạn): danh mục gốc (vd "Giày") → con (vd "Giày nữ") → con của con (vd "Giày cao gót").
 * Mỗi danh mục có thể gắn đối tượng khách hàng: mã chuẩn MEN / WOMEN / KIDS / UNISEX hoặc chữ tự nhập (vd "Bé gái").
 */
@Service
public class CategoryService {

    /** Đối tượng hợp lệ của danh mục. */
    public static final Set<String> TARGET_GROUPS = Set.of("MEN", "WOMEN", "KIDS", "UNISEX");

    /** Gõ tên tiếng Việt của đối tượng chuẩn thì quy về mã chuẩn để cửa hàng lọc không bị trùng ("nữ" = "Nữ" = WOMEN). */
    private static final Map<String, String> TARGET_ALIASES = Map.of(
            "nam", "MEN",
            "nu", "WOMEN",
            "tre em", "KIDS",
            "nam & nu", "UNISEX",
            "nam nu", "UNISEX",
            "nam va nu", "UNISEX",
            "unisex", "UNISEX");

    /** Khóa icon: chữ, số, dấu "-" (khớp danh sách icon ở frontend, vd "skin", "shopping-cart"). */
    private static final java.util.regex.Pattern ICON_KEY = java.util.regex.Pattern.compile("[a-z0-9][a-z0-9-]{0,39}");

    /** Đối tượng tự nhập dài tối đa (khớp cột target_group VARCHAR(30) sau migration 2026-11-11). */
    static final int TARGET_MAX_LENGTH = 30;

    private final CategoryRepository categoryRepository;

    public CategoryService(CategoryRepository categoryRepository) {
        this.categoryRepository = categoryRepository;
    }

    public List<Category> getAllCategories() {
        return categoryRepository.findAll();
    }


    /** Tạo danh mục, trả về danh mục vừa tạo (có categoryId) cho POST /api/categories. */
    @Transactional
    public Category createCategory(CreateCategoryRequest request) {

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

        // 5. Danh mục cha + đối tượng + icon
        String targetGroup = normalizeTargetGroup(request.getTargetGroup());
        String icon = normalizeIcon(request.getIcon());
        Integer parentId = request.getParentId();
        if (parentId != null) {
            validateParent(parentId, null);
        }

        // 6. Lưu danh mục, lấy categoryId tự tăng
        int categoryId;
        if (parentId == null && targetGroup == null) {
            categoryId = categoryRepository.insert(categoryName, description);
        } else {
            requireHierarchySupport();
            try {
                categoryId = categoryRepository.insert(categoryName, description, parentId, targetGroup);
            } catch (DataIntegrityViolationException e) {
                throw customTargetUnavailable(targetGroup, e);
            }
        }

        // 7. Icon tự chọn
        if (icon != null) {
            categoryRepository.updateIconByName(categoryName, icon);
        }

        // 8. Đọc lại dòng vừa tạo (có sẵn parentName, icon mặc định...); không đọc được thì dựng từ dữ liệu đã lưu
        return categoryRepository.findById(categoryId).orElseGet(() -> {
            Category category = new Category();
            category.setCategoryId(categoryId);
            category.setCategoryName(categoryName);
            category.setDescription(description);
            category.setStatus("ACTIVE");
            category.setParentId(parentId);
            category.setTargetGroup(targetGroup);
            category.setIcon(icon);
            return category;
        });
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

        // 6. Danh mục cha + đối tượng + icon
        String targetGroup = normalizeTargetGroup(request.getTargetGroup());
        String icon = normalizeIcon(request.getIcon());
        Integer parentId = request.getParentId();
        if (parentId != null) {
            if (parentId == categoryId) {
                throw new ApiException(
                        400,
                        "CATEGORY_PARENT_SELF",
                        "Danh mục không thể là danh mục cha của chính nó."
                );
            }
            // Giữ nguyên danh mục cha cũ thì không bắt buộc cha đang hoạt động
            boolean parentChanged = !parentId.equals(current.getParentId());
            validateParent(parentId, parentChanged ? null : parentId);
            // Không cho chọn chính danh mục con / cháu của mình làm cha (tạo vòng lặp)
            if (parentChanged) {
                rejectCycle(categoryId, parentId, current.getCategoryName());
            }
        }

        // 7. Cập nhật danh mục
        int updatedRows;
        if (categoryRepository.supportsHierarchy()) {
            try {
                updatedRows = categoryRepository.update(
                        categoryId, categoryName, description, parentId, targetGroup);
            } catch (DataIntegrityViolationException e) {
                throw customTargetUnavailable(targetGroup, e);
            }
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

        // 8. Icon tự chọn (null = về icon mặc định); DB chưa có cột icon thì bỏ qua khi không chọn icon
        if (icon != null || categoryRepository.supportsIcon()) {
            categoryRepository.updateIcon(categoryId, icon);
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

    /** Danh sách sản phẩm gắn trực tiếp vào danh mục nguồn (hiển thị để Owner tick chọn khi chuyển). */
    public List<Map<String, Object>> getDirectProducts(int categoryId) {
        categoryRepository.findById(categoryId)
                .orElseThrow(() -> new ApiException(404, "CATEGORY_NOT_FOUND", "Không tìm thấy danh mục."));
        return categoryRepository.findDirectProducts(categoryId);
    }

    /**
     * Chuyển toàn bộ hoặc các sản phẩm đã chọn đang gắn trực tiếp vào danh mục nguồn sang một danh mục lá đang hoạt động.
     * Nếu danh mục nguồn là danh mục cha và không bật {@code allowOutsideBranch}, danh mục đích bắt buộc phải thuộc nhánh con của nó.
     */
    @Transactional
    public Map<String, Object> transferProducts(int sourceCategoryId, TransferCategoryProductsRequest request) {
        if (request == null || request.getTargetCategoryId() == null) {
            throw new ApiException(400, "TARGET_CATEGORY_REQUIRED", "Vui lòng chọn danh mục đích.");
        }

        int targetCategoryId = request.getTargetCategoryId();
        if (sourceCategoryId == targetCategoryId) {
            throw new ApiException(400, "CANNOT_TRANSFER_TO_SAME_CATEGORY",
                    "Danh mục đích phải khác danh mục hiện tại.");
        }

        // 1. Danh mục nguồn
        categoryRepository.findById(sourceCategoryId)
                .orElseThrow(() -> new ApiException(404, "CATEGORY_NOT_FOUND", "Không tìm thấy danh mục nguồn."));

        // 2. Danh mục đích: đang hoạt động và là danh mục lá (không có danh mục con)
        Category target = categoryRepository.findById(targetCategoryId)
                .orElseThrow(() -> new ApiException(404, "TARGET_CATEGORY_NOT_FOUND", "Không tìm thấy danh mục đích."));

        if (!"ACTIVE".equals(target.getStatus())) {
            throw new ApiException(400, "TARGET_CATEGORY_INACTIVE",
                    "Danh mục đích \"" + target.getCategoryName() + "\" đang ngưng hoạt động.");
        }

        if (categoryRepository.countChildren(targetCategoryId) > 0) {
            throw new ApiException(400, "TARGET_CATEGORY_HAS_CHILDREN",
                    "Danh mục \"" + target.getCategoryName()
                            + "\" là danh mục cha. Hãy chọn một danh mục con (danh mục lá).");
        }

        if (!request.isAllowOutsideBranch()
                && categoryRepository.countChildren(sourceCategoryId) > 0
                && !isDescendant(sourceCategoryId, targetCategoryId)) {
            throw new ApiException(400, "TARGET_NOT_DESCENDANT",
                    "Hãy chọn một danh mục con thuộc nhánh của danh mục nguồn.");
        }

        // 3. Chuyển (toàn bộ hoặc theo danh sách sản phẩm đã chọn)
        int movedCount;
        List<Integer> selectedIds = request.getProductIds();
        if (selectedIds != null) {
            List<Integer> cleanIds = selectedIds.stream()
                    .filter(id -> id != null && id > 0)
                    .distinct()
                    .toList();
            if (cleanIds.isEmpty()) {
                throw new ApiException(400, "PRODUCTS_REQUIRED", "Vui lòng chọn ít nhất một sản phẩm để chuyển.");
            }
            movedCount = categoryRepository.transferProducts(sourceCategoryId, targetCategoryId, cleanIds);
            if (movedCount == 0) {
                throw new ApiException(409, "NO_PRODUCTS_TO_TRANSFER",
                        "Các sản phẩm đã chọn không còn nằm ở danh mục nguồn.");
            }
            if (movedCount < cleanIds.size()) {
                throw new ApiException(409, "PRODUCTS_CHANGED",
                        "Một số sản phẩm đã chọn không thuộc danh mục nguồn hoặc vừa được chuyển trước đó.");
            }
        } else {
            movedCount = categoryRepository.transferProducts(sourceCategoryId, targetCategoryId);
            if (movedCount == 0) {
                throw new ApiException(409, "NO_PRODUCTS_TO_TRANSFER",
                        "Danh mục này không còn sản phẩm nào để chuyển.");
            }
        }

        int remainingCount = categoryRepository.findDirectProducts(sourceCategoryId).size();

        return Map.of(
                "movedCount", movedCount,
                "remainingCount", remainingCount,
                "sourceCategoryId", sourceCategoryId,
                "targetCategoryId", targetCategoryId,
                "targetCategoryName", target.getCategoryName()
        );
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

    /**
     * null / rỗng -> null (không áp dụng). Mã chuẩn hoặc tên tiếng Việt của mã chuẩn -> mã chuẩn (MEN/WOMEN/KIDS/UNISEX).
     * Còn lại là đối tượng tự nhập (vd "Bé gái", "Người cao tuổi"): gộp khoảng trắng, tối đa 30 ký tự.
     */
    static String normalizeTargetGroup(String targetGroup) {
        if (targetGroup == null || targetGroup.isBlank()) {
            return null;
        }
        String value = targetGroup.trim().replaceAll("\\s+", " ");
        String upper = value.toUpperCase();
        if (TARGET_GROUPS.contains(upper)) {
            return upper;
        }
        String alias = TARGET_ALIASES.get(fold(value));
        if (alias != null) {
            return alias;
        }
        if (value.length() > TARGET_MAX_LENGTH || value.chars().anyMatch(Character::isISOControl)) {
            throw new ApiException(
                    400,
                    "INVALID_TARGET_GROUP",
                    "Đối tượng tự nhập tối đa " + TARGET_MAX_LENGTH + " ký tự."
            );
        }
        return value;
    }

    /** null / rỗng -> null (icon mặc định); khóa sai định dạng -> 400; DB chưa có cột icon -> 409. */
    private String normalizeIcon(String icon) {
        if (icon == null || icon.isBlank()) {
            return null;
        }
        String value = icon.trim().toLowerCase();
        if (!ICON_KEY.matcher(value).matches()) {
            throw new ApiException(400, "INVALID_CATEGORY_ICON", "Icon danh mục không hợp lệ.");
        }
        if (!categoryRepository.supportsIcon()) {
            throw new ApiException(
                    409,
                    "CATEGORY_ICON_UNAVAILABLE",
                    "Cơ sở dữ liệu chưa hỗ trợ icon danh mục. "
                            + "Hãy chạy migration database/migrations/2026-11-11_category_icon.sql."
            );
        }
        return value;
    }

    /** Viết thường, bỏ dấu: "Trẻ Em" -> "tre em". */
    private static String fold(String value) {
        String lower = value.toLowerCase().replace('đ', 'd');
        return Normalizer.normalize(lower, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
    }

    /**
     * Danh mục cha phải tồn tại và đang hoạt động (cha có thể là danh mục con — không giới hạn số cấp).
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

        if (!"ACTIVE".equals(parent.getStatus()) && !Integer.valueOf(parentId).equals(keepInactiveParentId)) {
            throw new ApiException(
                    400,
                    "PARENT_CATEGORY_INACTIVE",
                    "Danh mục cha \"" + parent.getCategoryName() + "\" đang ngưng hoạt động."
            );
        }
    }

    /** Đi ngược từ danh mục cha mới lên gốc: gặp lại chính danh mục đang sửa nghĩa là chọn con/cháu làm cha. */
    private void rejectCycle(int categoryId, int parentId, String categoryName) {
        if (isDescendant(categoryId, parentId)) {
            throw new ApiException(
                    400,
                    "CATEGORY_PARENT_CYCLE",
                    "Không thể chọn danh mục con / cháu của \"" + categoryName + "\" làm danh mục cha."
            );
        }
    }

    /** Kiểm tra {@code nodeId} có phải là con / cháu của {@code ancestorId} không. */
    private boolean isDescendant(int ancestorId, int nodeId) {
        Integer cursor = nodeId;
        for (int depth = 0; cursor != null && depth < 1000; depth++) {
            if (cursor == ancestorId) {
                return true;
            }
            cursor = categoryRepository.findById(cursor).map(Category::getParentId).orElse(null);
        }
        return false;
    }

    /** DB chưa chạy migration 2026-11-11 thì cột target_group còn CHECK chỉ nhận 4 mã chuẩn. */
    private static RuntimeException customTargetUnavailable(String targetGroup, DataIntegrityViolationException e) {
        if (targetGroup == null || TARGET_GROUPS.contains(targetGroup)) {
            return e;
        }
        return new ApiException(
                409,
                "CUSTOM_TARGET_UNAVAILABLE",
                "Cơ sở dữ liệu chưa hỗ trợ đối tượng tự nhập. "
                        + "Hãy chạy migration database/migrations/2026-11-11_category_free_target.sql."
        );
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
