package com.thors.module.imagesearch.model;

import com.thors.module.imagesearch.model.SiglipPreprocessor.Pixels;

/** Cho test (khác package) gọi các bước tính toán không cần mô hình của BackgroundRemover. */
public final class BackgroundRemoverAccess {

    private BackgroundRemoverAccess() {}

    public static Pixels cutout(Pixels image, int[] mask) {
        return BackgroundRemover.cutout(image, mask);
    }

    public static int[] toMask(float[] pred) {
        return BackgroundRemover.toMask(pred);
    }

    public static int blend(int background, int value, int alpha) {
        return BackgroundRemover.blend(background, value, alpha);
    }
}
