
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

    // Mã sản phẩm (SKU); null nếu DB chưa chạy migration 2026-11-10_product_sku.sql
    private String sku;

    public String getSku() {
        return sku;
    }

    public void setSku(String sku) {
        this.sku = sku;
    }

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

    // ==========================================
    // Số liệu cho danh sách sản phẩm (chỉ có ở GET /api/products),
    // tính theo biến thể đang hoạt động, cùng công thức màn hình Tồn kho
    // ==========================================

    private Integer activeVariantCount;     // số biến thể đang hoạt động
    private Integer sellableStock;          // Σ (tồn − đang giữ cho đơn), không âm
    private Integer outOfStockVariantCount; // biến thể tồn = 0
    private Integer lowStockVariantCount;   // biến thể có thể bán ≤ ngưỡng tối thiểu
    private String searchText;              // mã vạch, size, màu của các biến thể (phục vụ tìm kiếm)

    public Integer getActiveVariantCount() {
        return activeVariantCount;
    }

    public void setActiveVariantCount(Integer activeVariantCount) {
        this.activeVariantCount = activeVariantCount;
    }

    public Integer getSellableStock() {
        return sellableStock;
    }

    public void setSellableStock(Integer sellableStock) {
        this.sellableStock = sellableStock;
    }

    public Integer getOutOfStockVariantCount() {
        return outOfStockVariantCount;
    }

    public void setOutOfStockVariantCount(Integer outOfStockVariantCount) {
        this.outOfStockVariantCount = outOfStockVariantCount;
    }

    public Integer getLowStockVariantCount() {
        return lowStockVariantCount;
    }

    public void setLowStockVariantCount(Integer lowStockVariantCount) {
        this.lowStockVariantCount = lowStockVariantCount;
    }

    public String getSearchText() {
        return searchText;
    }

    public void setSearchText(String searchText) {
        this.searchText = searchText;
    }

    private String variantCodes;            // mã các biến thể đang hoạt động, "TH000051,TH000052"

    public String getVariantCodes() {
        return variantCodes;
    }

    public void setVariantCodes(String variantCodes) {
        this.variantCodes = variantCodes;
    }
}
