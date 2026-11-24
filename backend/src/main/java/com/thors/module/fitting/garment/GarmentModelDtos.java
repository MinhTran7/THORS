package com.thors.module.fitting.garment;

import java.time.LocalDateTime;
import java.util.Map;

/** Dữ liệu vào / ra của mô hình 3D quần áo (gom một file cho gọn). */
public final class GarmentModelDtos {

    private GarmentModelDtos() {
    }

    /** Mức vặn núm Size_up / Size_down (0..1, không cùng lớn hơn 0) cho một size biến thể. */
    public record SizeMorph(double up, double down) {
    }

    /** Màu vải (#RRGGBB) cho một màu biến thể. */
    public record FabricColor(String hex) {
    }

    /**
     * Mô hình 3D của sản phẩm (trang quản trị).
     *
     * @param sizes size biến thể -> mức vặn núm Size
     * @param colors màu biến thể -> màu vải
     */
    public record GarmentModelView(
            int productId,
            String glbUrl,
            int fileSizeBytes,
            String slot,
            String gender,
            String fabricMaterial,
            Map<String, SizeMorph> sizes,
            Map<String, FabricColor> colors,
            boolean active,
            LocalDateTime updatedAt) {
    }

    /** Mô hình 3D cho Phòng thử đồ (chỉ mô hình đang bật của sản phẩm đang bán). */
    public record ShopGarmentModel(
            int productId,
            String glbUrl,
            String slot,
            String gender,
            String fabricMaterial,
            Map<String, SizeMorph> sizes,
            Map<String, FabricColor> colors) {
    }

    /** PATCH bật / tắt. */
    public record ActiveRequest(Boolean active) {
    }
}
