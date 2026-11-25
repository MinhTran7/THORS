package com.thors.module.imagesearch;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.thors.module.imagesearch.model.BackgroundRemoverAccess;
import com.thors.module.imagesearch.model.ImageDecoder;
import com.thors.module.imagesearch.model.SiglipPreprocessor.Filter;
import com.thors.module.imagesearch.model.SiglipPreprocessor.Pixels;
import java.io.InputStream;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Các bước quanh mô hình xóa nền phải ra cùng số với PIL / rembg (Python) đã dùng khi thử nghiệm 18/11/2026.
 * Giá trị chuẩn sinh bằng D:\image-search-eval\gen_cutout_fixture.py.
 */
class BackgroundRemoverTest {

    static Pixels image;
    static Pixels mask320;
    static JsonNode expected;

    @BeforeAll
    static void load() throws Exception {
        image = Pixels.of(ImageDecoder.decode(read("/imagesearch/preprocess-fixture.png")));
        // Đọc thẳng giá trị điểm ảnh xám (getRGB của Java sẽ chỉnh gamma ảnh xám, làm lệch số)
        java.awt.image.BufferedImage m = javax.imageio.ImageIO.read(new java.io.ByteArrayInputStream(read("/imagesearch/cutout-mask-320.png")));
        int[] values = m.getRaster().getSamples(0, 0, m.getWidth(), m.getHeight(), 0, (int[]) null);
        mask320 = new Pixels(m.getWidth(), m.getHeight(), new int[][] {values});
        expected = new ObjectMapper().readTree(read("/imagesearch/cutout-expected.json"));
    }

    static byte[] read(String path) throws Exception {
        try (InputStream in = BackgroundRemoverTest.class.getResourceAsStream(path)) {
            return in.readAllBytes();
        }
    }

    @Test
    @DisplayName("Resize Lanczos về 320x320 (đầu vào U²-Net) khớp PIL, sai số tối đa 1 mức màu")
    void lanczosMatchesPillow() {
        Pixels small = image.resize(320, 320, Filter.LANCZOS);
        JsonNode e = expected.path("lanczos320");
        for (JsonNode s : e.path("samples")) {
            int v = small.channels()[s.path("c").asInt()][s.path("y").asInt() * 320 + s.path("x").asInt()];
            assertEquals(s.path("v").asInt(), v, 1, "điểm " + s);
        }
        for (int c = 0; c < 3; c++) {
            assertEquals(e.path("means").get(c).asDouble(), mean(small.channels()[c]), 0.05);
        }
    }

    @Test
    @DisplayName("Phóng mặt nạ 320x320 về cỡ ảnh bằng Lanczos khớp PIL")
    void maskResizeMatchesPillow() {
        int[] m = mask();
        JsonNode e = expected.path("mask");
        assertEquals(e.path("width").asInt() * e.path("height").asInt(), m.length);
        for (JsonNode s : e.path("samples")) {
            assertEquals(s.path("v").asInt(), m[s.path("y").asInt() * image.width() + s.path("x").asInt()], 1, "điểm " + s);
        }
        assertEquals(e.path("mean").asDouble(), mean(m), 0.05);
    }

    @Test
    @DisplayName("Cắt sát sản phẩm, dán nền trắng, chừa lề 8%, đệm vuông: khớp PIL")
    void cutoutMatchesPillow() {
        Pixels cut = BackgroundRemoverAccess.cutout(image, mask());
        JsonNode e = expected.path("cutout");
        assertEquals(e.path("side").asInt(), cut.width());
        assertEquals(cut.width(), cut.height());
        for (JsonNode s : e.path("samples")) {
            int v = cut.channels()[s.path("c").asInt()][s.path("y").asInt() * cut.width() + s.path("x").asInt()];
            assertEquals(s.path("v").asInt(), v, 1, "điểm " + s);
        }
        for (int c = 0; c < 3; c++) {
            assertEquals(e.path("means").get(c).asDouble(), mean(cut.channels()[c]), 0.05);
        }
    }

    @Test
    @DisplayName("Không tìm thấy sản phẩm (vùng < 1% ảnh) thì không cắt, dùng ảnh gốc")
    void tinyMaskMeansNoCut() {
        int[] m = new int[image.width() * image.height()];
        m[5] = 255;
        assertNull(BackgroundRemoverAccess.cutout(image, m));
    }

    @Test
    @DisplayName("Đầu ra mô hình -> mặt nạ: chuẩn hóa min-max, nhân 255 bỏ phần lẻ như numpy astype(uint8)")
    void predToMask() {
        assertArrayEquals(new int[] {0, 127, 255, 63}, BackgroundRemoverAccess.toMask(new float[] {-2f, 0f, 2f, -1f}));
        assertArrayEquals(new int[] {0, 0}, BackgroundRemoverAccess.toMask(new float[] {3f, 3f}));
    }

    @Test
    @DisplayName("Trộn với nền trắng theo công thức của Pillow")
    void blendLikePillow() {
        assertEquals(255, BackgroundRemoverAccess.blend(255, 0, 0));
        assertEquals(0, BackgroundRemoverAccess.blend(255, 0, 255));
        assertEquals(128, BackgroundRemoverAccess.blend(255, 0, 127)); // (255*128 + 128) / 255 làm tròn
        assertEquals(100, BackgroundRemoverAccess.blend(255, 100, 255));
    }

    private static int[] mask() {
        return mask320.resize(image.width(), image.height(), Filter.LANCZOS).channels()[0];
    }

    private static double mean(int[] a) {
        double s = 0;
        for (int v : a) s += v;
        return s / a.length;
    }
}
