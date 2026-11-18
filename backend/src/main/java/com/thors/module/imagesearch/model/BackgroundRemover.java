package com.thors.module.imagesearch.model;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;
import com.thors.module.imagesearch.model.SiglipPreprocessor.Filter;
import com.thors.module.imagesearch.model.SiglipPreprocessor.Pixels;

import java.nio.FloatBuffer;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Map;

/**
 * Xóa nền, chỉ giữ sản phẩm: mô hình U²-Net (rembg "u2net", Apache-2.0) đoán vùng sản phẩm, rồi dán sản phẩm lên nền
 * trắng, cắt sát (chừa lề 8%) và đệm thành ảnh vuông. Làm cho cả ảnh khách lẫn ảnh shop để AI so kiểu dáng với kiểu dáng,
 * không bị móc treo / giá treo / nền màu / khoảng trắng thừa chi phối.
 *
 * Viết lại đúng các bước của rembg (sessions/u2net.py + bg.remove(only_mask=True)) và bg_test.py đã dùng khi đánh giá
 * ngày 18/11/2026, để điểm giống khớp với lúc chọn cách chấm điểm.
 */
public final class BackgroundRemover implements AutoCloseable {

    static final int INPUT = 320;
    static final double MARGIN = 0.08;
    private static final float[] MEAN = {0.485f, 0.456f, 0.406f};
    private static final float[] STD = {0.229f, 0.224f, 0.225f};

    private final OrtEnvironment env;
    private final OrtSession session;
    private final String inputName;

    public BackgroundRemover(Path modelFile) throws OrtException {
        this.env = OrtEnvironment.getEnvironment();
        OrtSession.SessionOptions options = new OrtSession.SessionOptions();
        options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        options.setIntraOpNumThreads(Math.max(1, Math.min(2, Runtime.getRuntime().availableProcessors())));
        this.session = env.createSession(modelFile.toString(), options);
        this.inputName = session.getInputNames().iterator().next();
    }

    /** Ảnh chỉ còn sản phẩm trên nền trắng (vuông), hoặc null nếu không tìm thấy sản phẩm (dùng ảnh gốc). */
    public Pixels cut(Pixels image) {
        return cutout(image, mask(image));
    }

    /** Mặt nạ 0..255 cùng kích thước ảnh (255 = sản phẩm). */
    int[] mask(Pixels image) {
        Pixels small = image.resize(INPUT, INPUT, Filter.LANCZOS);
        int max = 0;
        for (int[] ch : small.channels()) {
            for (int v : ch) max = Math.max(max, v);
        }
        double scale = Math.max(max, 1e-6);
        int n = INPUT * INPUT;
        float[] input = new float[3 * n];
        for (int c = 0; c < 3; c++) {
            int[] ch = small.channels()[c];
            for (int i = 0; i < n; i++) {
                input[c * n + i] = (float) ((ch[i] / scale - MEAN[c]) / STD[c]);
            }
        }
        float[] pred;
        try (OnnxTensor t = OnnxTensor.createTensor(env, FloatBuffer.wrap(input), new long[] {1, 3, INPUT, INPUT});
             OrtSession.Result result = session.run(Map.of(inputName, t))) {
            float[][][][] out = (float[][][][]) result.get(0).getValue(); // d0: 1 x 1 x 320 x 320
            pred = new float[n];
            for (int y = 0; y < INPUT; y++) {
                System.arraycopy(out[0][0][y], 0, pred, y * INPUT, INPUT);
            }
        } catch (OrtException e) {
            throw new IllegalStateException("Mô hình xóa nền lỗi khi chạy", e);
        }
        int[] mask = toMask(pred);
        Pixels m = new Pixels(INPUT, INPUT, new int[][] {mask}).resize(image.width(), image.height(), Filter.LANCZOS);
        return m.channels()[0];
    }

    /** (pred - min) / (max - min), cắt về 0..1, nhân 255 rồi bỏ phần lẻ (numpy astype("uint8")). */
    static int[] toMask(float[] pred) {
        float mi = Float.POSITIVE_INFINITY;
        float ma = Float.NEGATIVE_INFINITY;
        for (float v : pred) {
            mi = Math.min(mi, v);
            ma = Math.max(ma, v);
        }
        int[] mask = new int[pred.length];
        float range = ma - mi;
        for (int i = 0; i < pred.length; i++) {
            float v = range == 0 ? 0f : (pred[i] - mi) / range;
            v = Math.max(0f, Math.min(1f, v));
            mask[i] = (int) (v * 255f);
        }
        return mask;
    }

    /**
     * Dán sản phẩm lên nền trắng theo mặt nạ (như PIL paste có mask), cắt sát vùng mask > 128, chừa lề 8% rồi đệm vuông.
     * null nếu vùng sản phẩm nhỏ hơn 1% ảnh (coi như không tách được).
     */
    static Pixels cutout(Pixels image, int[] mask) {
        int w = image.width();
        int h = image.height();
        int x0 = w, y0 = h, x1 = -1, y1 = -1;
        long count = 0;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                if (mask[y * w + x] > 128) {
                    count++;
                    x0 = Math.min(x0, x);
                    x1 = Math.max(x1, x);
                    y0 = Math.min(y0, y);
                    y1 = Math.max(y1, y);
                }
            }
        }
        if (count < 0.01 * w * h) {
            return null;
        }
        int cw = x1 - x0 + 1;
        int ch = y1 - y0 + 1;
        int side = (int) (Math.max(cw, ch) * (1 + 2 * MARGIN));
        int ox = (side - cw) / 2;
        int oy = (side - ch) / 2;
        int[][] out = new int[3][side * side];
        for (int[] c : out) Arrays.fill(c, 255);
        for (int c = 0; c < 3; c++) {
            int[] src = image.channels()[c];
            int[] dst = out[c];
            for (int y = 0; y < ch; y++) {
                for (int x = 0; x < cw; x++) {
                    int i = (y0 + y) * w + (x0 + x);
                    int a = mask[i];
                    dst[(oy + y) * side + (ox + x)] = blend(255, src[i], a);
                }
            }
        }
        return new Pixels(side, side, out);
    }

    /** Công thức trộn của Pillow (Paste.c BLEND + DIV255): nền * (255 - a) + ảnh * a, chia 255 làm tròn. */
    static int blend(int background, int value, int alpha) {
        int tmp = background * (255 - alpha) + value * alpha + 128;
        return ((tmp >> 8) + tmp) >> 8;
    }

    @Override
    public void close() throws OrtException {
        session.close();
    }
}
