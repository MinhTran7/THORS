
package com.thors.module.product.entity;

public class Product {

    private Integer productId;
    private Integer categoryId;
    private String categoryName;
    private String productName;
    private String description;
    private String status;
    private String primaryImageUrl;

    private java.math.BigDecimal minPrice;
    private java.math.BigDecimal maxPrice;
    private Integer totalStock;
    private Integer variantCount;
    private Integer onlineVariantCount;

    public Integer getProductId() {
        return productId;
    }

    public void setProductId(Integer productId) {
        this.productId = productId;
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

    public String getProductName() {
        return productName;
    }

    public void setProductName(String productName) {
        this.productName = productName;
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

    public String getPrimaryImageUrl() {
        return primaryImageUrl;
    }

    public void setPrimaryImageUrl(String primaryImageUrl) {
        this.primaryImageUrl = primaryImageUrl;
    }
    public java.math.BigDecimal getMinPrice() {
        return minPrice;
    }

    public void setMinPrice(java.math.BigDecimal minPrice) {
        this.minPrice = minPrice;
    }

    public java.math.BigDecimal getMaxPrice() {
        return maxPrice;
    }

    public void setMaxPrice(java.math.BigDecimal maxPrice) {
        this.maxPrice = maxPrice;
    }

    public Integer getTotalStock() {
        return totalStock;
    }

    public void setTotalStock(Integer totalStock) {
        this.totalStock = totalStock;
    }

    public Integer getVariantCount() {
        return variantCount;
    }

    public void setVariantCount(Integer variantCount) {
        this.variantCount = variantCount;
    }

    public Integer getOnlineVariantCount() {
        return onlineVariantCount;
    }

    public void setOnlineVariantCount(Integer onlineVariantCount) {
        this.onlineVariantCount = onlineVariantCount;
    }
}
