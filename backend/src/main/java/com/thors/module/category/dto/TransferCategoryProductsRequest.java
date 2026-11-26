package com.thors.module.category.dto;

import java.util.List;

/** Body của POST /api/categories/{categoryId}/transfer-products: danh mục lá nhận sản phẩm và danh sách sản phẩm chọn chuyển. */
public class TransferCategoryProductsRequest {
    private Integer targetCategoryId;
    private List<Integer> productIds;
    private boolean allowOutsideBranch;

    public Integer getTargetCategoryId() {
        return targetCategoryId;
    }

    public void setTargetCategoryId(Integer targetCategoryId) {
        this.targetCategoryId = targetCategoryId;
    }

    public List<Integer> getProductIds() {
        return productIds;
    }

    public void setProductIds(List<Integer> productIds) {
        this.productIds = productIds;
    }

    public boolean isAllowOutsideBranch() {
        return allowOutsideBranch;
    }

    public void setAllowOutsideBranch(boolean allowOutsideBranch) {
        this.allowOutsideBranch = allowOutsideBranch;
    }
}
