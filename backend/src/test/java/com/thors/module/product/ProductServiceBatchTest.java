package com.thors.module.product;

import com.thors.module.product.dto.BatchCreateProductRequest;
import com.thors.module.product.dto.CreateProductRequest;
import com.thors.module.product.entity.Product;
import com.thors.module.product.repository.ProductImageRepository;
import com.thors.module.product.repository.ProductRepository;
import com.thors.module.product.service.ProductImageService;
import com.thors.module.product.service.ProductService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProductServiceBatchTest {

    @Mock
    private ProductRepository productRepository;

    @Mock
    private JdbcTemplate jdbcTemplate;

    @Mock
    private ProductImageService productImageService;

    @Mock
    private ProductImageRepository productImageRepository;

    private ProductService productService;

    @BeforeEach
    void setUp() {
        productService = new ProductService(
                productRepository,
                jdbcTemplate,
                productImageService,
                productImageRepository
        );
    }

    @Test
    void createProductsBatch_success() {
        // Arrange
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), eq(1)))
                .thenReturn(1);
        when(productRepository.insertProduct(any())).thenReturn(101, 102);

        BatchCreateProductRequest batchRequest = new BatchCreateProductRequest();
        List<CreateProductRequest> products = new ArrayList<>();

        // Product 1 with 2 variants
        CreateProductRequest p1 = new CreateProductRequest();
        p1.setCategoryId(1);
        p1.setProductName("Áo Polo Nam");
        p1.setDescription("Cotton cao cấp");
        p1.setImageUrl("https://example.com/polo.jpg");
        CreateProductRequest.VariantRequest v1 = new CreateProductRequest.VariantRequest();
        v1.setSize("M");
        v1.setColor("Đen");
        v1.setPrice(new BigDecimal("250000"));
        CreateProductRequest.VariantRequest v2 = new CreateProductRequest.VariantRequest();
        v2.setSize("L");
        v2.setColor("Đen");
        v2.setPrice(new BigDecimal("250000"));
        p1.setVariants(List.of(v1, v2));
        products.add(p1);

        // Product 2 with 1 variant
        CreateProductRequest p2 = new CreateProductRequest();
        p2.setCategoryId(1);
        p2.setProductName("Quần Kaki");
        p2.setDescription("Dáng ôm");
        CreateProductRequest.VariantRequest v3 = new CreateProductRequest.VariantRequest();
        v3.setSize("30");
        v3.setColor("Be");
        v3.setPrice(new BigDecimal("350000"));
        p2.setVariants(List.of(v3));
        products.add(p2);

        batchRequest.setProducts(products);

        // Act
        Map<String, Object> result = productService.createProductsBatch(batchRequest);

        // Assert
        assertNotNull(result);
        assertEquals(2, result.get("totalProducts"));
        assertEquals(3, result.get("totalVariants"));
        verify(productRepository, times(2)).insertProduct(any());
        verify(productRepository, times(3)).insertVariant(anyInt(), any());
        verify(productImageRepository, times(1)).insertImage(eq(101), eq("https://example.com/polo.jpg"), isNull(), eq(true));
    }

    @Test
    void createProductsBatch_emptyList_throwsException() {
        BatchCreateProductRequest batchRequest = new BatchCreateProductRequest();
        batchRequest.setProducts(List.of());

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> productService.createProductsBatch(batchRequest)
        );
        assertTrue(ex.getMessage().contains("must not be empty"));
    }

    @Test
    void createProductsBatch_inactiveCategory_throwsException() {
        // Category 99 returns 0 active
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), eq(99)))
                .thenReturn(0);

        BatchCreateProductRequest batchRequest = new BatchCreateProductRequest();
        CreateProductRequest p = new CreateProductRequest();
        p.setCategoryId(99);
        p.setProductName("Sản phẩm lỗi");
        CreateProductRequest.VariantRequest v = new CreateProductRequest.VariantRequest();
        v.setSize("M");
        v.setColor("Đen");
        v.setPrice(new BigDecimal("100000"));
        p.setVariants(List.of(v));
        batchRequest.setProducts(List.of(p));

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> productService.createProductsBatch(batchRequest)
        );
        assertTrue(ex.getMessage().contains("active category"));
        verify(productRepository, never()).insertProduct(any());
    }

    @Test
    void createProductsBatch_duplicateVariantCombination_throwsException() {
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), eq(1)))
                .thenReturn(1);

        BatchCreateProductRequest batchRequest = new BatchCreateProductRequest();
        CreateProductRequest p = new CreateProductRequest();
        p.setCategoryId(1);
        p.setProductName("Áo Lỗi Trùng Size");
        CreateProductRequest.VariantRequest v1 = new CreateProductRequest.VariantRequest();
        v1.setSize("M");
        v1.setColor("Đen");
        v1.setPrice(new BigDecimal("100000"));
        CreateProductRequest.VariantRequest v2 = new CreateProductRequest.VariantRequest();
        v2.setSize("M");
        v2.setColor("đen"); // Duplicate case-insensitive
        v2.setPrice(new BigDecimal("100000"));
        p.setVariants(List.of(v1, v2));
        batchRequest.setProducts(List.of(p));

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> productService.createProductsBatch(batchRequest)
        );
        assertTrue(ex.getMessage().contains("Duplicate size and color"));
        verify(productRepository, never()).insertProduct(any());
    }

    @Test
    void deleteProduct_success() {
        Product mockProduct = new Product();
        mockProduct.setProductId(10);
        when(productRepository.findById(10)).thenReturn(mockProduct);
        when(productRepository.countTransactionsByProductId(10)).thenReturn(0);
        when(productRepository.findCloudinaryPublicIds(10)).thenReturn(List.of("cloud-id-1"));

        productService.deleteProduct(10);

        verify(productRepository, times(1)).deleteProductCascaded(10);
    }

    @Test
    void deleteProduct_withTransactions_throwsException() {
        Product mockProduct = new Product();
        mockProduct.setProductId(10);
        when(productRepository.findById(10)).thenReturn(mockProduct);
        when(productRepository.countTransactionsByProductId(10)).thenReturn(2);

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> productService.deleteProduct(10)
        );
        assertTrue(ex.getMessage().contains("lịch sử giao dịch"));
        verify(productRepository, never()).deleteProductCascaded(anyInt());
    }
}

