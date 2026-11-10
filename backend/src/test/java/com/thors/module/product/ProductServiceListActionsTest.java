package com.thors.module.product;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.thors.common.ApiException;
import com.thors.module.product.entity.Product;
import com.thors.module.product.repository.ProductImageRepository;
import com.thors.module.product.repository.ProductRepository;
import com.thors.module.product.service.ProductImageService;
import com.thors.module.product.service.ProductService;
import java.math.BigDecimal;
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

/** Thao tác trên danh sách sản phẩm: bật/tắt bán online, ẩn/hiện, xóa an toàn. */
@ExtendWith(MockitoExtension.class)
class ProductServiceListActionsTest {

    private static final int PRODUCT_ID = 5;

    @Mock
    private ProductRepository productRepository;

    @Mock
    private JdbcTemplate jdbcTemplate;

    @Mock
    private ProductImageService productImageService;

    @Mock
    private ProductImageRepository productImageRepository;

    private ProductService productService;
    private Product product;

    @BeforeEach
    void setUp() {
        productService = new ProductService(productRepository, jdbcTemplate, productImageService, productImageRepository);
        product = new Product();
        product.setProductId(PRODUCT_ID);
        product.setStatus("ACTIVE");
        product.setVariantCount(2);
        product.setOnlineVariantCount(2);
        when(productRepository.findById(PRODUCT_ID)).thenReturn(product);
    }

    // ---------- Bán online ----------

    @Test
    void enablingOnlineTurnsOnActivePricedVariants() {
        when(productRepository.countSellableVariants(PRODUCT_ID)).thenReturn(2);

        Map<String, Object> result = productService.setProductOnline(PRODUCT_ID, true);

        verify(productRepository).updateProductOnline(PRODUCT_ID, true);
        assertEquals(2, result.get("onlineVariantCount"));
    }

    @Test
    void cannotEnableOnlineForHiddenProduct() {
        product.setStatus("INACTIVE");

        ApiException e = assertThrows(ApiException.class, () -> productService.setProductOnline(PRODUCT_ID, true));

        assertEquals("PRODUCT_INACTIVE", e.code);
        verify(productRepository, never()).updateProductOnline(anyInt(), anyBoolean());
    }

    @Test
    void cannotEnableOnlineWithoutSellableVariant() {
        when(productRepository.countSellableVariants(PRODUCT_ID)).thenReturn(0);

        ApiException e = assertThrows(ApiException.class, () -> productService.setProductOnline(PRODUCT_ID, true));

        assertEquals("NO_SELLABLE_VARIANT", e.code);
    }

    @Test
    void disablingOnlineIsAlwaysAllowed() {
        product.setStatus("INACTIVE");

        productService.setProductOnline(PRODUCT_ID, false);

        verify(productRepository).updateProductOnline(PRODUCT_ID, false);
    }

    @Test
    void variantOnlineRequiresActiveVariantWithPrice() {
        Map<String, Object> inactive = new LinkedHashMap<>();
        inactive.put("detailId", 11);
        inactive.put("status", "INACTIVE");
        inactive.put("price", BigDecimal.TEN);
        when(productRepository.findVariantsByProductId(PRODUCT_ID)).thenReturn(List.of(inactive));

        ApiException e = assertThrows(ApiException.class, () -> productService.setVariantOnline(PRODUCT_ID, 11, true));

        assertEquals("VARIANT_INACTIVE", e.code);
        verify(productRepository, never()).updateVariantOnline(anyInt(), anyInt(), anyBoolean());
    }

    @Test
    void unknownVariantIsNotFound() {
        when(productRepository.findVariantsByProductId(PRODUCT_ID)).thenReturn(List.of());

        ApiException e = assertThrows(ApiException.class, () -> productService.setVariantOnline(PRODUCT_ID, 99, false));

        assertEquals(404, e.status);
    }

    // ---------- Ẩn / hiện ----------

    @Test
    void settingTheSameStatusIsANoOp() {
        productService.changeProductStatus(PRODUCT_ID, "ACTIVE");

        verify(productRepository, never()).updateProductStatus(anyInt(), anyString());
    }

    @Test
    void invalidStatusIsRejectedInVietnamese() {
        // Trạng thái sai bị chặn trước khi đọc sản phẩm
        org.mockito.Mockito.reset(productRepository);

        ApiException e = assertThrows(ApiException.class, () -> productService.changeProductStatus(PRODUCT_ID, "DELETED"));

        assertEquals("PRODUCT_STATUS", e.code);
    }

    // ---------- Xóa ----------

    @Test
    void productInUseCannotBeDeletedAndKeepsImages() throws Exception {
        when(productRepository.findDeleteBlockers(PRODUCT_ID)).thenReturn(List.of("đơn hàng", "phiếu kiểm kê"));

        ApiException e = assertThrows(ApiException.class, () -> productService.deleteProduct(PRODUCT_ID));

        assertEquals(409, e.status);
        assertTrue(e.getMessage().contains("đơn hàng, phiếu kiểm kê"));
        verify(productRepository, never()).deleteProductCascaded(anyInt());
        verify(productImageService, never()).deleteImage(anyString());
    }

    @Test
    void imagesAreRemovedOnlyAfterDatabaseDelete() throws Exception {
        when(productRepository.findDeleteBlockers(PRODUCT_ID)).thenReturn(List.of());
        when(productRepository.findCloudinaryPublicIds(PRODUCT_ID)).thenReturn(List.of("thors/products/a"));

        productService.deleteProduct(PRODUCT_ID);

        InOrder order = inOrder(productRepository, productImageService);
        order.verify(productRepository).deleteProductCascaded(PRODUCT_ID);
        order.verify(productImageService).deleteImage("thors/products/a");
    }
}
