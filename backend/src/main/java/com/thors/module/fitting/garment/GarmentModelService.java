package com.thors.module.fitting.garment;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.fitting.garment.GarmentModelDtos.FabricColor;
import com.thors.module.fitting.garment.GarmentModelDtos.GarmentModelView;
import com.thors.module.fitting.garment.GarmentModelDtos.ShopGarmentModel;
import com.thors.module.fitting.garment.GarmentModelDtos.SizeMorph;
import com.thors.module.fitting.garment.GarmentModelRepository.Row;
import com.thors.module.fitting.garment.GarmentModelRepository.Variant;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * Mô hình 3D quần áo của sản phẩm cho Phòng thử đồ: Owner tải file GLB + khai báo vị trí mặc, size -> núm Size,
 * màu biến thể -> màu vải. Mỗi sản phẩm tối đa 1 mô hình (product_garment_model).
 *
 * <p>Thay file an toàn: tải file mới lên trước, lưu DB xong mới xóa file cũ; lưu lỗi thì xóa file mới.
 */
@Service
public class GarmentModelService {

    static final Set<String> SLOTS = Set.of("TOP", "BOTTOM", "DRESS", "OUTER", "SHOES");
    static final Set<String> GENDERS = Set.of("MALE", "FEMALE");
    static final int MAX_ENTRIES = 30;
    /** Phòng thử đồ hỏi một lần cho cả bộ / cả trang tủ đồ. */
    static final int MAX_SHOP_IDS = 50;
    private static final Pattern HEX = Pattern.compile("^#[0-9A-Fa-f]{6}$");
    /** File vừa tải lên nhưng chưa kịp lưu DB thì chưa phải "mồ côi". */
    private static final Duration ORPHAN_GRACE = Duration.ofHours(1);

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Logger log = LoggerFactory.getLogger(GarmentModelService.class);

    private final GarmentModelRepository repo;
    private final GarmentModelStore store;

    public GarmentModelService(GarmentModelRepository repo, GarmentModelStore store) {
        this.repo = repo;
        this.store = store;
    }

    /** Mô hình của sản phẩm (trang quản trị); chưa có -> Optional rỗng. */
    public Optional<GarmentModelView> get(int productId) {
        requireReady();
        requireProduct(productId);
        return repo.find(productId).map(GarmentModelService::view);
    }

    /**
     * Tạo / cập nhật mô hình. file: bắt buộc lần đầu, các lần sau chỉ khi thay file.
     *
     * @param sizesJson {"S":{"up":0,"down":1},...} - khóa phải là size của biến thể
     * @param colorsJson {"Navy":{"hex":"#22273C"},...} - khóa phải là màu của biến thể (có thể rỗng: giữ màu gốc)
     */
    public GarmentModelView save(Account actor, int productId, MultipartFile file, String slot, String gender,
                                 String fabricMaterial, String sizesJson, String colorsJson) {
        requireOwner(actor);
        requireReady();
        requireProduct(productId);

        String s = upper(slot);
        if (!SLOTS.contains(s)) throw new ApiException(400, "GARMENT_SLOT", "Hãy chọn vị trí mặc (áo, quần, đầm, áo khoác, giày).");
        String g = upper(gender);
        if (!GENDERS.contains(g)) throw new ApiException(400, "GARMENT_GENDER", "Hãy chọn người mẫu nam hoặc nữ.");
        String fabric = fabricMaterial == null ? "" : fabricMaterial.trim();
        if (fabric.isEmpty() || fabric.length() > 64) {
            throw new ApiException(400, "GARMENT_FABRIC", "Hãy chọn vật liệu vải (tối đa 64 ký tự).");
        }

        List<Variant> variants = repo.variants(productId);
        Map<String, SizeMorph> sizes = parseSizes(sizesJson, variants);
        Map<String, FabricColor> colors = parseColors(colorsJson, variants);

        Optional<Row> existing = repo.find(productId);
        byte[] bytes = readFile(file);
        if (bytes == null) {
            Row old = existing.orElseThrow(() -> new ApiException(400, "GLB_REQUIRED", "Hãy chọn file mô hình 3D (.glb)."));
            if (!old.fabricMaterial().equals(fabric)) {
                throw new ApiException(400, "GARMENT_FABRIC_NEEDS_FILE",
                        "Đổi vật liệu vải cần tải lại file để kiểm tra vật liệu có trong file.");
            }
            repo.upsert(productId, old.glbUrl(), old.glbPublicId(), old.fileSizeBytes(), s, g, fabric, json(sizes), json(colors),
                    actor.id());
            return get(productId).orElseThrow();
        }

        GlbInspector.requireWearable(GlbInspector.inspect(bytes), fabric);
        GarmentModelStore.Stored stored = store.upload(productId, bytes);
        try {
            repo.upsert(productId, stored.url(), stored.publicId(), bytes.length, s, g, fabric, json(sizes), json(colors), actor.id());
        } catch (RuntimeException e) {
            store.destroy(productId, stored.publicId());
            throw e;
        }
        existing.ifPresent(old -> store.destroy(productId, old.glbPublicId()));
        return get(productId).orElseThrow();
    }

