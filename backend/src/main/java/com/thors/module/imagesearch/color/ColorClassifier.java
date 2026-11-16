package com.thors.module.imagesearch.color;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.Base64;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * Đoán màu món đồ trong ảnh bằng cách so vector ảnh SigLIP với vector của các câu mô tả màu
 * ("a photo of a red backpack"...). Vector câu đã tính sẵn bằng Python (resources/imagesearch/color-text-embeddings.json)
 * nên backend không cần chạy phần hiểu chữ của mô hình. Đánh giá lần 3-4: đúng nhóm màu 57/64 ảnh.
 */
public final class ColorClassifier {

    public static final String RESOURCE = "/imagesearch/color-text-embeddings.json";

    /** Một màu trong bảng 14 màu. */
    public record Color(String key, String name, String family) {}

    /** Màu đoán được và độ chắc (xác suất 0..1). */
    public record Guess(String key, String name, String family, double probability) {}

    private final List<Color> colors;
    private final Map<ProductGroup, float[][]> textVectors;
    private final double logitScale;

    private ColorClassifier(List<Color> colors, Map<ProductGroup, float[][]> textVectors, double logitScale) {
        this.colors = colors;
        this.textVectors = textVectors;
        this.logitScale = logitScale;
    }

    public static ColorClassifier loadDefault() {
        try (InputStream in = ColorClassifier.class.getResourceAsStream(RESOURCE)) {
            if (in == null) {
                throw new IllegalStateException("Thiếu file " + RESOURCE);
            }
            return load(in);
        } catch (IOException e) {
            throw new IllegalStateException("Không đọc được " + RESOURCE, e);
        }
    }

    static ColorClassifier load(InputStream in) throws IOException {
        JsonNode root = new ObjectMapper().readTree(in);
        int dim = root.path("dimension").asInt();
        List<Color> colors = new ArrayList<>();
        for (JsonNode c : root.path("colors")) {
            colors.add(new Color(c.path("key").asText(), c.path("name").asText(), c.path("family").asText()));
        }
        Map<ProductGroup, float[][]> vectors = new EnumMap<>(ProductGroup.class);
        root.path("groups").properties().forEach(e -> {
            byte[] raw = Base64.getDecoder().decode(e.getValue().path("vectors").asText());
            ByteBuffer buf = ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN);
            float[][] m = new float[colors.size()][dim];
            for (int i = 0; i < colors.size(); i++) {
                for (int j = 0; j < dim; j++) {
                    m[i][j] = buf.getFloat();
                }
            }
            vectors.put(ProductGroup.valueOf(e.getKey()), m);
        });
        return new ColorClassifier(colors, vectors, root.path("logitScale").asDouble());
    }

    public List<Color> colors() {
        return colors;
    }

    /** Đoán màu; trả null với nhóm không kiểm màu (mặt thắt lưng). */
    public Guess guess(float[] imageVector, ProductGroup group) {
        float[][] m = textVectors.get(group == null ? ProductGroup.CLOTHES : group);
        if (m == null) {
            return null;
        }
        double[] logits = new double[m.length];
        double max = Double.NEGATIVE_INFINITY;
        for (int i = 0; i < m.length; i++) {
            double s = 0;
            for (int j = 0; j < imageVector.length; j++) {
                s += m[i][j] * imageVector[j];
            }
            logits[i] = logitScale * s;
            max = Math.max(max, logits[i]);
        }
        double total = 0;
        int best = 0;
        for (int i = 0; i < logits.length; i++) {
            logits[i] = Math.exp(logits[i] - max);
            total += logits[i];
            if (logits[i] > logits[best]) best = i;
        }
        Color c = colors.get(best);
        return new Guess(c.key(), c.name(), c.family(), logits[best] / total);
    }

    /** Vector câu mô tả của một màu (dùng cho test). */
    float[] textVector(ProductGroup group, String colorKey) {
        for (int i = 0; i < colors.size(); i++) {
            if (colors.get(i).key().equals(colorKey)) {
                return textVectors.get(group)[i];
            }
        }
        throw new IllegalArgumentException(colorKey);
    }
}
