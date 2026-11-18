package com.thors.module.imagesearch.model;

import java.awt.image.BufferedImage;

/** Biến ảnh thành vector đặc trưng (đã chuẩn hóa độ dài = 1). Tách interface để test không cần mô hình thật. */
public interface ImageEncoder {

    /** Vector của ảnh gốc. */
    float[] encode(BufferedImage image);

    /**
     * Vector ảnh gốc và vector ảnh đã xóa nền (chỉ còn sản phẩm). cutout = null nếu không bật xóa nền.
     * Khi không tách được sản phẩm khỏi nền thì cutout = vector ảnh gốc.
     */
    default Vectors encodeBoth(BufferedImage image) {
        return new Vectors(encode(image), null);
    }

    /** Hai vector của một ảnh. */
    record Vectors(float[] original, float[] cutout) {}

    /** Nhân vô hướng 2 vector đã chuẩn hóa = cosine similarity. */
    static double dot(float[] a, float[] b) {
        double s = 0;
        for (int i = 0; i < a.length; i++) {
            s += a[i] * b[i];
        }
        return s;
    }

    static float[] normalize(float[] v) {
        double n = Math.sqrt(dot(v, v));
        float[] out = new float[v.length];
        if (n == 0) {
            return out;
        }
        for (int i = 0; i < v.length; i++) {
            out[i] = (float) (v[i] / n);
        }
        return out;
    }
}
