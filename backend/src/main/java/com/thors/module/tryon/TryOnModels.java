package com.thors.module.tryon;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * Chọn người mẫu theo số đo của khách + mô tả dáng người cho AI (không gọi DB, dễ kiểm thử).
 *
 * <p>Dáng theo chỉ số BMI (cân nặng / chiều cao²): dưới 18,5 gầy, 18,5-24,9 vừa, từ 25 đầy đặn
 * (ngưỡng phổ biến của WHO; chỉ để chọn ảnh người mẫu gần dáng, không dùng để đánh giá sức khỏe).
 */
public final class TryOnModels {

    public enum BodyType { SLIM, REGULAR, FULL }

    /** Người mẫu dựng sẵn (dòng của bảng tryon_model). */
    public record Model(int modelId, String gender, BodyType bodyType, int heightCm, String imageUrl) {
    }

    private TryOnModels() {
    }

    public static BodyType bodyType(double heightCm, double weightKg) {
        if (heightCm <= 0 || weightKg <= 0) return BodyType.REGULAR;
        double bmi = weightKg / Math.pow(heightCm / 100.0, 2);
        if (bmi < 18.5) return BodyType.SLIM;
        if (bmi < 25) return BodyType.REGULAR;
        return BodyType.FULL;
    }

    /**
     * Người mẫu gần khách nhất: cùng giới tính; ưu tiên đúng dáng, rồi dáng liền kề; trong cùng mức thì
     * chiều cao gần nhất. heightCm / weightKg null = chưa có số đo -> chọn dáng vừa, cao 160 (nữ) / 170 (nam).
     */
    public static Optional<Model> suggest(List<Model> models, String gender, Double heightCm, Double weightKg) {
        if (gender == null) return Optional.empty();
        double height = heightCm != null ? heightCm : "MALE".equals(gender) ? 170 : 160;
        BodyType want = heightCm != null && weightKg != null ? bodyType(heightCm, weightKg) : BodyType.REGULAR;
        return models.stream()
                .filter(m -> gender.equals(m.gender()))
                .min(Comparator.<Model>comparingInt(m -> Math.abs(m.bodyType().ordinal() - want.ordinal()))
                        .thenComparingDouble(m -> Math.abs(m.heightCm() - height))
                        .thenComparingInt(Model::modelId));
    }

    /** Mô tả người mẫu cho AI tạo ảnh (tiếng Anh: các dịch vụ hiểu tốt nhất). */
    public static String describe(String gender, double heightCm, double weightKg) {
        String person = "MALE".equals(gender) ? "man" : "woman";
        String build = switch (bodyType(heightCm, weightKg)) {
            case SLIM -> "slim";
            case REGULAR -> "average";
            case FULL -> "plus-size";
        };
        return "Vietnamese " + person + ", about " + Math.round(heightCm) + " cm tall, " + build
                + " build, full body, standing straight, facing the camera, plain light studio background";
    }
}
