package com.thors.module.product;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.thors.common.ApiException;
import com.thors.module.product.service.ProductCodes;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

/** Mã sản phẩm (SKU) và mã biến thể tự tạo. */
class ProductCodesTest {

    @Test
    void foldTreatsAccentsLikeDatabase() {
        assertEquals(ProductCodes.variantKey("M", "Đen"), ProductCodes.variantKey("m", "den"));
        assertEquals(ProductCodes.variantKey("XL", "Xanh lá"), ProductCodes.variantKey("xl", " XANH LA "));
    }

    @Test
    void skuIsUppercasedAndValidated() {
        assertEquals("GN-0001", ProductCodes.normalizeSku(" gn-0001 "));
        assertNull(ProductCodes.normalizeSku("   "));
        assertThrows(ApiException.class, () -> ProductCodes.normalizeSku("GN 01"));
        assertThrows(ApiException.class, () -> ProductCodes.normalizeSku("GN-"));
        assertThrows(ApiException.class, () -> ProductCodes.normalizeSku("AB"));
    }

    @Test
    void suggestsNextSkuFromCategoryInitials() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), eq(String.class), eq(6))).thenReturn(List.of("Giày nam"));
        when(jdbc.queryForList(anyString(), eq(String.class), eq("GN-%"))).thenReturn(List.of("GN-0001", "GN-0007", "GN-ABC"));

        assertEquals("GN-0008", new ProductCodes(jdbc).suggestSku(6));
    }

    @Test
    void singleWordCategoryUsesFirstThreeLetters() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), eq(String.class), eq(5))).thenReturn(List.of("Balo"));

        assertEquals("BAL-0001", new ProductCodes(jdbc).suggestSku(5));
    }

    @Test
    void variantCodeIsSkuSizeColorAndUnique() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ProductCodes codes = new ProductCodes(jdbc);
        Set<String> taken = new HashSet<>();

        assertEquals("GN-0001-42-DEN", codes.uniqueVariantCode("GN-0001", "42", "Đen", taken));
        // trùng trong cùng lần lưu -> thêm hậu tố
        assertEquals("GN-0001-42-DEN-2", codes.uniqueVariantCode("GN-0001", "42", "đen", taken));
        assertEquals("GN-0001-XL-XANH-LA", codes.uniqueVariantCode("GN-0001", "xl", "Xanh lá", taken));
    }
}
