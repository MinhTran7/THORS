package com.thors.module.imagesearch.service;

import com.thors.module.imagesearch.model.ImageEncoder;
import java.nio.file.Path;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Cho com.thors.it.ImageSearchIntegrationTest: gắn encoder giả (thay cho mô hình ONNX thật ~180 MB) vào ImageSearchEngine
 * của Spring context rồi chạy đúng bước refresh() mà lịch cập nhật 2 phút một lần gọi.
 */
public final class ImageSearchEngineAccess {
    private ImageSearchEngineAccess() {}

    public static void useEncoder(ImageSearchEngine engine, ImageEncoder encoder) {
        ReflectionTestUtils.setField(engine, "encoder", encoder);
    }

    /** Bước cập nhật chỉ mục (giống scheduledRefresh khi tới hạn); xong thì trạng thái READY. */
    public static void refresh(ImageSearchEngine engine) {
        engine.refresh();
    }

    public static Path indexFile(ImageSearchEngine engine) {
        return ReflectionTestUtils.invokeMethod(engine, "indexFile");
    }

    public static String modelId(ImageSearchEngine engine) {
        return ReflectionTestUtils.invokeMethod(engine, "modelId");
    }
}
