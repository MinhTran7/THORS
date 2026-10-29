
package com.thors.module.product.controller;

import com.thors.module.product.dto.CreateProductRequest;
import com.thors.module.product.dto.BatchCreateProductRequest;
import com.thors.module.product.entity.Product;
import com.thors.module.product.service.ProductService;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;

import org.springframework.web.multipart.MultipartFile;


import com.thors.module.product.dto.UpdateProductRequest;
import org.springframework.web.bind.annotation.PutMapping;

import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import com.thors.module.product.dto.ChangeProductStatusRequest;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    // ==========================================
    // VIEW PRODUCT LIST
    // ==========================================

    @GetMapping
    public List<Product> getAllProducts() {
        return productService.getAllProducts();
    }

    // ==========================================
    // PRODUCT STATISTICS
    // ==========================================

    @GetMapping("/statistics")
    public ResponseEntity<Map<String, Object>> getProductStatistics() {

        Map<String, Object> statistics =
                productService.getProductStatistics();

        return ResponseEntity.ok(statistics);
    }

    // ==========================================
    // VIEW PRODUCT DETAIL
    // ==========================================

    @GetMapping("/{productId}")
    public ResponseEntity<Map<String, Object>> getProductById(
            @PathVariable int productId
    ) {
        System.out.println("GET PRODUCT DETAIL CALLED: " + productId);

        Map<String, Object> productDetail =
                productService.getProductById(productId);

        return ResponseEntity.ok(productDetail);
    }

    // ==========================================
    // ADD PRODUCT - JSON
    // ==========================================

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> createProduct(
            @RequestBody CreateProductRequest request
    ) {

        int productId = productService.createProduct(request);

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of(
                        "message", "Product created successfully.",
                        "productId", productId
                ));
    }

    // ==========================================
    // BATCH ADD PRODUCTS - JSON
    // ==========================================

    @PostMapping(value = "/batch", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> createProductsBatch(
            @RequestBody BatchCreateProductRequest request
    ) {

        Map<String, Object> result = productService.createProductsBatch(request);

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(result);
    }

    // ==========================================
    // ADD PRODUCT WITH IMAGES
    // ==========================================

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> createProductWithImages(
            @RequestPart("product") CreateProductRequest request,
            @RequestPart("images") List<MultipartFile> images
    ) throws IOException {

        int productId = productService.createProductWithImages(
                request,
                images
        );

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of(
                        "message", "Product created successfully.",
                        "productId", productId
                ));
    }

    // ==========================================
    // HANDLE VALIDATION ERROR
    // ==========================================

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleValidationError(
            IllegalArgumentException ex
    ) {

        return ResponseEntity.badRequest()
                .body(Map.of(
                        "message", ex.getMessage()
                ));
    }

    // ==========================================
    // UPDATE PRODUCT - JSON
    // ==========================================

    @PutMapping(
            value = "/{productId}",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<Map<String, Object>> updateProduct(
            @PathVariable int productId,
            @RequestBody UpdateProductRequest request
    ) {

        productService.updateProduct(productId, request);

        return ResponseEntity.ok(
                Map.of(
                        "message", "Product updated successfully.",
                        "productId", productId
                )
        );
    }

    // ==========================================
    // CHANGE PRODUCT STATUS
    // ==========================================

    @PatchMapping(
            value = "/{productId}/status",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<Map<String, Object>> changeProductStatus(
            @PathVariable int productId,
            @RequestBody ChangeProductStatusRequest request
    ) {

        productService.changeProductStatus(
                productId,
                request.getStatus()
        );

        return ResponseEntity.ok(
                Map.of(
                        "message", "Product status updated successfully.",
                        "productId", productId,
                        "status", request.getStatus()
                )
        );
    }

    // ==========================================
    // DELETE PRODUCT (SAFE DELETE)
    // ==========================================

    @DeleteMapping("/{productId}")
    public ResponseEntity<Map<String, Object>> deleteProduct(
            @PathVariable int productId
    ) {
        productService.deleteProduct(productId);
        return ResponseEntity.ok(
                Map.of(
                        "message", "Sản phẩm đã được xóa thành công.",
                        "productId", productId
                )
        );
    }

}
