
package com.thors.module.product.dto;

import java.math.BigDecimal;
import java.util.List;

public class UpdateProductRequest {

    private Integer categoryId;
    private String productName;
    private String description;
    private List<VariantRequest> variants;

    // Phiên bản dữ liệu lúc mở form (lấy từ GET /api/products/{id}).
    // Khác phiên bản hiện tại => người khác đã sửa trong lúc này => từ chối (409). null = không kiểm tra.
    private String version;

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    public Integer getCategoryId() {
        return categoryId;
    }

    public void setCategoryId(Integer categoryId) {
        this.categoryId = categoryId;
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

    public List<VariantRequest> getVariants() {
        return variants;
    }

    public void setVariants(List<VariantRequest> variants) {
        this.variants = variants;
    }

    public static class VariantRequest {

        // Existing variant: detailId != null
        // New variant: detailId == null
        private Integer detailId;

        private String size;
        private String color;
        private BigDecimal price;

        public Integer getDetailId() {
            return detailId;
        }

        public void setDetailId(Integer detailId) {
            this.detailId = detailId;
        }

        public String getSize() {
            return size;
        }

        public void setSize(String size) {
            this.size = size;
        }

        public String getColor() {
            return color;
        }

        public void setColor(String color) {
            this.color = color;
        }

        public BigDecimal getPrice() {
            return price;
        }

        public void setPrice(BigDecimal price) {
            this.price = price;
        }
    }
}
