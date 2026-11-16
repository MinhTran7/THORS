
package com.thors.module.category.entity;

public class Category {

    private Integer categoryId;
    private String categoryName;
    private String description;
    private String status;

    // Danh mục 2 cấp: parentId = null -> danh mục gốc
    private Integer parentId;
    private String parentName;
    // Đối tượng: MEN / WOMEN / KIDS / UNISEX; null = không áp dụng
    private String targetGroup;
    // Số danh mục con (chỉ có ý nghĩa với danh mục gốc)
    private int childCount;
    // Khóa icon tự chọn (null = icon mặc định); cần migration 2026-11-11_category_icon.sql
    private String icon;

    public Category() {
    }

    public Integer getCategoryId() {
        return categoryId;
    }

    public void setCategoryId(Integer categoryId) {
        this.categoryId = categoryId;
    }

    public String getCategoryName() {
        return categoryName;
    }

    public void setCategoryName(String categoryName) {
        this.categoryName = categoryName;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Integer getParentId() {
        return parentId;
    }

    public void setParentId(Integer parentId) {
        this.parentId = parentId;
    }

    public String getParentName() {
        return parentName;
    }

    public void setParentName(String parentName) {
        this.parentName = parentName;
    }

    public String getTargetGroup() {
        return targetGroup;
    }

    public void setTargetGroup(String targetGroup) {
        this.targetGroup = targetGroup;
    }

    public int getChildCount() {
        return childCount;
    }

    public void setChildCount(int childCount) {
        this.childCount = childCount;
    }

    public String getIcon() {
        return icon;
    }

    public void setIcon(String icon) {
        this.icon = icon;
    }
}
