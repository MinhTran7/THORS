package com.thors.module.fitting.garment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.thors.common.ApiException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * Đọc và kiểm tra file GLB (glTF 2.0 dạng nhị phân) trước khi cho làm quần áo 3D của sản phẩm.
 *
 * <p>Chỉ đọc phần JSON của file (không giải nén hình học): đúng định dạng, có các núm co giãn cùng tên với người mẫu
 * THORS (để áo béo / gầy theo số đo + đổi size), có vật liệu vải để đổi màu, chỉ dùng kiểu nén trình duyệt đọc được.
 * Áo có ôm khéo hay không thì máy không biết được - Owner xem trước trên người mẫu rồi mới lưu.
 *
 * <p>Cấu trúc GLB: 12 byte đầu (magic "glTF", version, tổng độ dài) + khối JSON (độ dài, "JSON", nội dung) + khối BIN.
 */
public final class GlbInspector {

    /** Bằng giới hạn file raw của Cloudinary (gói Free) và spring.servlet.multipart.max-file-size. */
    public static final int MAX_BYTES = 10 * 1024 * 1024;

    static final int MAGIC_GLTF = 0x46546C67; // "glTF"
    static final int CHUNK_JSON = 0x4E4F534A; // "JSON"

    /** Núm đổi size áo (dựng trong Blender cùng với áo). */
    static final List<String> SIZE_MORPHS = List.of("Size_up", "Size_down");
    /** Núm co giãn theo số đo - phải trùng tên với người mẫu (avatar-*.json) để áo đổi dáng cùng cơ thể. */
    static final List<String> BODY_MORPHS = List.of("Bust_up", "Bust_down", "Waist_up", "Waist_down", "Hips_up", "Hips_down");
    /** Phần mở rộng trình xem 3D (three.js, useGLTF có meshopt, không Draco) đọc được. */
    static final Set<String> SUPPORTED_EXTENSIONS = Set.of(
            "EXT_meshopt_compression", "KHR_mesh_quantization", "KHR_texture_transform", "KHR_materials_emissive_strength");

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private GlbInspector() {
    }

    /**
     * Thông tin đọc được từ file.
     *
     * @param morphTargets tên các núm (extras.targetNames của các mesh - Blender ghi khi xuất glTF)
     * @param materials tên các vật liệu
     * @param requiredExtensions phần mở rộng bắt buộc để đọc được file
     */
    public record Info(Set<String> morphTargets, Set<String> materials, Set<String> requiredExtensions) {
    }

    /** Đọc khối JSON của file GLB. Sai định dạng -> ApiException 400. */
    public static Info inspect(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new ApiException(400, "GLB_REQUIRED", "Hãy chọn file mô hình 3D (.glb).");
        }
        if (bytes.length > MAX_BYTES) {
            throw new ApiException(400, "GLB_TOO_LARGE",
                    "File mô hình 3D tối đa 10 MB. Hãy nén file (meshopt) hoặc giảm số đa giác trong Blender.");
        }
        if (bytes.length < 20) throw invalid();
        ByteBuffer buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        if (buf.getInt(0) != MAGIC_GLTF) throw invalid();
        if (buf.getInt(4) != 2) {
            throw new ApiException(400, "GLB_VERSION", "Chỉ hỗ trợ glTF 2.0 - hãy xuất lại file từ Blender (định dạng glTF Binary).");
        }
        long declared = Integer.toUnsignedLong(buf.getInt(8));
        long jsonLength = Integer.toUnsignedLong(buf.getInt(12));
        if (declared != bytes.length || buf.getInt(16) != CHUNK_JSON || 20 + jsonLength > bytes.length) throw invalid();

        JsonNode root;
        try {
            root = MAPPER.readTree(new String(bytes, 20, (int) jsonLength, StandardCharsets.UTF_8).trim());
        } catch (Exception e) {
            throw invalid();
        }
        if (root == null || !root.isObject()) throw invalid();

        Set<String> morphs = new LinkedHashSet<>();
        for (JsonNode mesh : root.path("meshes")) {
            for (JsonNode name : mesh.path("extras").path("targetNames")) {
                if (name.isTextual()) morphs.add(name.asText());
            }
        }
        Set<String> materials = new LinkedHashSet<>();
        for (JsonNode material : root.path("materials")) {
            if (material.path("name").isTextual()) materials.add(material.path("name").asText());
        }
        Set<String> extensions = new LinkedHashSet<>();
        for (JsonNode ext : root.path("extensionsRequired")) {
            if (ext.isTextual()) extensions.add(ext.asText());
        }
        return new Info(morphs, materials, extensions);
    }

    /**
     * File có mặc được lên người mẫu THORS không. Lỗi đầu tiên gặp -> ApiException 400 (thông báo nói rõ cần sửa gì).
     *
     * @param fabricMaterial tên vật liệu vải Owner chọn (sẽ được đổi màu theo biến thể)
     */
    public static void requireWearable(Info info, String fabricMaterial) {
        Set<String> unsupported = new TreeSet<>(info.requiredExtensions());
        unsupported.removeAll(SUPPORTED_EXTENSIONS);
        if (!unsupported.isEmpty()) {
            throw new ApiException(400, "GLB_EXTENSION",
                    "File dùng định dạng chưa hỗ trợ: " + String.join(", ", unsupported)
                            + ". Hãy xuất lại không nén Draco (nén bằng meshopt).");
        }
        if (!info.morphTargets().containsAll(SIZE_MORPHS)) {
            throw new ApiException(400, "GLB_NO_SIZE_MORPH",
                    "File thiếu núm đổi size (Size_up, Size_down). Hãy tạo 2 shape key này trong Blender.");
        }
        List<String> missing = BODY_MORPHS.stream().filter(m -> !info.morphTargets().contains(m)).toList();
        if (!missing.isEmpty()) {
            throw new ApiException(400, "GLB_BODY_MORPH_MISSING",
                    "File thiếu núm co giãn theo số đo: " + String.join(", ", missing)
                            + ". Áo phải được dựng trên người mẫu THORS và chép các shape key của cơ thể.");
        }
        if (fabricMaterial == null || !info.materials().contains(fabricMaterial)) {
            throw new ApiException(400, "GLB_FABRIC_NOT_FOUND",
                    "Không có vật liệu \"" + (fabricMaterial == null ? "" : fabricMaterial) + "\" trong file. Vật liệu có trong file: "
                            + (info.materials().isEmpty() ? "(không có)" : String.join(", ", info.materials())) + ".");
        }
    }

    private static ApiException invalid() {
        return new ApiException(400, "GLB_INVALID", "File không phải mô hình 3D GLB hợp lệ. Hãy xuất lại từ Blender (glTF Binary .glb).");
    }
}
