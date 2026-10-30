
package com.thors.module.category.dto;

public class UpdateCategoryRequest {

    private String categoryName;
    private String description;

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
}
