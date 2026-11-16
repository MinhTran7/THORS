package com.thors.module.imagesearch.model;

import java.awt.image.BufferedImage;

/**
 * Chuẩn bị ảnh cho SigLIP giống hệt quy trình Python đã dùng khi đánh giá (evaluate.load_image + SiglipImageProcessor):
 *  1. Ảnh lớn hơn 768 px thì thu nhỏ giữ tỉ lệ cho vừa 768 x 768 (PIL Image.thumbnail).
 *  2. Resize về 224 x 224 (không giữ tỉ lệ).
 *  3. Đổi về [-1, 1] theo (x / 255 - 0.5) / 0.5, xếp kênh R, G, B (NCHW).
 * Resize viết lại theo thuật toán bicubic của Pillow (ImagingResample): lọc ngang trước, làm tròn về 0..255,
 * rồi lọc dọc, có khử răng cưa khi thu nhỏ. Java2D không làm vậy nên vector sẽ lệch so với lúc chọn ngưỡng.
 */
public final class SiglipPreprocessor {

    public static final int SIZE = 224;
    public static final int THUMBNAIL = 768;
    private static final double BICUBIC_A = -0.5;
    private static final double BICUBIC_SUPPORT = 2.0;

    private SiglipPreprocessor() {}

    /** Trả về mảng 3 x 224 x 224 (R rồi G rồi B), giá trị trong [-1, 1]. */
    public static float[] toTensor(BufferedImage image) {
        int w = image.getWidth();
        int h = image.getHeight();
        int[] argb = image.getRGB(0, 0, w, h, null, 0, w);
        // Tách 3 kênh (bỏ kênh alpha giống PIL convert("RGB"))
        int[][] channels = new int[3][w * h];
        for (int i = 0; i < argb.length; i++) {
            int p = argb[i];
            channels[0][i] = (p >> 16) & 0xFF;
            channels[1][i] = (p >> 8) & 0xFF;
            channels[2][i] = p & 0xFF;
        }
        int[] thumb = thumbnailSize(w, h, THUMBNAIL);
        if (thumb != null) {
            Kernel th = Kernel.of(w, thumb[0]);
            Kernel tv = Kernel.of(h, thumb[1]);
            for (int c = 0; c < 3; c++) {
                channels[c] = resample(channels[c], w, h, thumb[0], thumb[1], th, tv);
            }
            w = thumb[0];
            h = thumb[1];
        }
        Kernel horizontal = Kernel.of(w, SIZE);
        Kernel vertical = Kernel.of(h, SIZE);
        float[] out = new float[3 * SIZE * SIZE];
        for (int c = 0; c < 3; c++) {
            int[] resized = resample(channels[c], w, h, SIZE, SIZE, horizontal, vertical);
            int base = c * SIZE * SIZE;
            for (int i = 0; i < resized.length; i++) {
                out[base + i] = (float) ((resized[i] / 255.0 - 0.5) / 0.5);
            }
        }
        return out;
    }

    /**
     * Kích thước sau PIL Image.thumbnail((max, max)): giữ tỉ lệ, làm tròn như Pillow (preserve_aspect_ratio).
     * null nếu ảnh đã vừa (không phải thu nhỏ).
     */
    static int[] thumbnailSize(int width, int height, int max) {
        if (max >= width && max >= height) {
            return null;
        }
        double aspect = (double) width / height;
        int x = max;
        int y = max;
        if ((double) x / y >= aspect) {
            double n = y * aspect;
            x = roundAspect(n, c -> Math.abs(aspect - c / (double) max));
        } else {
            double n = x / aspect;
            y = roundAspect(n, c -> c == 0 ? 0 : Math.abs(aspect - max / (double) c));
        }
        return new int[] {x, y};
    }

    private static int roundAspect(double number, java.util.function.IntToDoubleFunction key) {
        int lo = (int) Math.floor(number);
        int hi = (int) Math.ceil(number);
        int best = key.applyAsDouble(lo) <= key.applyAsDouble(hi) ? lo : hi; // Python min() giữ phần tử đầu khi bằng nhau
        return Math.max(best, 1);
    }

    /** Resize một kênh (w x h -> outW x outH): ngang rồi dọc, làm tròn về 0..255 sau mỗi lượt như Pillow. */
    static int[] resample(int[] src, int w, int h, int outW, int outH, Kernel hk, Kernel vk) {
        int[] tmp = new int[outW * h];
        for (int y = 0; y < h; y++) {
            int row = y * w;
            for (int x = 0; x < outW; x++) {
                double sum = 0;
                int start = hk.start[x];
                double[] k = hk.weights[x];
                for (int i = 0; i < k.length; i++) {
                    sum += src[row + start + i] * k[i];
                }
                tmp[y * outW + x] = clip8(sum);
            }
        }
        int[] dst = new int[outW * outH];
        for (int y = 0; y < outH; y++) {
            int start = vk.start[y];
            double[] k = vk.weights[y];
            for (int x = 0; x < outW; x++) {
                double sum = 0;
                for (int i = 0; i < k.length; i++) {
                    sum += tmp[(start + i) * outW + x] * k[i];
                }
                dst[y * outW + x] = clip8(sum);
            }
        }
        return dst;
    }

    private static int clip8(double v) {
        long r = Math.round(v);
        return (int) Math.max(0, Math.min(255, r));
    }

    static double bicubic(double x) {
        x = Math.abs(x);
        if (x < 1.0) {
            return ((BICUBIC_A + 2.0) * x - (BICUBIC_A + 3.0)) * x * x + 1;
        }
        if (x < 2.0) {
            return (((x - 5) * x + 8) * x - 4) * BICUBIC_A;
        }
        return 0.0;
    }

    /** Hệ số lọc cho mỗi điểm đầu ra (giống precompute_coeffs của Pillow). */
    static final class Kernel {
        final int[] start;
        final double[][] weights;

        private Kernel(int[] start, double[][] weights) {
            this.start = start;
            this.weights = weights;
        }

        static Kernel of(int inSize, int outSize) {
            double scale = (double) inSize / outSize;
            double filterScale = Math.max(scale, 1.0);
            double support = BICUBIC_SUPPORT * filterScale;
            int[] start = new int[outSize];
            double[][] weights = new double[outSize][];
            for (int xx = 0; xx < outSize; xx++) {
                double center = (xx + 0.5) * scale;
                int xmin = Math.max((int) (center - support + 0.5), 0);
                int xmax = Math.min((int) (center + support + 0.5), inSize) - xmin;
                double[] k = new double[xmax];
                double total = 0;
                for (int x = 0; x < xmax; x++) {
                    double w = bicubic((x + xmin - center + 0.5) / filterScale);
                    k[x] = w;
                    total += w;
                }
                if (total != 0) {
                    for (int x = 0; x < xmax; x++) {
                        k[x] /= total;
                    }
                }
                start[xx] = xmin;
                weights[xx] = k;
            }
            return new Kernel(start, weights);
        }
    }
}
