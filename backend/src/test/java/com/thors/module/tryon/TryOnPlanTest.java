package com.thors.module.tryon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.thors.common.ApiException;
import com.thors.module.fitting.service.StandardSizeCharts.Kind;
import com.thors.module.tryon.TryOnPlan.Garment;
import com.thors.module.tryon.TryOnPlan.Pick;
import com.thors.module.tryon.TryOnPlan.Step;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.List;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class TryOnPlanTest {

    @Test
    void bottomIsWornBeforeTop() {
        var result = TryOnPlan.plan(List.of(
                new Pick(1, "Áo thun", Kind.TOP),
                new Pick(2, "Quần jean", Kind.BOTTOM)));
        assertEquals(List.of(Garment.BOTTOM, Garment.TOP), result.steps().stream().map(Step::garment).toList());
        assertEquals(List.of(2, 1), result.steps().stream().map(Step::productId).toList());
    }

    @Test
    void shoesAreSkippedNotRejected() {
        var result = TryOnPlan.plan(List.of(
                new Pick(1, "Đầm suông", Kind.DRESS),
                new Pick(3, "Giày cao gót", Kind.SHOES)));
        assertEquals(1, result.steps().size());
        assertEquals(List.of("Giày cao gót"), result.skipped());
    }

    @Test
    void jacketOverDressIsAllowed() {
        var result = TryOnPlan.plan(List.of(
                new Pick(5, "Áo khoác", Kind.TOP),
                new Pick(6, "Đầm", Kind.DRESS)));
        assertEquals(List.of(Garment.DRESS, Garment.TOP), result.steps().stream().map(Step::garment).toList());
    }

    @Test
    void rejectsInvalidCombinations() {
        assertThrows(ApiException.class, () -> TryOnPlan.plan(List.of()));
        assertThrows(ApiException.class, () -> TryOnPlan.plan(List.of(
                new Pick(1, "Áo A", Kind.TOP), new Pick(2, "Áo B", Kind.TOP))));
        assertThrows(ApiException.class, () -> TryOnPlan.plan(List.of(
                new Pick(1, "Đầm", Kind.DRESS), new Pick(2, "Quần", Kind.BOTTOM))));
        assertThrows(ApiException.class, () -> TryOnPlan.plan(List.of(new Pick(1, "Giày", Kind.SHOES))));
        assertThrows(ApiException.class, () -> TryOnPlan.plan(List.of(
                new Pick(1, "a", Kind.TOP), new Pick(2, "b", Kind.BOTTOM),
                new Pick(3, "c", Kind.SHOES), new Pick(4, "d", Kind.NONE))));
    }

    @Test
    void photoMustBeRealImageAndLargeEnough() throws Exception {
        assertThrows(ApiException.class, () -> TryOnImageStore.checkImage("not an image".getBytes()));
        assertThrows(ApiException.class, () -> TryOnImageStore.checkImage(png(200, 300)));
        TryOnImageStore.checkImage(png(400, 600)); // không ném lỗi
    }

    @Test
    void imageUrlsAreRequestedAsJpeg() {
        assertEquals("https://res.cloudinary.com/x/image/upload/v1/thors/products/abc.jpg",
                TryOnImageStore.jpegUrl("https://res.cloudinary.com/x/image/upload/v1/thors/products/abc.webp"));
        assertEquals("https://res.cloudinary.com/x/image/upload/v1/thors/tryon/u5_1.jpg",
                TryOnImageStore.jpegUrl("https://res.cloudinary.com/x/image/upload/v1/thors/tryon/u5_1"));
        assertEquals("https://images.unsplash.com/photo-1?w=500&fm=jpg",
                TryOnImageStore.jpegUrl("https://images.unsplash.com/photo-1?w=500"));
        assertEquals("https://images.unsplash.com/photo-1?w=500&fm=jpg",
                TryOnImageStore.jpegUrl("https://images.unsplash.com/photo-1?fm=webp&w=500"));
        assertEquals("https://example.com/a.png", TryOnImageStore.jpegUrl("https://example.com/a.png"));
    }

    @Test
    void samePhotoGivesSameHash() throws Exception {
        byte[] a = png(400, 600);
        assertEquals(TryOnImageStore.sha256(a), TryOnImageStore.sha256(a.clone()));
        assertEquals(64, TryOnImageStore.sha256(a).length());
    }

    private static byte[] png(int w, int h) throws Exception {
        var out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB), "png", out);
        return out.toByteArray();
    }
}
