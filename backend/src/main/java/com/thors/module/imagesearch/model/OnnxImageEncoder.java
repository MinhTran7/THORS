package com.thors.module.imagesearch.model;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;
import com.thors.module.imagesearch.model.SiglipPreprocessor.Pixels;

import java.awt.image.BufferedImage;
import java.nio.FloatBuffer;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

/**
 * Chạy phần nhìn ảnh của SigLIP-b16 (file ONNX) trên CPU. Đầu ra "pooler_output" (768 số) chính là
 * vector ảnh mà bản đánh giá đã dùng (get_image_features). OrtSession dùng chung được giữa nhiều luồng.
 * Có backgroundRemover thì tính thêm vector của ảnh đã xóa nền (encodeBoth).
 */
public final class OnnxImageEncoder implements ImageEncoder, AutoCloseable {

    private final OrtEnvironment env;
    private final OrtSession session;
    private final String inputName;
    private final BackgroundRemover backgroundRemover;

    public OnnxImageEncoder(Path modelFile, BackgroundRemover backgroundRemover) throws OrtException {
        this.env = OrtEnvironment.getEnvironment();
        OrtSession.SessionOptions options = new OrtSession.SessionOptions();
        options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        // Không chiếm hết CPU của máy chủ: mỗi lượt chạy tối đa 2 luồng
        options.setIntraOpNumThreads(Math.max(1, Math.min(2, Runtime.getRuntime().availableProcessors())));
        this.session = env.createSession(modelFile.toString(), options);
        this.inputName = session.getInputNames().iterator().next();
        this.backgroundRemover = backgroundRemover;
    }

    @Override
    public float[] encode(BufferedImage image) {
        return run(SiglipPreprocessor.toTensor(image));
    }

    @Override
    public Vectors encodeBoth(BufferedImage image) {
        Pixels thumb = SiglipPreprocessor.thumbnail(Pixels.of(image));
        if (backgroundRemover == null) {
            return new Vectors(run(SiglipPreprocessor.toTensor(thumb)), null);
        }
        // Xóa nền và tính vector ảnh gốc không phụ thuộc nhau: chạy song song cho nhanh
        CompletableFuture<Pixels> cutting = CompletableFuture.supplyAsync(() -> backgroundRemover.cut(thumb));
        float[] original = run(SiglipPreprocessor.toTensor(thumb));
        Pixels cut = cutting.join();
        return new Vectors(original, cut == null ? original : run(SiglipPreprocessor.toTensor(cut)));
    }

    private float[] run(float[] pixels) {
        long[] shape = {1, 3, SiglipPreprocessor.SIZE, SiglipPreprocessor.SIZE};
        try (OnnxTensor input = OnnxTensor.createTensor(env, FloatBuffer.wrap(pixels), shape);
             OrtSession.Result result = session.run(Map.of(inputName, input), Set.of("pooler_output"))) {
            float[][] out = (float[][]) result.get("pooler_output").orElseThrow().getValue();
            return ImageEncoder.normalize(out[0]);
        } catch (OrtException e) {
            throw new IllegalStateException("Mô hình tìm ảnh lỗi khi chạy", e);
        }
    }

    @Override
    public void close() throws OrtException {
        session.close();
        if (backgroundRemover != null) {
            backgroundRemover.close();
        }
    }
}