    public GarmentModelView setActive(Account actor, int productId, Boolean active) {
        requireOwner(actor);
        requireReady();
        if (active == null) throw new ApiException(400, "GARMENT_ACTIVE", "Thiếu trạng thái bật / tắt.");
        if (repo.setActive(productId, active) == 0) throw notFound();
        return get(productId).orElseThrow();
    }

    public void delete(Account actor, int productId) {
        requireOwner(actor);
        requireReady();
        Row row = repo.find(productId).orElseThrow(GarmentModelService::notFound);
        repo.delete(productId);
        store.destroy(productId, row.glbPublicId());
    }

    /**
     * Phòng thử đồ: mô hình đang bật của các sản phẩm đang bán. Sản phẩm không có trong kết quả = chưa hỗ trợ thử 3D.
     * DB chưa chạy migration -> rỗng (tính năng tạm ẩn, không báo lỗi cho khách).
     */
    public List<ShopGarmentModel> shopModels(List<Integer> productIds) {
        Set<Integer> ids = new LinkedHashSet<>();
        for (Integer id : productIds == null ? List.<Integer>of() : productIds) {
            if (id != null && id > 0) ids.add(id);
        }
        if (ids.size() > MAX_SHOP_IDS) {
            throw new ApiException(400, "GARMENT_TOO_MANY_IDS", "Mỗi lần hỏi tối đa " + MAX_SHOP_IDS + " sản phẩm.");
        }
        if (ids.isEmpty() || !repo.tableReady()) return List.of();
        return repo.activeForShop(ids).stream()
                .map(r -> new ShopGarmentModel(r.productId(), r.glbUrl(), r.slot(), r.gender(), r.fabricMaterial(),
                        readSizes(r.sizeMorphsJson()), readColors(r.colorMapJson())))
                .toList();
    }

    /**
     * Dọn file GLB không còn dòng nào trỏ tới (sản phẩm bị xóa -> dòng tự xóa theo CASCADE nhưng file còn trên Cloudinary).
     * Bỏ qua file mới tải trong 1 giờ (có thể đang lưu dở). 3 giờ 40 sáng mỗi ngày.
     */
    @Scheduled(cron = "0 40 3 * * *")
    public void cleanupOrphans() {
        try {
            if (!repo.tableReady()) return;
            Set<String> inUse = new HashSet<>(repo.publicIdsInUse());
            Instant cutoff = Instant.now().minus(ORPHAN_GRACE);
            int removed = 0;
            for (GarmentModelStore.CloudFile f : store.listFiles()) {
                if (inUse.contains(f.publicId()) || f.createdAt() == null || f.createdAt().isAfter(cutoff)) continue;
                store.destroyOrphan(f.publicId());
                removed++;
            }
            if (removed > 0) log.info("Removed {} orphan garment model file(s)", removed);
        } catch (RuntimeException e) {
            log.warn("Garment model cleanup failed: {}", e.toString());
        }
    }

    // ---------------------------------------------------------------- kiểm tra dữ liệu

    /** Bảng size: khóa phải là size có thật của sản phẩm (ghi đúng cách viết của biến thể), up / down trong 0..1. */
    static Map<String, SizeMorph> parseSizes(String json, List<Variant> variants) {
        Map<String, SizeMorph> raw = readJson(json, new TypeReference<LinkedHashMap<String, SizeMorph>>() {}, "GARMENT_SIZES_FORMAT",
                "Bảng size không đúng định dạng.");
        if (raw.isEmpty()) {
            throw new ApiException(400, "GARMENT_SIZES_REQUIRED", "Hãy khai báo mức size cho ít nhất một size của sản phẩm.");
        }
        if (raw.size() > MAX_ENTRIES) throw new ApiException(400, "GARMENT_SIZES_TOO_MANY", "Tối đa " + MAX_ENTRIES + " size.");
        Map<String, String> known = canonical(variants.stream().map(Variant::size).toList());
        Map<String, SizeMorph> out = new LinkedHashMap<>();
        for (Map.Entry<String, SizeMorph> e : raw.entrySet()) {
            String size = known.get(key(e.getKey()));
            if (size == null) {
                throw new ApiException(400, "SIZE_NOT_IN_PRODUCT", "Sản phẩm không có size \"" + e.getKey() + "\".");
            }
            SizeMorph m = e.getValue();
            if (m == null || !inRange(m.up()) || !inRange(m.down()) || (m.up() > 0 && m.down() > 0)) {
                throw new ApiException(400, "SIZE_MORPH_RANGE",
                        "Size " + size + ": mức nới (up) và thu nhỏ (down) phải từ 0 đến 1 và chỉ dùng một trong hai.");
            }
            out.put(size, m);
        }
        return out;
    }

