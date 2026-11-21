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
    void assignsThCodeFromVariantIdLikeWarehouse() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), eq(Integer.class), eq(29))).thenReturn(List.of(58, 59));
        // TH000059 đã bị biến thể khác dùng -> TH000059-1
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq("TH000058"))).thenReturn(0);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq("TH000059"))).thenReturn(1);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq("TH000059-1"))).thenReturn(0);
        when(jdbc.update(anyString(), anyString(), org.mockito.ArgumentMatchers.anyInt())).thenReturn(1);

        assertEquals(2, new ProductCodes(jdbc).assignVariantCodes(29));
        org.mockito.Mockito.verify(jdbc).update(anyString(), eq("TH000058"), eq(58));
        org.mockito.Mockito.verify(jdbc).update(anyString(), eq("TH000059-1"), eq(59));
    }

    @Test
    void suggestsNextThSku() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), eq(String.class), eq("TH%")))
                .thenReturn(List.of("TH000001", "TH000029", "THAO-01", "TH12"));

        assertEquals("TH000030", new ProductCodes(jdbc).suggestSku(6));
    }

    @Test
    void firstThSkuWhenNoneUsed() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);

        assertEquals("TH000001", new ProductCodes(jdbc).suggestSku(null));
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
