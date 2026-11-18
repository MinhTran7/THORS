package com.thors.module.category;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.thors.common.ApiException;
import com.thors.module.category.dto.CreateCategoryRequest;
import com.thors.module.category.dto.UpdateCategoryRequest;
import com.thors.module.category.entity.Category;
import com.thors.module.category.repository.CategoryRepository;
import com.thors.module.category.service.CategoryService;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Danh mục nhiều cấp (cha – con – cháu…) + đối tượng chuẩn hoặc tự nhập. */
class CategoryHierarchyTest {

    private CategoryRepository repo;
    private CategoryService service;

    @BeforeEach
    void setUp() {
        repo = mock(CategoryRepository.class);
        service = new CategoryService(repo);
        when(repo.supportsHierarchy()).thenReturn(true);
        when(repo.findById(1)).thenReturn(Optional.of(category(1, "Giày", null, "ACTIVE", 1)));
        when(repo.findById(2)).thenReturn(Optional.of(category(2, "Giày nam", 1, "ACTIVE", 0)));
        when(repo.findById(3)).thenReturn(Optional.of(category(3, "Áo", null, "INACTIVE", 0)));
    }

    private static Category category(int id, String name, Integer parentId, String status, int children) {
        Category c = new Category();
        c.setCategoryId(id);
        c.setCategoryName(name);
        c.setParentId(parentId);
        c.setStatus(status);
        c.setChildCount(children);
        return c;
    }

    private static CreateCategoryRequest create(String name, Integer parentId, String target) {
        CreateCategoryRequest r = new CreateCategoryRequest();
        r.setCategoryName(name);
        r.setParentId(parentId);
        r.setTargetGroup(target);
        return r;
    }

    @Test
    void createsChildWithTargetGroup() {
        service.createCategory(create("Giày nữ", 1, "women"));

        verify(repo).insert("Giày nữ", null, 1, "WOMEN");
    }

    @Test
    void rootWithoutTargetUsesLegacyInsert() {
        service.createCategory(create("Phụ kiện", null, ""));

        verify(repo).insert("Phụ kiện", null);
        verify(repo, never()).insert(anyString(), any(), any(), any());
    }

    @Test
    void childCanHaveChildren() {
        service.createCategory(create("Sneaker nam", 2, null));

        verify(repo).insert("Sneaker nam", null, 2, null);
    }

    @Test
    void parentMustBeActive() {
        ApiException e = assertThrows(ApiException.class,
                () -> service.createCategory(create("Áo nam", 3, "MEN")));

        assertEquals("PARENT_CATEGORY_INACTIVE", e.code);
    }

    @Test
    void acceptsCustomTargetGroup() {
        service.createCategory(create("Giày bé gái", 1, "  Bé   gái "));

        verify(repo).insert("Giày bé gái", null, 1, "Bé gái");
    }

    @Test
    void vietnameseLabelMapsToStandardTarget() {
        service.createCategory(create("Giày nữ", 1, "nữ"));
        service.createCategory(create("Giày trẻ em", 1, "Trẻ Em"));

        verify(repo).insert("Giày nữ", null, 1, "WOMEN");
        verify(repo).insert("Giày trẻ em", null, 1, "KIDS");
    }

    @Test
    void rejectsTooLongTargetGroup() {
        ApiException e = assertThrows(ApiException.class,
                () -> service.createCategory(create("Giày nữ", 1, "x".repeat(31))));

        assertEquals("INVALID_TARGET_GROUP", e.code);
    }

    @Test
    void customTargetNeedsMigrationWhenCheckStillExists() {
        when(repo.insert(anyString(), any(), any(), any()))
                .thenThrow(new org.springframework.dao.DataIntegrityViolationException("ck_category_target_group"));

        ApiException e = assertThrows(ApiException.class,
                () -> service.createCategory(create("Giày bé gái", 1, "Bé gái")));

        assertEquals("CUSTOM_TARGET_UNAVAILABLE", e.code);
    }

