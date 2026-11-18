package com.thors.module.imagesearch.service;

import static org.junit.jupiter.api.Assertions.*;

import com.thors.module.imagesearch.model.ImageEncoder.Vectors;
import com.thors.module.imagesearch.repository.ImageSearchRepository.CatalogImage;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CatalogIndexTest {

    static Vectors v(float[] original) {
        return new Vectors(original, null);
    }

    static float[] unit(int dim, int hot) {
        float[] v = new float[dim];
        v[hot] = 1f;
        return v;
    }

    @Test
    @DisplayName("Chỉ tính vector cho ảnh mới / ảnh đổi url, bỏ ảnh đã xóa")
    void syncOnlyEmbedsChangedImages() {
        CatalogIndex index = new CatalogIndex();
        List<Long> embedded = new ArrayList<>();
        index.sync(List.of(new CatalogImage(1, 10, "a.jpg"), new CatalogImage(2, 10, "b.jpg")),
                img -> { embedded.add(img.imageId()); return v(unit(4, 0)); });
        assertEquals(List.of(1L, 2L), embedded);

        embedded.clear();
        boolean changed = index.sync(List.of(new CatalogImage(1, 10, "a.jpg"), new CatalogImage(2, 10, "b-moi.jpg"),
                new CatalogImage(3, 11, "c.jpg")), img -> { embedded.add(img.imageId()); return v(unit(4, 1)); });
        assertTrue(changed);
        assertEquals(List.of(2L, 3L), embedded, "ảnh 1 không đổi thì không tính lại");

        embedded.clear();
        assertTrue(index.sync(List.of(new CatalogImage(3, 11, "c.jpg")), img -> { embedded.add(img.imageId()); return null; }));
        assertEquals(1, index.size());
        assertFalse(index.sync(List.of(new CatalogImage(3, 11, "c.jpg")), img -> null), "không đổi gì");
    }

    @Test
    @DisplayName("Điểm của sản phẩm = điểm cao nhất trong các ảnh của nó; xếp cao xuống thấp")
    void rankUsesBestImagePerProduct() {
        CatalogIndex index = new CatalogIndex();
        index.sync(List.of(new CatalogImage(1, 10, "a"), new CatalogImage(2, 10, "b"), new CatalogImage(3, 20, "c")),
                img -> v(switch ((int) img.imageId()) {
                    case 1 -> new float[] {1, 0, 0};
                    case 2 -> new float[] {0, 1, 0};
                    default -> new float[] {0.6f, 0.8f, 0};
                }));
        var ranked = index.rank(new float[] {0, 1, 0});
        assertEquals(10, ranked.get(0).productId());
        assertEquals(1.0, ranked.get(0).score(), 1e-6);
        assertEquals(20, ranked.get(1).productId());
        assertEquals(0.8, ranked.get(1).score(), 1e-6);
    }

    @Test
    @DisplayName("Có ảnh xóa nền: mỗi cách lấy ảnh tốt nhất của sản phẩm, rồi trung bình 2 cách (ca váy ren đen)")
    void rankAveragesOriginalAndCutout() {
        CatalogIndex index = new CatalogIndex();
        // sản phẩm 74 (váy tầng ren): ảnh gốc kém hơn 75 một chút, nhưng ảnh xóa nền giống hơn hẳn
        index.sync(List.of(new CatalogImage(1, 74, "a"), new CatalogImage(2, 74, "b"), new CatalogImage(3, 75, "c")),
                img -> switch ((int) img.imageId()) {
                    case 1 -> new Vectors(new float[] {0.73f, 0}, new float[] {0.2f, 0});
                    case 2 -> new Vectors(new float[] {0.1f, 0}, new float[] {0.77f, 0});
                    default -> new Vectors(new float[] {0.74f, 0}, new float[] {0.73f, 0});
                });
        var ranked = index.rank(new Vectors(new float[] {1, 0}, new float[] {1, 0}));
        assertEquals(74, ranked.get(0).productId());
        assertEquals((0.73 + 0.77) / 2, ranked.get(0).score(), 1e-6);
        assertEquals((0.74 + 0.73) / 2, ranked.get(1).score(), 1e-6);
        // không có vector xóa nền của ảnh khách -> chỉ ảnh gốc, 75 đứng đầu
        assertEquals(75, index.rank(new float[] {1, 0}).get(0).productId());
    }

    @Test
    @DisplayName("Lưu rồi đọc lại file cache; khác mô hình thì không dùng")
    void saveAndLoad(@TempDir Path dir) throws Exception {
        CatalogIndex index = new CatalogIndex();
        index.sync(List.of(new CatalogImage(7, 70, "x.webp")), img -> new Vectors(new float[] {0.5f, -0.5f}, new float[] {0, 1}));
        Path file = dir.resolve("sub/index.bin");
        index.save(file, "m1");

        CatalogIndex again = new CatalogIndex();
        assertTrue(again.load(file, "m1"));
        assertEquals(1, again.size());
        assertEquals(0.5, again.rank(new float[] {1, 0}).get(0).score(), 1e-6);
        assertEquals((0.5 + 1.0) / 2, again.rank(new Vectors(new float[] {1, 0}, new float[] {0, 1})).get(0).score(), 1e-6,
                "đọc lại được cả vector xóa nền");
        assertFalse(new CatalogIndex().load(file, "m2"));
        assertFalse(new CatalogIndex().load(dir.resolve("khong-co.bin"), "m1"));
    }
}
