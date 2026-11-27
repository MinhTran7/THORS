package com.thors.module.imagesearch.color;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Đoán LOẠI HÀNG trong ảnh (Giày / Dép / Balo / Túi xách / Áo / Quần / Váy / Ví / Thắt Lưng) bằng cách so vector ảnh
 * SigLIP với vector câu mô tả ("a photo of sneakers."...), giống cách đoán màu. Vector câu tính sẵn bằng Python
 * (resources/imagesearch/type-text-embeddings.json). Tên loại = tên danh mục gốc trong DB.
 *
 * Dùng để chọn danh mục gợi ý khi shop chưa có mẫu: sản phẩm hạng 1 có thể khác loại (giày da trắng giống ảnh
 * balo da trắng hơn giày của shop). Thử nghiệm 18/11/2026: đúng loại 20/20 ảnh đồ không bán, 144/148 ảnh có bán.
 */
public final class TypeClassifier {

    public static final String RESOURCE = "/imagesearch/type-text-embeddings.json";

    /**
     * Loại đoán được (chỉ trong các loại hàng), độ chắc (tổng xác suất các kiểu đồ thuộc loại đó) và
     * notProduct = tổng xác suất các lớp "không phải sản phẩm" (nhân vật hoạt hình, logo, con vật, đồ ăn...).
     */
    public record Guess(String type, double probability, double notProduct) {
        public Guess(String type, double probability) {
            this(type, probability, 0);
        }
    }

    private final List<String> classTypes;
    private final float[][] vectors;
    private final double logitScale;
    private final String notProductType;

    private TypeClassifier(List<String> classTypes, float[][] vectors, double logitScale, String notProductType) {
        this.classTypes = classTypes;
        this.vectors = vectors;
        this.logitScale = logitScale;
        this.notProductType = notProductType;
    }

    public static TypeClassifier loadDefault() {
        try (InputStream in = TypeClassifier.class.getResourceAsStream(RESOURCE)) {
            if (in == null) {
                throw new IllegalStateException("Thiếu file " + RESOURCE);
            }
            JsonNode root = new ObjectMapper().readTree(in);
            int dim = root.path("dimension").asInt();
            List<String> types = new ArrayList<>();
            root.path("classes").forEach(c -> types.add(c.path("type").asText()));
            ByteBuffer buf = ByteBuffer.wrap(java.util.Base64.getDecoder().decode(root.path("vectors").asText()))
                    .order(ByteOrder.LITTLE_ENDIAN);
            float[][] m = new float[types.size()][dim];
            for (float[] row : m) {
                for (int j = 0; j < dim; j++) row[j] = buf.getFloat();
            }
            return new TypeClassifier(types, m, root.path("logitScale").asDouble(), root.path("notProductType").asText("NOT_PRODUCT"));
        } catch (IOException e) {
            throw new IllegalStateException("Không đọc được " + RESOURCE, e);
        }
    }

    public Guess guess(float[] imageVector) {
        double[] p = new double[vectors.length];
        double max = Double.NEGATIVE_INFINITY;
        for (int i = 0; i < vectors.length; i++) {
            double s = 0;
            for (int j = 0; j < imageVector.length; j++) s += vectors[i][j] * imageVector[j];
            p[i] = logitScale * s;
            max = Math.max(max, p[i]);
        }
        double total = 0;
        for (int i = 0; i < p.length; i++) {
            p[i] = Math.exp(p[i] - max);
            total += p[i];
        }
        Map<String, Double> byType = new LinkedHashMap<>();
        for (int i = 0; i < p.length; i++) {
            byType.merge(classTypes.get(i), p[i] / total, Double::sum);
        }
        double notProduct = byType.getOrDefault(notProductType, 0.0);
        Map.Entry<String, Double> best = byType.entrySet().stream()
                .filter(e -> !e.getKey().equals(notProductType))
                .max(Map.Entry.comparingByValue()).orElseThrow();
        return new Guess(best.getKey(), best.getValue(), notProduct);
    }
}
