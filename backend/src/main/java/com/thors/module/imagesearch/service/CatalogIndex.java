package com.thors.module.imagesearch.service;

import com.thors.module.imagesearch.model.ImageEncoder;
import com.thors.module.imagesearch.repository.ImageSearchRepository.CatalogImage;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

/**
 * Vector của mọi ảnh sản phẩm đang hiện trên web, giữ trong bộ nhớ (shop vài trăm ảnh = vài MB).
 * Khóa theo image_id + url: ảnh bị thay (url đổi) thì tính lại. Không ghi gì vào database.
 */
public final class CatalogIndex {

    private static final String MAGIC = "THORS-IMAGE-INDEX-1";

    /** Vector của một ảnh sản phẩm. */
    public record Entry(long imageId, int productId, String imageUrl, float[] vector) {}

    /** Điểm giống của một sản phẩm = điểm cao nhất giữa ảnh khách và các ảnh của sản phẩm đó. */
    public record ProductScore(int productId, double score) {}

    private volatile Map<Long, Entry> entries = Map.of();

    public int size() {
        return entries.size();
    }

    public int productCount() {
        Set<Integer> ids = new HashSet<>();
        entries.values().forEach(e -> ids.add(e.productId()));
        return ids.size();
    }

    /**
     * Đồng bộ với danh sách ảnh hiện tại: giữ vector cũ nếu ảnh không đổi, tính vector cho ảnh mới,
     * bỏ ảnh không còn trên web. embed trả null nếu ảnh lỗi (bỏ qua, lần sau thử lại).
     * @return true nếu có thay đổi
     */
    public boolean sync(List<CatalogImage> images, Function<CatalogImage, float[]> embed) {
        Map<Long, Entry> current = entries;
        Map<Long, Entry> next = new LinkedHashMap<>();
        boolean changed = images.size() != current.size();
        for (CatalogImage img : images) {
            Entry old = current.get(img.imageId());
            if (old != null && old.imageUrl().equals(img.imageUrl())) {
                next.put(img.imageId(), old.productId() == img.productId() ? old
                        : new Entry(old.imageId(), img.productId(), old.imageUrl(), old.vector()));
                changed |= old.productId() != img.productId();
                continue;
            }
            float[] v = embed.apply(img);
            if (v != null) {
                next.put(img.imageId(), new Entry(img.imageId(), img.productId(), img.imageUrl(), v));
                changed = true;
            }
        }
        entries = Map.copyOf(next);
        return changed;
    }

    /** Điểm của từng sản phẩm, cao xuống thấp. */
    public List<ProductScore> rank(float[] query) {
        Map<Integer, Double> best = new HashMap<>();
        for (Entry e : entries.values()) {
            double s = ImageEncoder.dot(query, e.vector());
            best.merge(e.productId(), s, Math::max);
        }
        List<ProductScore> out = new ArrayList<>(best.size());
        best.forEach((id, s) -> out.add(new ProductScore(id, s)));
        out.sort((a, b) -> Double.compare(b.score(), a.score()));
        return out;
    }

    Collection<Entry> entries() {
        return entries.values();
    }

    // ------------------------------------------------------------------ lưu / đọc file cache

    /** Lưu vector ra file (ghi file tạm rồi đổi tên để không hỏng file khi đang ghi). */
    public void save(Path file, String modelId) throws IOException {
        Files.createDirectories(file.getParent());
        Path tmp = Files.createTempFile(file.getParent(), "index-", ".part");
        try (OutputStream raw = Files.newOutputStream(tmp); DataOutputStream out = new DataOutputStream(raw)) {
            out.writeUTF(MAGIC);
            out.writeUTF(modelId);
            Collection<Entry> list = entries.values();
            out.writeInt(list.size());
            for (Entry e : list) {
                out.writeLong(e.imageId());
                out.writeInt(e.productId());
                out.writeUTF(e.imageUrl());
                out.writeInt(e.vector().length);
                for (float f : e.vector()) out.writeFloat(f);
            }
        }
        Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }

    /** Đọc file cache; bỏ qua nếu khác mô hình hoặc hỏng. */
    public boolean load(Path file, String modelId) {
        if (!Files.exists(file)) return false;
        try (InputStream raw = Files.newInputStream(file); DataInputStream in = new DataInputStream(raw)) {
            if (!MAGIC.equals(in.readUTF()) || !modelId.equals(in.readUTF())) return false;
            int n = in.readInt();
            Map<Long, Entry> map = new LinkedHashMap<>();
            for (int i = 0; i < n; i++) {
                long imageId = in.readLong();
                int productId = in.readInt();
                String url = in.readUTF();
                float[] v = new float[in.readInt()];
                for (int j = 0; j < v.length; j++) v[j] = in.readFloat();
                map.put(imageId, new Entry(imageId, productId, url, v));
            }
            entries = Map.copyOf(map);
            return true;
        } catch (IOException | RuntimeException e) {
            return false;
        }
    }
}