    @Test
    void categoryWithChildrenCanMoveUnderAnotherCategory() {
        when(repo.findById(4)).thenReturn(Optional.of(category(4, "Thời trang", null, "ACTIVE", 0)));
        when(repo.update(anyInt(), anyString(), any(), any(), any())).thenReturn(1);
        UpdateCategoryRequest r = new UpdateCategoryRequest();
        r.setCategoryName("Giày");
        r.setParentId(4);

        service.updateCategory(1, r);

        verify(repo).update(1, "Giày", null, 4, null);
    }

    @Test
    void cannotChooseOwnDescendantAsParent() {
        // 1 "Giày" -> 2 "Giày nam" -> 6 "Sneaker nam"; chọn 6 làm cha của 1 là vòng lặp
        when(repo.findById(6)).thenReturn(Optional.of(category(6, "Sneaker nam", 2, "ACTIVE", 0)));
        UpdateCategoryRequest r = new UpdateCategoryRequest();
        r.setCategoryName("Giày");
        r.setParentId(6);

        ApiException e = assertThrows(ApiException.class, () -> service.updateCategory(1, r));

        assertEquals("CATEGORY_PARENT_CYCLE", e.code);
        verify(repo, never()).update(anyInt(), anyString(), any(), any(), any());
    }

    @Test
    void categoryCannotBeItsOwnParent() {
        UpdateCategoryRequest r = new UpdateCategoryRequest();
        r.setCategoryName("Giày nam");
        r.setParentId(2);

        ApiException e = assertThrows(ApiException.class, () -> service.updateCategory(2, r));

        assertEquals("CATEGORY_PARENT_SELF", e.code);
    }

    @Test
    void cannotDeactivateParentWithActiveChildren() {
        when(repo.countActiveChildren(1)).thenReturn(1);

        ApiException e = assertThrows(ApiException.class, () -> service.changeCategoryStatus(1, "INACTIVE"));

        assertEquals("CATEGORY_HAS_ACTIVE_CHILDREN", e.code);
        verify(repo, never()).updateStatus(anyInt(), anyString());
    }

    @Test
    void cannotActivateChildOfInactiveParent() {
        when(repo.findById(5)).thenReturn(Optional.of(category(5, "Áo nữ", 3, "INACTIVE", 0)));

        ApiException e = assertThrows(ApiException.class, () -> service.changeCategoryStatus(5, "ACTIVE"));

        assertEquals("PARENT_CATEGORY_INACTIVE", e.code);
    }

    @Test
    void savesChosenIconAfterCreate() {
        when(repo.supportsIcon()).thenReturn(true);

        service.createCategory(icon(create("Áo khoác", null, null), " Skin "));

        verify(repo).updateIconByName("Áo khoác", "skin");
    }

    @Test
    void rejectsInvalidIconKey() {
        when(repo.supportsIcon()).thenReturn(true);

        ApiException e = assertThrows(ApiException.class,
                () -> service.createCategory(icon(create("Áo khoác", null, null), "<svg>")));

        assertEquals("INVALID_CATEGORY_ICON", e.code);
        verify(repo, never()).insert(anyString(), any());
    }

    @Test
    void iconNeedsMigration() {
        ApiException e = assertThrows(ApiException.class,
                () -> service.createCategory(icon(create("Áo khoác", null, null), "skin")));

        assertEquals("CATEGORY_ICON_UNAVAILABLE", e.code);
    }

    @Test
    void updateWithoutIconKeepsWorkingBeforeMigration() {
        when(repo.update(anyInt(), anyString(), any(), any(), any())).thenReturn(1);
        UpdateCategoryRequest r = new UpdateCategoryRequest();
        r.setCategoryName("Giày");

        service.updateCategory(1, r);

        verify(repo, never()).updateIcon(anyInt(), any());
    }

    private static CreateCategoryRequest icon(CreateCategoryRequest r, String icon) {
        r.setIcon(icon);
        return r;
    }

    @Test
    void parentOrTargetNeedsMigration() {
        when(repo.supportsHierarchy()).thenReturn(false);

        ApiException e = assertThrows(ApiException.class,
                () -> service.createCategory(create("Giày nữ", null, "WOMEN")));

        assertEquals("CATEGORY_HIERARCHY_UNAVAILABLE", e.code);
        verify(repo, never()).insert(anyString(), any());
    }
}
