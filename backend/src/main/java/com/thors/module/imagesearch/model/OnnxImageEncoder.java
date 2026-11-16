package com.thors.module.imagesearch.model;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;

import java.awt.image.BufferedImage;
import java.nio.FloatBuffer;
import java.nio.file.Path;
import java.util.Map;

/**
 * Chạy phần nhìn ảnh của SigLIP-b16 (file ONNX) trên CPU. Đầu ra "pooler_output" (768 số) chính là
 * vector ảnh mà bản đánh giá đã dùng (get_image_features). OrtSession dùng chung được giữa nhiều luồng.
 */
public final class OnnxImageEncoder implements ImageEncoder, AutoCloseable {

    private final OrtEnvironment env;
    private final OrtSession session;
    private final String inputName;

    public OnnxImageEncoder(Path modelFile) throws OrtException {
        this.env = OrtEnvironment.getEnvironment();
        OrtSession.SessionOptions options = new OrtSession.SessionOptions();
        options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        // Không chiếm hết CPU của máy chủ: mỗi lượt chạy tối đa 2 luồng
        options.setIntraOpNumThreads(Math.max(1, Math.min(2, Runtime.getRuntime().availableProcessors())));
        this.session = env.createSession(modelFile.toString(), options);
        this.inputName = session.getInputNames().iterator().next();
    }

    @Override
    public float[] encode(BufferedImage image) {
        float[] pixels = SiglipPreprocessor.toTensor(image);
        long[] shape = {1, 3, SiglipPreprocessor.SIZE, SiglipPreprocessor.SIZE};
        try (OnnxTensor input = OnnxTensor.createTensor(env, FloatBuffer.wrap(pixels), shape);
             OrtSession.Result result = session.run(Map.of(inputName, input), java.util.Set.of("pooler_output"))) {
            float[][] out = (float[][]) result.get("pooler_output").orElseThrow().getValue();
            return ImageEncoder.normalize(out[0]);
        } catch (OrtException e) {
            throw new IllegalStateException("Mô hình tìm ảnh lỗi khi chạy", e);
        }
    }

    @Override
    public void close() throws OrtException {
        session.close();
    }
}
