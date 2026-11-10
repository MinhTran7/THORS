
package com.thors.module.category.dto;

public class UpdateCategoryRequest {

    private String categoryName;
    private String description;
    // Danh mục cha (null = danh mục gốc)
    private Integer parentId;
    // Đối tượng: MEN / WOMEN / KIDS / UNISEX (null/rỗng = không áp dụng)
    private String targetGroup;

    public UpdateCategoryRequest() {
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

    public Integer getParentId() {
        return parentId;
    }

    public void setParentId(Integer parentId) {
        this.parentId = parentId;
    }

    public String getTargetGroup() {
        return targetGroup;
    }

    public void setTargetGroup(String targetGroup) {
        this.targetGroup = targetGroup;
    }
}
