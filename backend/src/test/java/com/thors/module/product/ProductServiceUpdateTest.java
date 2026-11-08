package com.thors.module.product;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.thors.common.ApiException;
import com.thors.module.product.dto.UpdateProductRequest;
import com.thors.module.product.entity.Product;
import com.thors.module.product.repository.ProductImageRepository;
import com.thors.module.product.repository.ProductRepository;
import com.thors.module.product.service.ProductImageService;
import com.thors.module.product.service.ProductService;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

/** Chỉnh sửa sản phẩm: danh mục đã ngưng, khóa đổi size/màu, hoán đổi biến thể, chống ghi đè. */
@ExtendWith(MockitoExtension.class)
class ProductServiceUpdateTest {

    private static final int PRODUCT_ID = 7;
    private static final int CURRENT_CATEGORY = 3;

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

        Product product = new Product();
        product.setProductId(PRODUCT_ID);
        product.setCategoryId(CURRENT_CATEGORY);
        product.setProductName("Áo thun");
        product.setDescription("Cotton");
        when(productRepository.findById(PRODUCT_ID)).thenReturn(product);
    }

    private static Map<String, Object> variantRow(int id, String size, String color, long price, boolean locked) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("detailId", id);
        row.put("size", size);
        row.put("color", color);
        row.put("price", BigDecimal.valueOf(price));
        row.put("stockQuantity", locked ? 5 : 0);
        row.put("locked", locked ? 1L : 0L);
        return row;
    }

    private static UpdateProductRequest.VariantRequest variant(Integer id, String size, String color, long price) {
        UpdateProductRequest.VariantRequest v = new UpdateProductRequest.VariantRequest();
        v.setDetailId(id);
        v.setSize(size);
        v.setColor(color);
        v.setPrice(BigDecimal.valueOf(price));
        return v;
    }

    private static UpdateProductRequest request(int categoryId, UpdateProductRequest.VariantRequest... variants) {
        UpdateProductRequest r = new UpdateProductRequest();
        r.setCategoryId(categoryId);
        r.setProductName("Áo thun");
        r.setDescription("Cotton");
        r.setVariants(new ArrayList<>(List.of(variants)));
        return r;
    }

    private void givenVariants(Map<String, Object>... rows) {
        when(productRepository.findVariantsByProductId(PRODUCT_ID)).thenReturn(List.of(rows));
        when(productRepository.updateProduct(eq(PRODUCT_ID), anyInt(), anyString(), any())).thenReturn(1);
    }

    @Test
    void keepingInactiveCurrentCategoryStillSaves() {
        givenVariants(variantRow(1, "M", "Đen", 100000, false));
        when(productRepository.updateVariant(anyInt(), anyInt(), anyString(), anyString(), any())).thenReturn(1);

        productService.updateProduct(PRODUCT_ID, request(CURRENT_CATEGORY, variant(1, "M", "Đen", 120000)));

        // Không kiểm tra trạng thái danh mục khi giữ nguyên danh mục cũ
        verifyNoInteractions(jdbcTemplate);
        verify(productRepository).updateVariant(PRODUCT_ID, 1, "M", "Đen", BigDecimal.valueOf(120000));
    }

    @Test
    void switchingToInactiveCategoryIsRejectedInVietnamese() {
        when(productRepository.findVariantsByProductId(PRODUCT_ID))
                .thenReturn(List.of(variantRow(1, "M", "Đen", 100000, false)));
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), eq(9))).thenReturn(0);

        ApiException e = assertThrows(ApiException.class,
                () -> productService.updateProduct(PRODUCT_ID, request(9, variant(1, "M", "Đen", 100000))));

        assertEquals("CATEGORY_INACTIVE", e.code);
        assertEquals(400, e.status);
    }

    @Test
    void lockedVariantCannotChangeSizeOrColor() {
        when(productRepository.findVariantsByProductId(PRODUCT_ID))
                .thenReturn(List.of(variantRow(1, "M", "Đen", 100000, true)));

        ApiException e = assertThrows(ApiException.class,
                () -> productService.updateProduct(PRODUCT_ID,
                        request(CURRENT_CATEGORY, variant(1, "L", "Đen", 100000))));

        assertEquals("VARIANT_LOCKED", e.code);
        verify(productRepository, never()).updateProduct(anyInt(), anyInt(), anyString(), any());
    }

    @Test
    void lockedVariantCanStillChangePrice() {
        givenVariants(variantRow(1, "M", "Đen", 100000, true));
        when(productRepository.updateVariant(anyInt(), anyInt(), anyString(), anyString(), any())).thenReturn(1);

        productService.updateProduct(PRODUCT_ID, request(CURRENT_CATEGORY, variant(1, "M", "Đen", 150000)));

        verify(productRepository).updateVariant(PRODUCT_ID, 1, "M", "Đen", BigDecimal.valueOf(150000));
    }

    @Test
    void swappingSizesGoesThroughTemporaryNames() {
        givenVariants(
                variantRow(1, "M", "Đen", 100000, false),
                variantRow(2, "L", "Đen", 100000, false));
        when(productRepository.updateVariant(anyInt(), anyInt(), anyString(), anyString(), any())).thenReturn(1);

        productService.updateProduct(PRODUCT_ID, request(CURRENT_CATEGORY,
                variant(1, "L", "Đen", 100000),
                variant(2, "M", "Đen", 100000)));

        InOrder order = inOrder(productRepository);
        order.verify(productRepository).updateVariant(eq(PRODUCT_ID), eq(1), eq("~1"), anyString(), any());
        order.verify(productRepository).updateVariant(eq(PRODUCT_ID), eq(2), eq("~2"), anyString(), any());
        order.verify(productRepository).updateVariant(eq(PRODUCT_ID), eq(1), eq("L"), anyString(), any());
        order.verify(productRepository).updateVariant(eq(PRODUCT_ID), eq(2), eq("M"), anyString(), any());
    }

    @Test
    void staleVersionIsRejectedWithConflict() {
        when(productRepository.findVariantsByProductId(PRODUCT_ID))
                .thenReturn(List.of(variantRow(1, "M", "Đen", 100000, false)));

        UpdateProductRequest r = request(CURRENT_CATEGORY, variant(1, "M", "Đen", 120000));
        r.setVersion("phien-ban-cu");

        ApiException e = assertThrows(ApiException.class, () -> productService.updateProduct(PRODUCT_ID, r));

        assertEquals(409, e.status);
        assertEquals("PRODUCT_VERSION_CONFLICT", e.code);
    }

    @Test
    void currentVersionFromDetailIsAccepted() {
        givenVariants(variantRow(1, "M", "Đen", 100000, false));
        when(productRepository.findImagesByProductId(PRODUCT_ID)).thenReturn(List.of());
        when(productRepository.updateVariant(anyInt(), anyInt(), anyString(), anyString(), any())).thenReturn(1);

        String version = (String) productService.getProductById(PRODUCT_ID).get("version");

        UpdateProductRequest r = request(CURRENT_CATEGORY, variant(1, "M", "Đen", 120000));
        r.setVersion(version);

        productService.updateProduct(PRODUCT_ID, r);

        verify(productRepository).updateVariant(PRODUCT_ID, 1, "M", "Đen", BigDecimal.valueOf(120000));
    }

    @Test
    void cannotDeleteTheLastImage() {
        when(productImageRepository.existsActiveImage(PRODUCT_ID, 4)).thenReturn(true);
        when(productImageRepository.countActiveImages(PRODUCT_ID)).thenReturn(1);

        ApiException e = assertThrows(ApiException.class, () -> productService.deleteProductImage(PRODUCT_ID, 4));

        assertEquals("IMAGE_LAST", e.code);
        verify(productImageRepository, never()).softDeleteImage(anyInt(), anyInt());
    }

    @Test
    void deletingAnImageKeepsAPrimaryImage() {
        when(productImageRepository.existsActiveImage(PRODUCT_ID, 4)).thenReturn(true);
        when(productImageRepository.countActiveImages(PRODUCT_ID)).thenReturn(3);
        when(productRepository.findImagesByProductId(PRODUCT_ID)).thenReturn(List.of());

        productService.deleteProductImage(PRODUCT_ID, 4);

        InOrder order = inOrder(productImageRepository);
        order.verify(productImageRepository).softDeleteImage(PRODUCT_ID, 4);
        order.verify(productImageRepository).ensurePrimaryImage(PRODUCT_ID);
    }
}
