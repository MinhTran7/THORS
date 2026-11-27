package com.thors.module.imagesearch.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.thors.common.ApiException;
import com.thors.module.imagesearch.color.ColorClassifier;
import com.thors.module.imagesearch.color.TypeClassifier;
import com.thors.module.imagesearch.config.ImageSearchProperties;
import com.thors.module.imagesearch.model.ImageEncoder;
import com.thors.module.imagesearch.repository.ImageSearchRepository;
import com.thors.module.imagesearch.repository.ImageSearchRepository.CatalogImage;
import com.thors.module.imagesearch.repository.ImageSearchRepository.ProductRoot;
import com.thors.module.imagesearch.service.ImageSearchService.ColorTotal;
import com.thors.module.imagesearch.service.ImageSearchService.Decision;
import com.thors.module.shop.repository.ShopRepository;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class ImageSearchServiceTest {

    static final ColorClassifier.Guess RED_SURE = new ColorClassifier.Guess("do", "Đỏ", "do", 0.9);
    static final ColorClassifier.Guess NAVY_SURE = new ColorClassifier.Guess("xanh-navy", "Xanh navy", "xanh", 0.8);
    static final ColorClassifier.Guess RED_UNSURE = new ColorClassifier.Guess("do", "Đỏ", "do", 0.4);

    @Nested
    @DisplayName("4 trạng thái trả lời khi đã khớp mẫu (theo báo cáo lần 1)")
    class Decide {
        final List<ColorTotal> redPinkNavy = List.of(
                new ColorTotal("Đỏ", "do", 3), new ColorTotal("Hồng", "hong", 4), new ColorTotal("Xanh Đậm", "xanh", 0));

        @Test
        void colorInStock() {
            Decision d = ImageSearchService.decide(RED_SURE, redPinkNavy, 0.6);
            assertEquals("AVAILABLE", d.status());
            assertTrue(d.colorChecked());
            assertEquals("Shop có mẫu này, còn hàng màu Đỏ.", d.message());
        }

        @Test
        void colorOutOfStockButOthersAvailable() {
            Decision d = ImageSearchService.decide(NAVY_SURE, redPinkNavy, 0.6);
            assertEquals("OUT_OF_STOCK", d.status());
            assertEquals("Shop có mẫu này nhưng màu Xanh Đậm đang hết hàng. Màu còn hàng: Đỏ, Hồng.", d.message());
        }

        @Test
        void colorNotSold() {
            Decision d = ImageSearchService.decide(new ColorClassifier.Guess("vang", "Vàng", "vang", 0.85), redPinkNavy, 0.6);
            assertEquals("COLOR_UNAVAILABLE", d.status());
            assertEquals("Shop có mẫu này nhưng không có màu vàng. Màu còn hàng: Đỏ, Hồng.", d.message());
        }

        @Test
        @DisplayName("Không có màu này và màu shop bán cũng hết hàng: không nói 'màu đang có' (ca váy ren vàng / p74 Trắng = 0)")
        void colorNotSoldAndRestOutOfStock() {
            Decision d = ImageSearchService.decide(new ColorClassifier.Guess("vang", "Vàng", "vang", 0.99),
                    List.of(new ColorTotal("Trắng", "trang", 0)), 0.6);
            assertEquals("COLOR_UNAVAILABLE", d.status());
            assertEquals("Shop có mẫu này nhưng không có màu vàng. Shop chỉ bán màu Trắng và hiện đang hết hàng.", d.message());
        }

        @Test
        @DisplayName("AI không chắc màu thì không kết luận 'không có màu này'")
        void unsureColorIsIgnored() {
            Decision d = ImageSearchService.decide(new ColorClassifier.Guess("vang", "Vàng", "vang", 0.5), redPinkNavy, 0.6);
            assertEquals("AVAILABLE", d.status());
            assertFalse(d.colorChecked());
            assertEquals("Shop có mẫu này và đang còn hàng (màu Đỏ, Hồng).", d.message());
        }

        @Test
        @DisplayName("Có màu trong DB không nhận ra tên thì không kiểm màu")
        void unknownDbColorDisablesColorCheck() {
            List<ColorTotal> odd = List.of(new ColorTotal("Họa tiết", null, 2), new ColorTotal("Đỏ", "do", 0));
            Decision d = ImageSearchService.decide(NAVY_SURE, odd, 0.6);
            assertEquals("AVAILABLE", d.status());
            assertFalse(d.colorChecked());
        }

        @Test
        void allOutOfStock() {
            Decision d = ImageSearchService.decide(RED_UNSURE, List.of(new ColorTotal("Xanh", "xanh", 0)), 0.6);
            assertEquals("OUT_OF_STOCK", d.status());
            assertEquals("Shop có mẫu này nhưng hiện đang hết hàng.", d.message());
        }

        @Test
        @DisplayName("Mặt thắt lưng (không đoán màu) vẫn trả lời theo tồn kho")
        void beltWithoutColorGuess() {
            Decision d = ImageSearchService.decide(null, List.of(new ColorTotal("Vàng", "vang", 10)), 0.6);
            assertEquals("AVAILABLE", d.status());
        }
    }

    @Test
    @DisplayName("Gộp tồn kho theo màu (nhiều size), giữ tên màu như người bán nhập")
    void colorTotalsSumSizes() {
        List<ColorTotal> t = ImageSearchService.colorTotals(List.of(
                Map.of("color", "đen", "stock", 4), Map.of("color", "Đen", "stock", 5),
                Map.of("color", "Nâu", "stock", 0), Map.of("color", " ", "stock", 9)));
        assertEquals(2, t.size());
        assertEquals(new ColorTotal("đen", "den", 9), t.get(0));
        assertEquals(new ColorTotal("Nâu", "nau", 0), t.get(1));
    }

    @Nested
    @DisplayName("Tìm từ đầu đến cuối với mô hình giả")
    class EndToEnd {
        ImageSearchProperties props;
        ImageSearchRepository repo;
        ShopRepository shop;
        ImageSearchEngine engine;
        ImageSearchService service;
        float[] nextQuery;

        @BeforeEach
        void setUp() {
            props = new ImageSearchProperties();
            props.setEnabled(true);
            props.setSuggestions(2);
            repo = mock(ImageSearchRepository.class);
            shop = mock(ShopRepository.class);
            ImageEncoder fake = image -> nextQuery;
            engine = new ImageSearchEngine(props, repo, fake);
            // 4 sản phẩm: 53, 61, 63 thuộc danh mục gốc Balo; 62 thuộc Dép (không được gợi ý khi chụp balo)
            engine.index().sync(List.of(new CatalogImage(1, 53, "a"), new CatalogImage(2, 61, "b"), new CatalogImage(3, 62, "c"),
                            new CatalogImage(4, 63, "d")),
                    img -> new ImageEncoder.Vectors(switch (img.productId()) {
                        case 53 -> new float[] {1, 0, 0};
                        case 61 -> new float[] {0, 1, 0};
                        case 62 -> new float[] {0, 0, 1};
                        default -> new float[] {0, -1, 0};
                    }, null));
            engine.markReady();
            when(repo.findVisibleProductRoots()).thenReturn(List.of(
                    new ProductRoot(53, 5, "Balo"), new ProductRoot(61, 5, "Balo"),
                    new ProductRoot(62, 7, "Dép"), new ProductRoot(63, 5, "Balo")));
            when(repo.findProductCards(anyCollection())).thenAnswer(inv -> {
                List<Map<String, Object>> rows = new ArrayList<>();
                for (Integer id : inv.<Collection<Integer>>getArgument(0)) {
                    rows.add(Map.of("productId", id, "productName", "Balo p" + id, "categoryName", "Balo Trẻ Em",
                            "imageUrl", "https://img/" + id + ".jpg", "minPrice", new BigDecimal("250000"), "maxPrice", new BigDecimal("250000")));
                }
                return rows;
            });
            when(shop.findVariants(53)).thenReturn(List.of(Map.of("color", "Đỏ", "stock", 3), Map.of("color", "Hồng", "stock", 0)));
            service = new ImageSearchService(engine, props, repo, shop, ColorClassifier.loadDefault());
        }

        byte[] jpeg() throws Exception {
            BufferedImage img = new BufferedImage(64, 48, BufferedImage.TYPE_INT_RGB);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(img, "jpg", out);
            return out.toByteArray();
        }

        @Test
        @DisplayName("Điểm >= 0,85: báo có mẫu, kèm màu và tồn kho; gợi ý cùng danh mục gốc, không lặp lại sản phẩm khớp")
        void matchedProduct() throws Exception {
            nextQuery = new float[] {0.9f, 0.43589f, 0};
            ImageSearchResult r = service.search(jpeg());
            assertNotEquals("NOT_FOUND", r.status());
            assertEquals(53, r.product().productId());
            assertEquals(0.9, r.product().score(), 1e-3);
            assertEquals(2, r.product().colors().size());
            assertEquals(List.of(61, 63), r.suggestions().stream().map(ImageSearchResult.Product::productId).toList());
            assertEquals("Balo", r.suggestionCategory());
        }

        @Test
        @DisplayName("Sản phẩm khác danh mục không được gợi ý dù điểm cao hơn (chụp dép không gợi ý áo)")
        void suggestionsStayInCategory() throws Exception {
            nextQuery = new float[] {0.9f, 0.1f, 0.42f};
            ImageSearchResult r = service.search(jpeg());
            assertEquals(53, r.product().productId());
            // 62 (Dép) giống thứ 2 nhưng khác danh mục -> bỏ; còn 61, 63 cùng Balo
            assertEquals(List.of(61, 63), r.suggestions().stream().map(ImageSearchResult.Product::productId).toList());
        }

        @Test
        @DisplayName("0,808 <= điểm < 0,85: chỉ nói 'khá giống', không khẳng định cùng mẫu, không kết luận màu (ca dép xám dep1)")
        void similarButNotSure() throws Exception {
            nextQuery = new float[] {0.83f, 0.5577f, 0};
            ImageSearchResult r = service.search(jpeg());
            assertEquals("SIMILAR", r.status());
            assertEquals(53, r.product().productId());
            assertTrue(r.message().contains("có thể không phải cùng mẫu"), r.message());
            assertNull(r.detectedColor());
            assertTrue(r.product().colors().stream().noneMatch(ImageSearchResult.ColorStock::matches));
            assertEquals(List.of(61, 63), r.suggestions().stream().map(ImageSearchResult.Product::productId).toList());
        }

        @Test
        @DisplayName("Điểm < 0,808: chưa có mẫu này nhưng vẫn gợi ý sản phẩm gần giống")
        void notFoundStillSuggests() throws Exception {
            nextQuery = new float[] {0.8f, 0.6f, 0};
            ImageSearchResult r = service.search(jpeg());
            assertEquals("NOT_FOUND", r.status());
            assertNull(r.product());
            // không khớp: thêm 1 gợi ý (2 + 1) vì giao diện đưa gợi ý đầu lên khung "Gần giống nhất"
            assertEquals(List.of(53, 61, 63), r.suggestions().stream().map(ImageSearchResult.Product::productId).toList());
            verify(shop, never()).findVariants(anyInt());
        }

        @Test
        @DisplayName("Chưa có mẫu này: gợi ý theo loại hàng AI đoán trong ảnh, không theo sản phẩm hạng 1 (giày trắng ra balo)")
        void notFoundUsesGuessedType() throws Exception {
            ImageSearchService typed = new ImageSearchService(engine, props, repo, shop, ColorClassifier.loadDefault(),
                    v -> new TypeClassifier.Guess("dép", 0.9));
            nextQuery = new float[] {0.8f, 0.6f, 0};
            ImageSearchResult r = typed.search(jpeg());
            assertEquals("NOT_FOUND", r.status());
            assertEquals("Dép", r.suggestionCategory());
            assertEquals(List.of(62), r.suggestions().stream().map(ImageSearchResult.Product::productId).toList());

            // loại đoán được nhưng shop không có danh mục đó -> giữ danh mục của sản phẩm hạng 1
            ImageSearchService unknown = new ImageSearchService(engine, props, repo, shop, ColorClassifier.loadDefault(),
                    v -> new TypeClassifier.Guess("Ví", 0.9));
            assertEquals("Balo", unknown.search(jpeg()).suggestionCategory());
        }

        @Test
        @DisplayName("Ảnh không phải sản phẩm (nhân vật hoạt hình, logo): không trả sản phẩm nào, dù điểm giống cao")
        void notProductReturnsNothing() throws Exception {
            ImageSearchService typed = new ImageSearchService(engine, props, repo, shop, ColorClassifier.loadDefault(),
                    v -> new TypeClassifier.Guess("Áo", 0.001, 0.998));
            nextQuery = new float[] {0.9f, 0.43589f, 0}; // giống p53 0,9 nhưng ảnh là logo
            ImageSearchResult r = typed.search(jpeg());
            assertEquals("NOT_PRODUCT", r.status());
            assertNull(r.product());
            assertTrue(r.suggestions().isEmpty());
            verify(repo, never()).findProductCards(anyCollection());

            // dưới ngưỡng (ảnh hàng thật tối đa 0,14 trong thử nghiệm) thì tìm bình thường
            ImageSearchService normal = new ImageSearchService(engine, props, repo, shop, ColorClassifier.loadDefault(),
                    v -> new TypeClassifier.Guess("Balo", 0.8, 0.14));
            assertNotEquals("NOT_PRODUCT", normal.search(jpeg()).status());
        }

        @Test
        @DisplayName("Đã tìm thấy sản phẩm: gợi ý theo danh mục của sản phẩm đó, bỏ qua loại AI đoán")
        void matchedIgnoresGuessedType() throws Exception {
            ImageSearchService typed = new ImageSearchService(engine, props, repo, shop, ColorClassifier.loadDefault(),
                    v -> new TypeClassifier.Guess("Dép", 0.9));
            nextQuery = new float[] {0.9f, 0.43589f, 0};
            ImageSearchResult r = typed.search(jpeg());
            assertEquals("Balo", r.suggestionCategory());
            assertEquals(List.of(61, 63), r.suggestions().stream().map(ImageSearchResult.Product::productId).toList());
        }

        @Test
        @DisplayName("Ảnh hỏng / rỗng / chưa sẵn sàng / đang tắt: lỗi rõ ràng")
        void errors() {
            assertEquals("IMAGE_INVALID", assertThrows(ApiException.class, () -> service.search(new byte[] {1, 2, 3})).code);
            assertEquals("IMAGE_REQUIRED", assertThrows(ApiException.class, () -> service.search(new byte[0])).code);
            props.setMaxUploadBytes(10);
            assertEquals("IMAGE_TOO_LARGE", assertThrows(ApiException.class, () -> service.search(new byte[11])).code);

            ImageSearchEngine loading = new ImageSearchEngine(props, repo);
            ImageSearchService notReady = new ImageSearchService(loading, props, repo, shop, ColorClassifier.loadDefault());
            assertEquals(503, assertThrows(ApiException.class, () -> notReady.search(new byte[] {1})).status);
            assertEquals(false, notReady.status().get("ready"));

            props.setEnabled(false);
            ImageSearchEngine off = new ImageSearchEngine(props, repo);
            ImageSearchService disabled = new ImageSearchService(off, props, repo, shop, ColorClassifier.loadDefault());
            assertEquals(404, assertThrows(ApiException.class, () -> disabled.search(new byte[] {1})).status);
            assertEquals(false, disabled.status().get("enabled"));
        }
    }
}
