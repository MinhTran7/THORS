package com.thors.module.product;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.thors.common.ApiException;
import com.thors.module.product.dto.BatchCreateProductRequest;
import com.thors.module.product.dto.CreateProductRequest;
import com.thors.module.product.dto.UpdateProductRequest;
import com.thors.module.product.entity.Product;
import com.thors.module.product.repository.ProductImageRepository;
import com.thors.module.product.repository.ProductRepository;
import com.thors.module.product.service.ProductCodes;
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
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.multipart.MultipartFile;

/** Chặn trùng tên sản phẩm (không phân biệt hoa/thường, dấu, khoảng trắng) ở Thêm / Sửa / Nhập Excel. */
@ExtendWith(MockitoExtension.class)
class ProductNameDuplicateTest {

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
        productService = new ProductService(productRepository, jdbcTemplate, productImageService, productImageRepository);
        // Danh mục 1 đang hoạt động và là danh mục lá
        lenient().when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), eq(1))).thenReturn(1);
        lenient().when(jdbcTemplate.queryForObject(contains("parent_id"), eq(Integer.class), eq(1))).thenReturn(0);
    }

    private static Map<String, Object> nameRow(int id, String name) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("product_id", id);
        row.put("product_name", name);
        return row;
    }

    private static CreateProductRequest create(String name, int categoryId) {
        CreateProductRequest r = new CreateProductRequest();
        r.setCategoryId(categoryId);
        r.setProductName(name);
        CreateProductRequest.VariantRequest v = new CreateProductRequest.VariantRequest();
        v.setSize("M");
        v.setColor("Đen");
        v.setPrice(new BigDecimal("250000"));
        r.setVariants(List.of(v));
        return r;
    }

    private static BatchCreateProductRequest batch(CreateProductRequest... products) {
        BatchCreateProductRequest b = new BatchCreateProductRequest();
        b.setProducts(new ArrayList<>(List.of(products)));
        return b;
    }

    @Test
    void nameKeyIgnoresCaseAccentsAndSpaces() {
        String key = ProductCodes.nameKey("Áo Polo Nam");
        assertEquals(key, ProductCodes.nameKey("  áo   polo  NAM "));
        assertEquals(key, ProductCodes.nameKey("Ao Polo Nam"));
        assertEquals(ProductCodes.nameKey("Đầm dạ hội"), ProductCodes.nameKey("dam da hoi"));
        assertNotEquals(key, ProductCodes.nameKey("Áo Polo Nữ"));
    }

    @Test
    void catalogCreateRejectsExistingName() {
        when(productRepository.findAllNames()).thenReturn(List.of(nameRow(5, "Áo Polo Nam")));

        ApiException e = assertThrows(ApiException.class,
                () -> productService.createCatalogProduct(create("  ao   POLO nam ", 1)));

        assertEquals(409, e.status);
        assertEquals("PRODUCT_NAME_EXISTS", e.code);
        verify(productRepository, never()).insertProduct(any());
    }

    @Test
    void warehouseCreateKeepsAllowingSimilarName() {
        // WarehouseCatalog gọi createProduct() sau khi người dùng đã xác nhận allowSimilar: không chặn ở đây
        lenient().when(productRepository.findAllNames()).thenReturn(List.of(nameRow(5, "Áo Polo Nam")));
        when(productRepository.insertProduct(any())).thenReturn(77);

        assertEquals(77, productService.createProduct(create("Áo Polo Nam", 1)));
    }

    @Test
    void createWithImagesRejectsDuplicateBeforeUploading() throws Exception {
        when(productRepository.findAllNames()).thenReturn(List.of(nameRow(5, "Áo Polo Nam")));

        ApiException e = assertThrows(ApiException.class,
                () -> productService.createProductWithImages(create("Ao Polo Nam", 1), List.of(mock(MultipartFile.class))));

        assertEquals("PRODUCT_NAME_EXISTS", e.code);
        verify(productImageService, never()).uploadImage(any());
        verify(productRepository, never()).insertProduct(any());
    }

    @Test
    void batchRejectsDuplicateNamesInsideFileEvenAcrossCategories() {
        lenient().when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), eq(2))).thenReturn(1);
        lenient().when(jdbcTemplate.queryForObject(contains("parent_id"), eq(Integer.class), eq(2))).thenReturn(0);

        ApiException e = assertThrows(ApiException.class,
                () -> productService.createProductsBatch(batch(create("Quần Kaki", 1), create("quan  kaki", 2))));

        assertEquals("PRODUCT_NAME_DUPLICATED_IN_FILE", e.code);
        verify(productRepository, never()).insertProduct(any());
    }

    @Test
    void batchRejectsNameAlreadyInSystem() {
        when(productRepository.findAllNames()).thenReturn(List.of(nameRow(9, "Quần Kaki")));

        ApiException e = assertThrows(ApiException.class,
                () -> productService.createProductsBatch(batch(create("Áo Polo Nam", 1), create("QUAN KAKI", 1))));

        assertEquals("PRODUCT_NAME_EXISTS", e.code);
        verify(productRepository, never()).insertProduct(any());
    }

    // ---------------------------------------------------------------- Sửa sản phẩm

    private void givenProduct10() {
        Product product = new Product();
        product.setProductId(10);
        product.setCategoryId(1);
        product.setProductName("Áo thun");
        product.setDescription("Cotton");
        when(productRepository.findById(10)).thenReturn(product);
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("detailId", 1);
        row.put("size", "M");
        row.put("color", "Đen");
        row.put("price", BigDecimal.valueOf(100000));
        row.put("stockQuantity", 0);
        row.put("locked", 0L);
        lenient().when(productRepository.findVariantsByProductId(10)).thenReturn(List.of(row));
    }

    private static UpdateProductRequest update(String name) {
        UpdateProductRequest r = new UpdateProductRequest();
        r.setCategoryId(1);
        r.setProductName(name);
        r.setDescription("Cotton");
        UpdateProductRequest.VariantRequest v = new UpdateProductRequest.VariantRequest();
        v.setDetailId(1);
        v.setSize("M");
        v.setColor("Đen");
        v.setPrice(BigDecimal.valueOf(120000));
        r.setVariants(new ArrayList<>(List.of(v)));
        return r;
    }

    @Test
    void updateRejectsNameOfAnotherProduct() {
        givenProduct10();
        when(productRepository.findAllNames()).thenReturn(List.of(nameRow(10, "Áo thun"), nameRow(11, "Áo Polo Nam")));

        ApiException e = assertThrows(ApiException.class, () -> productService.updateProduct(10, update("áo polo nam")));

        assertEquals("PRODUCT_NAME_EXISTS", e.code);
        verify(productRepository, never()).updateProduct(anyInt(), anyInt(), anyString(), any());
    }

    @Test
    void updateKeepingOwnNameStillSaves() {
        givenProduct10();
        when(productRepository.findAllNames()).thenReturn(List.of(nameRow(10, "Áo thun"), nameRow(11, "Áo Polo Nam")));
        when(productRepository.updateProduct(eq(10), anyInt(), anyString(), any())).thenReturn(1);
        when(productRepository.updateVariant(anyInt(), anyInt(), anyString(), anyString(), any())).thenReturn(1);

        productService.updateProduct(10, update("Áo thun"));

        verify(productRepository).updateProduct(eq(10), anyInt(), eq("Áo thun"), any());
    }
}
