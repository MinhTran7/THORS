package com.thors.module.imagesearch;

import static org.junit.jupiter.api.Assertions.*;

import com.thors.module.imagesearch.color.ColorClassifier;
import com.thors.module.imagesearch.color.ColorNames;
import com.thors.module.imagesearch.color.ProductGroup;
import java.lang.reflect.Method;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ColorTest {

    @Test
    @DisplayName("Tên màu người bán nhập được quy về đúng nhóm màu")
    void dbColorNamesMapToFamilies() {
        assertEquals("den", ColorNames.familyOf("đen"));
        assertEquals("den", ColorNames.familyOf("Đen"));
        assertEquals("xanh", ColorNames.familyOf("Xanh Đậm"));
        assertEquals("xanh", ColorNames.familyOf("Xanh Da Trời"));
        assertEquals("xanh", ColorNames.familyOf("Xanh navy"));
        assertEquals("xanh-la", ColorNames.familyOf("Xanh Lá Cây"));
        assertEquals("do", ColorNames.familyOf("Đỏ Mận"));
        assertEquals("trang", ColorNames.familyOf("Trắng"));
        assertEquals("trang", ColorNames.familyOf("trắng kem"));
        assertEquals("be", ColorNames.familyOf("Be"));
        assertEquals("be", ColorNames.familyOf("Kem"));
        assertEquals("nau", ColorNames.familyOf("Nâu"));
        assertEquals("hong", ColorNames.familyOf("Hồng"));
        assertEquals("tim", ColorNames.familyOf("Tím"));
        assertEquals("vang", ColorNames.familyOf("Vàng"));
        assertEquals("xam", ColorNames.familyOf("Xám"));
        assertNull(ColorNames.familyOf("Họa tiết"));
        assertNull(ColorNames.familyOf(""));
        assertNull(ColorNames.familyOf(null));
    }

    @Test
    @DisplayName("Nhóm hàng đoán theo danh mục / tên sản phẩm của shop")
    void productGroups() {
        assertEquals(ProductGroup.FOOTWEAR, ProductGroup.of("Giày Da Nam", "Giày Da Nam Dáng Mũi Nhọn"));
        assertEquals(ProductGroup.FOOTWEAR, ProductGroup.of("Dép Quai Hậu Trẻ Em", "Dép Sục Trẻ Em"));
        assertEquals(ProductGroup.HANDBAG, ProductGroup.of("Túi Xách Nữ", "Túi Xách Nữ (Charm Hoa)"));
        assertEquals(ProductGroup.BACKPACK, ProductGroup.of("Balo Trẻ Em", "Balo Học Sinh Nữ (Charm Gấu Trắng)"));
        assertEquals(ProductGroup.BELT, ProductGroup.of("Thắt Lưng Nam", "Mặt Thắt Lưng Nam (Hình A)"));
        assertEquals(ProductGroup.CLOTHES, ProductGroup.of("Áo", "Áo Thun Cổ Tròn Basic"));
    }

    @Test
    @DisplayName("Bảng vector màu đọc được; ảnh trùng vector câu 'màu đỏ' thì đoán ra đỏ")
    void classifierLoadsAndPicksMatchingColor() throws Exception {
        ColorClassifier c = ColorClassifier.loadDefault();
        assertEquals(14, c.colors().size());
        Method textVector = ColorClassifier.class.getDeclaredMethod("textVector", ProductGroup.class, String.class);
        textVector.setAccessible(true);
        for (ProductGroup g : new ProductGroup[] {ProductGroup.BACKPACK, ProductGroup.FOOTWEAR, ProductGroup.HANDBAG, ProductGroup.CLOTHES}) {
            float[] red = (float[]) textVector.invoke(c, g, "do");
            double norm = 0;
            for (float f : red) norm += f * f;
            assertEquals(1.0, norm, 1e-3, "vector đã chuẩn hóa");
            ColorClassifier.Guess guess = c.guess(red, g);
            assertEquals("do", guess.key(), g.name());
            assertEquals("Đỏ", guess.name());
        }
        assertNull(c.guess(new float[768], ProductGroup.BELT), "mặt thắt lưng không kiểm màu");
    }
}
