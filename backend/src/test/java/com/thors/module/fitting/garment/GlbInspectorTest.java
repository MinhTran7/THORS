package com.thors.module.fitting.garment;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.thors.common.ApiException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class GlbInspectorTest {

    private static final String ALL_MORPHS =
            "\"Bust_up\",\"Bust_down\",\"Waist_up\",\"Waist_down\",\"Hips_up\",\"Hips_down\",\"Size_up\",\"Size_down\"";

    /** Dựng file GLB tối thiểu: header + khối JSON (đệm khoảng trắng cho tròn 4 byte) + khối BIN rỗng. */
    static byte[] glb(String json, int version) {
        byte[] j = json.getBytes(StandardCharsets.UTF_8);
        int pad = (4 - j.length % 4) % 4;
        int jsonLen = j.length + pad;
        int total = 12 + 8 + jsonLen + 8;
        ByteBuffer b = ByteBuffer.allocate(total).order(ByteOrder.LITTLE_ENDIAN);
        b.putInt(GlbInspector.MAGIC_GLTF).putInt(version).putInt(total);
        b.putInt(jsonLen).putInt(GlbInspector.CHUNK_JSON).put(j);
        for (int i = 0; i < pad; i++) b.put((byte) ' ');
        b.putInt(0).putInt(0x004E4942); // khối BIN rỗng
        return b.array();
    }

    static byte[] garment(String morphs, String materials, String extensionsRequired) {
        return glb("{\"asset\":{\"version\":\"2.0\"},\"meshes\":[{\"extras\":{\"targetNames\":[" + morphs + "]}}],"
                + "\"materials\":[" + materials + "]"
                + (extensionsRequired == null ? "" : ",\"extensionsRequired\":[" + extensionsRequired + "]") + "}", 2);
    }

    static byte[] validGarment() {
        return garment(ALL_MORPHS, "{\"name\":\"LinenNavy\"},{\"name\":\"ButtonNavy\"}",
                "\"EXT_meshopt_compression\",\"KHR_mesh_quantization\"");
    }

    private static String code(Runnable r) {
        return assertThrows(ApiException.class, r::run).code;
    }

    @Test
    void validGarmentPasses() {
        GlbInspector.Info info = GlbInspector.inspect(validGarment());
        assertTrue(info.morphTargets().contains("Size_up"));
        assertEquals(java.util.Set.of("LinenNavy", "ButtonNavy"), info.materials());
        assertDoesNotThrow(() -> GlbInspector.requireWearable(info, "LinenNavy"));
    }

    @Test
    void emptyOrMissingFileIsRequired() {
        assertEquals("GLB_REQUIRED", code(() -> GlbInspector.inspect(null)));
        assertEquals("GLB_REQUIRED", code(() -> GlbInspector.inspect(new byte[0])));
    }

    @Test
    void sizeLimitIsTenMegabytes() {
        byte[] big = new byte[GlbInspector.MAX_BYTES + 1];
        assertEquals("GLB_TOO_LARGE", code(() -> GlbInspector.inspect(big)));
        // Đúng 10 MB: không bị chặn vì dung lượng (bị chặn vì không phải GLB)
        assertEquals("GLB_INVALID", code(() -> GlbInspector.inspect(new byte[GlbInspector.MAX_BYTES])));
    }

    @Test
    void wrongMagicTruncatedOrBadJsonIsInvalid() {
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
        assertEquals("GLB_INVALID", code(() -> GlbInspector.inspect(png)));
        byte[] truncated = java.util.Arrays.copyOf(validGarment(), 30);
        assertEquals("GLB_INVALID", code(() -> GlbInspector.inspect(truncated)));
        assertEquals("GLB_INVALID", code(() -> GlbInspector.inspect(glb("{not json", 2))));
        assertEquals("GLB_INVALID", code(() -> GlbInspector.inspect(glb("[1,2]", 2))));
    }

    @Test
    void onlyGltf2() {
        assertEquals("GLB_VERSION", code(() -> GlbInspector.inspect(glb("{}", 1))));
    }

    @Test
    void missingSizeMorphIsRejected() {
        var info = GlbInspector.inspect(garment("\"Bust_up\",\"Bust_down\",\"Waist_up\",\"Waist_down\",\"Hips_up\",\"Hips_down\"",
                "{\"name\":\"Fleece\"}", null));
        assertEquals("GLB_NO_SIZE_MORPH", code(() -> GlbInspector.requireWearable(info, "Fleece")));
    }

    @Test
    void missingBodyMorphIsRejectedWithNames() {
        var info = GlbInspector.inspect(garment("\"Size_up\",\"Size_down\",\"Bust_up\",\"Bust_down\"", "{\"name\":\"Fleece\"}", null));
        ApiException e = assertThrows(ApiException.class, () -> GlbInspector.requireWearable(info, "Fleece"));
        assertEquals("GLB_BODY_MORPH_MISSING", e.code);
        assertTrue(e.getMessage().contains("Waist_up") && e.getMessage().contains("Hips_down"));
    }

    @Test
    void fabricMustExistInFile() {
        var info = GlbInspector.inspect(validGarment());
        ApiException e = assertThrows(ApiException.class, () -> GlbInspector.requireWearable(info, "ShirtMint"));
        assertEquals("GLB_FABRIC_NOT_FOUND", e.code);
        assertTrue(e.getMessage().contains("LinenNavy"), "liệt kê vật liệu có trong file");
        assertEquals("GLB_FABRIC_NOT_FOUND", code(() -> GlbInspector.requireWearable(info, null)));
    }

    @Test
    void dracoCompressionIsRejected() {
        var info = GlbInspector.inspect(garment(ALL_MORPHS, "{\"name\":\"Fleece\"}", "\"KHR_draco_mesh_compression\""));
        assertEquals("GLB_EXTENSION", code(() -> GlbInspector.requireWearable(info, "Fleece")));
    }

    @Test
    void mannequinFileIsNotAGarment() {
        // Người mẫu có núm cơ thể nhưng không có Size_up / Size_down -> không phải quần áo
        var info = GlbInspector.inspect(garment(
                "\"Bust_up\",\"Bust_down\",\"Waist_up\",\"Waist_down\",\"Hips_up\",\"Hips_down\"", "{\"name\":\"MannequinGray\"}", null));
        assertEquals("GLB_NO_SIZE_MORPH", code(() -> GlbInspector.requireWearable(info, "MannequinGray")));
    }

    /** File áo thật trong frontend (đã nén meshopt) phải qua kiểm tra; file người mẫu thì không. */
    @Test
    void realProjectFiles() throws Exception {
        Path models = Path.of("..", "frontend", "public", "models");
        Path shirt = models.resolve("garments/cuban-male.glb");
        Path avatar = models.resolve("avatar-male.glb");
        assumeTrue(Files.exists(shirt) && Files.exists(avatar), "chỉ chạy khi có thư mục frontend");
        assertDoesNotThrow(() -> GlbInspector.requireWearable(GlbInspector.inspect(Files.readAllBytes(shirt)), "LinenNavy"));
        var mannequin = GlbInspector.inspect(Files.readAllBytes(avatar));
        assertEquals("GLB_NO_SIZE_MORPH", code(() -> GlbInspector.requireWearable(mannequin, "MannequinGray")));
    }

    @Test
    void helperBuildsWellFormedFile() {
        assertEquals(0, validGarment().length % 4, "GLB luôn tròn 4 byte");
    }
}
