package com.thors.module.category.dto;

/** Body của POST /api/categories/{categoryId}/transfer-products: danh mục lá nhận sản phẩm. */
public class TransferCategoryProductsRequest {
    private Integer targetCategoryId;

    public Integer getTargetCategoryId() {
        return targetCategoryId;
    }

    public void setTargetCategoryId(Integer targetCategoryId) {
        this.targetCategoryId = targetCategoryId;
    }
}