    /** Bảng màu (không bắt buộc): khóa phải là màu có thật của sản phẩm, hex dạng #RRGGBB. */
    static Map<String, FabricColor> parseColors(String json, List<Variant> variants) {
        if (json == null || json.isBlank()) return new LinkedHashMap<>();
        Map<String, FabricColor> raw = readJson(json, new TypeReference<LinkedHashMap<String, FabricColor>>() {}, "GARMENT_COLORS_FORMAT",
                "Bảng màu không đúng định dạng.");
        if (raw.size() > MAX_ENTRIES) throw new ApiException(400, "GARMENT_COLORS_TOO_MANY", "Tối đa " + MAX_ENTRIES + " màu.");
        Map<String, String> known = canonical(variants.stream().map(Variant::color).toList());
        Map<String, FabricColor> out = new LinkedHashMap<>();
        for (Map.Entry<String, FabricColor> e : raw.entrySet()) {
            String color = known.get(key(e.getKey()));
            if (color == null) {
                throw new ApiException(400, "COLOR_NOT_IN_PRODUCT", "Sản phẩm không có màu \"" + e.getKey() + "\".");
            }
            String hex = e.getValue() == null ? null : e.getValue().hex();
            if (hex == null || !HEX.matcher(hex.trim()).matches()) {
                throw new ApiException(400, "COLOR_HEX", "Màu " + color + ": mã màu phải dạng #RRGGBB.");
            }
            out.put(color, new FabricColor(hex.trim().toUpperCase(Locale.ROOT)));
        }
        return out;
    }

    private static boolean inRange(double v) {
        return Double.isFinite(v) && v >= 0 && v <= 1;
    }

    // Size / màu so không phân biệt hoa thường, khoảng trắng hai đầu; lưu theo cách viết của biến thể
    private static Map<String, String> canonical(List<String> values) {
        Map<String, String> map = new LinkedHashMap<>();
        for (String v : values) if (v != null && !v.isBlank()) map.putIfAbsent(key(v), v.trim());
        return map;
    }

    private static String key(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT);
    }

    private static <T> T readJson(String json, TypeReference<T> type, String code, String message) {
        if (json == null || json.isBlank()) {
            try {
                return MAPPER.readValue("{}", type);
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }
        try {
            T value = MAPPER.readValue(json, type);
            if (value == null) throw new ApiException(400, code, message);
            return value;
        } catch (IOException e) {
            throw new ApiException(400, code, message);
        }
    }

    private static Map<String, SizeMorph> readSizes(String json) {
        try {
            return MAPPER.readValue(json, new TypeReference<LinkedHashMap<String, SizeMorph>>() {});
        } catch (IOException e) {
            return Map.of();
        }
    }

    private static Map<String, FabricColor> readColors(String json) {
        try {
            return MAPPER.readValue(json, new TypeReference<LinkedHashMap<String, FabricColor>>() {});
        } catch (IOException e) {
            return Map.of();
        }
    }

    private static String json(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] readFile(MultipartFile file) {
        if (file == null || file.isEmpty()) return null;
        if (file.getSize() > GlbInspector.MAX_BYTES) {
            throw new ApiException(400, "GLB_TOO_LARGE", "File mô hình 3D tối đa 10 MB.");
        }
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw new ApiException(400, "GLB_INVALID", "Không đọc được file mô hình 3D.");
        }
    }

    private static GarmentModelView view(Row r) {
        return new GarmentModelView(r.productId(), r.glbUrl(), r.fileSizeBytes(), r.slot(), r.gender(), r.fabricMaterial(),
                readSizes(r.sizeMorphsJson()), readColors(r.colorMapJson()), r.active(), r.updatedAt());
    }

    private void requireReady() {
        if (!repo.tableReady()) {
            throw new ApiException(503, "GARMENT_NOT_READY",
                    "Cơ sở dữ liệu chưa có bảng mô hình 3D. Hãy chạy migration 2026-11-23_product_garment_model.sql.");
        }
    }

    private void requireProduct(int productId) {
        if (!repo.productExists(productId)) throw new ApiException(404, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm.");
    }

    // SecurityConfig đã chặn PUT / PATCH / DELETE /api/products/** cho Owner; kiểm tra lại ở đây cho chắc
    private static void requireOwner(Account actor) {
        if (actor == null || !"OWNER".equals(actor.role())) {
            throw new ApiException(403, "FORBIDDEN", "Chỉ chủ cửa hàng được quản lý mô hình 3D.");
        }
    }

    private static ApiException notFound() {
        return new ApiException(404, "GARMENT_NOT_FOUND", "Sản phẩm chưa có mô hình 3D.");
    }

    private static String upper(String s) {
        return s == null ? "" : s.trim().toUpperCase(Locale.ROOT);
    }
}
