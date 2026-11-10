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

/** Danh mục 2 cấp (cha – con) + đối tượng Nam / Nữ / Trẻ em. */
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
    void parentMustBeRoot() {
        ApiException e = assertThrows(ApiException.class,
                () -> service.createCategory(create("Sneaker nam", 2, null)));

        assertEquals("PARENT_CATEGORY_NOT_ROOT", e.code);
    }

    @Test
    void parentMustBeActive() {
        ApiException e = assertThrows(ApiException.class,
                () -> service.createCategory(create("Áo nam", 3, "MEN")));

        assertEquals("PARENT_CATEGORY_INACTIVE", e.code);
    }

    @Test
    void rejectsUnknownTargetGroup() {
        ApiException e = assertThrows(ApiException.class,
                () -> service.createCategory(create("Giày nữ", 1, "GIRLS")));

        assertEquals("INVALID_TARGET_GROUP", e.code);
    }

    @Test
    void categoryWithChildrenCannotBecomeChild() {
        when(repo.findById(4)).thenReturn(Optional.of(category(4, "Dép", null, "ACTIVE", 0)));
        UpdateCategoryRequest r = new UpdateCategoryRequest();
        r.setCategoryName("Giày");
        r.setParentId(4);

        ApiException e = assertThrows(ApiException.class, () -> service.updateCategory(1, r));

        assertEquals("CATEGORY_HAS_CHILDREN", e.code);
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
    void parentOrTargetNeedsMigration() {
        when(repo.supportsHierarchy()).thenReturn(false);

        ApiException e = assertThrows(ApiException.class,
                () -> service.createCategory(create("Giày nữ", null, "WOMEN")));

        assertEquals("CATEGORY_HIERARCHY_UNAVAILABLE", e.code);
        verify(repo, never()).insert(anyString(), any());
    }
}
