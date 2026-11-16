package com.thors.module.imagesearch;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.thors.module.imagesearch.model.ImageDecoder;
import com.thors.module.imagesearch.model.SiglipPreprocessor;
import java.awt.image.BufferedImage;
import java.io.InputStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Tiền xử lý ảnh trong Java phải cho ra cùng số với PIL (Python) đã dùng khi đánh giá mô hình,
 * nếu không vector ảnh sẽ lệch và ngưỡng 0,808 không còn đúng. Giá trị chuẩn sinh bằng gen_backend_resources.py.
 */
class SiglipPreprocessorTest {

    @Test
    @DisplayName("Resize 224 bicubic + chuẩn hóa khớp PIL (sai số dưới 1 mức màu)")
    void matchesPillow() throws Exception {
        BufferedImage image;
        try (InputStream in = getClass().getResourceAsStream("/imagesearch/preprocess-fixture.png")) {
            image = ImageDecoder.decode(in.readAllBytes());
        }
        JsonNode expected;
        try (InputStream in = getClass().getResourceAsStream("/imagesearch/preprocess-expected.json")) {
            expected = new ObjectMapper().readTree(in);
        }
        float[] t = SiglipPreprocessor.toTensor(image);
        int n = SiglipPreprocessor.SIZE * SiglipPreprocessor.SIZE;
        assertEquals(3 * n, t.length);

        // 1 mức màu (1/255) sau chuẩn hóa = 2/255 ≈ 0,0078
        double oneLevel = 2.0 / 255;
        for (JsonNode s : expected.path("samples")) {
            int idx = s.path("c").asInt() * n + s.path("y").asInt() * SiglipPreprocessor.SIZE + s.path("x").asInt();
            assertEquals(s.path("value").asDouble(), t[idx], oneLevel + 1e-6, "điểm " + s);
        }
        for (int c = 0; c < 3; c++) {
            double sum = 0;
            for (int i = 0; i < n; i++) sum += t[c * n + i];
            assertEquals(expected.path("channelMeans").get(c).asDouble(), sum / n, 0.002, "trung bình kênh " + c);
        }
    }

    @Test
    @DisplayName("Thu nhỏ về 768 giữ tỉ lệ, làm tròn giống PIL Image.thumbnail")
    void thumbnailSizeMatchesPillow() throws Exception {
        java.lang.reflect.Method m = SiglipPreprocessor.class.getDeclaredMethod("thumbnailSize", int.class, int.class, int.class);
        m.setAccessible(true);
        int[][] cases = { // {w, h, w PIL, h PIL}
            {800, 1038, 592, 768}, {2048, 2048, 768, 768}, {1536, 2048, 576, 768}, {1280, 996, 768, 598},
            {4000, 3000, 768, 576}, {300, 1000, 230, 768}, {769, 100, 768, 100}, {1000, 333, 768, 256}};
        for (int[] c : cases) {
            int[] got = (int[]) m.invoke(null, c[0], c[1], 768);
            assertArrayEquals(new int[] {c[2], c[3]}, got, c[0] + "x" + c[1]);
        }
        assertNull(m.invoke(null, 768, 500, 768), "ảnh đã vừa thì không thu nhỏ");
    }

    @Test
    @DisplayName("Ảnh một màu giữ nguyên giá trị sau resize (hệ số lọc cộng lại bằng 1)")
    void flatImageStaysFlat() {
        BufferedImage img = new BufferedImage(640, 480, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < 480; y++) for (int x = 0; x < 640; x++) img.setRGB(x, y, 0xFF8040);
        float[] t = SiglipPreprocessor.toTensor(img);
        int n = SiglipPreprocessor.SIZE * SiglipPreprocessor.SIZE;
        assertEquals((255 / 255.0 - 0.5) / 0.5, t[0], 1e-6);
        assertEquals((128 / 255.0 - 0.5) / 0.5, t[n + 123], 1e-6);
        assertEquals((64 / 255.0 - 0.5) / 0.5, t[2 * n + n - 1], 1e-6);
    }
}
