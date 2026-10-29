package com.thors.module.product.dto;

import java.util.List;

public class BatchCreateProductRequest {

    private List<CreateProductRequest> products;

    public List<CreateProductRequest> getProducts() {
        return products;
    }

    public void setProducts(List<CreateProductRequest> products) {
        this.products = products;
    }
}

