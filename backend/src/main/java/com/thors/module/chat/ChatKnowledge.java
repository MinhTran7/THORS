package com.thors.module.chat;

import com.thors.module.chat.ChatKnowledgeRepository.ProductDoc;
import com.thors.module.chat.ChatKnowledgeRepository.Stored;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Kho tri thức của trợ lý AI (phần "Retrieval" của RAG).
 *
 * <p>Mỗi sản phẩm đang bán, mỗi câu hỏi thường gặp và mỗi chính sách là một đoạn chữ. {@link #sync()} tạo vector
 * embedding cho từng đoạn (Gemini) và lưu vào bảng chat_knowledge; đoạn nào không đổi nội dung (cùng hash) thì không
 * gọi Gemini lại. {@link #search} biến câu hỏi của khách thành vector rồi lấy các đoạn gần nghĩa nhất theo cosine.
 * Vector được giữ trong bộ nhớ (cửa hàng chỉ có vài trăm sản phẩm nên so lần lượt là đủ nhanh).
 *
 * <p>Xem sơ đồ SD1, SD2 trong docs/CHAT_RAG.md.
 */
@Component
public class ChatKnowledge {
    private static final Logger log = LoggerFactory.getLogger(ChatKnowledge.class);

    public static final String PRODUCT = "PRODUCT";
    public static final String FAQ = "FAQ";
    public static final String POLICY = "POLICY";

    /**
     * Điểm cosine tối thiểu để coi một đoạn là liên quan. Thử với dữ liệu thật: điểm Gemini dồn trong khoảng hẹp
     * (đoạn đúng ~0.67–0.76, đoạn không liên quan vẫn ~0.61–0.67), nên dùng thêm {@link #MAX_GAP}.
     */
    static final double MIN_SCORE = 0.65;
    /** Chỉ giữ đoạn không thấp hơn điểm cao nhất quá bấy nhiêu. */
    static final double MAX_GAP = 0.05;
    /** Mô tả sản phẩm cắt còn bấy nhiêu ký tự trước khi tạo embedding. */
    static final int MAX_DESCRIPTION = 500;

    static final String RETURN_POLICY =
            "Chính sách đổi trả: khách được yêu cầu trả hàng trong 7 ngày kể từ lúc giao thành công, kèm lý do và"
                    + " ảnh/video; cửa hàng duyệt rồi mới trả hàng. Yêu cầu trên website tại Đơn hàng > Trả hàng.";

    /** Một đoạn kiến thức tìm được và điểm giống nhau (cosine). */
    public record Hit(String type, String key, String content, double score) {}

    /** Kết quả một lần đồng bộ; skipped != null khi không chạy được (và lý do). */
    public record SyncResult(int total, int embedded, int removed, String skipped) {}

    private record Doc(String type, String key, String content) {
        String id() {
            return type + ":" + key;
        }
    }

    private final ChatKnowledgeRepository repo;
    private final GeminiClient gemini;
    private final ChatAutoReply settings;
    /** Chỉ mục trong bộ nhớ; null = chưa nạp lần nào. */
    private volatile List<Stored> index;

    public ChatKnowledge(ChatKnowledgeRepository repo, GeminiClient gemini, ChatAutoReply settings) {
        this.repo = repo;
        this.gemini = gemini;
        this.settings = settings;
    }

    // ------------------------------------------------------------------ Đồng bộ (SD1)

    @Scheduled(fixedDelay = 30 * 60_000L, initialDelay = 60_000L)
    void scheduledSync() {
        try {
            SyncResult r = sync();
            if (r.skipped() == null && (r.embedded() > 0 || r.removed() > 0))
                log.info("Kho tri thức chat: {} đoạn, tạo embedding {} đoạn, xóa {} đoạn", r.total(), r.embedded(), r.removed());
        } catch (RuntimeException e) {
            log.warn("Không đồng bộ được kho tri thức chat: {}", e.getMessage());
        }
    }

    public SyncResult sync() {
        if (!gemini.configured()) return new SyncResult(0, 0, 0, "Chưa cấu hình Gemini API key");
        if (!repo.ready()) return new SyncResult(0, 0, 0, "Chưa chạy migration 2026-11-24_chat_rag.sql");

        String model = gemini.embeddingModel();
        List<Doc> docs = documents();
        Map<String, String> storedHash = new HashMap<>();
        for (Stored s : repo.loadAll()) storedHash.put(s.id(), s.hash());

        List<Doc> changed = new ArrayList<>();
        for (Doc d : docs)
            if (!hash(model, d.content()).equals(storedHash.get(d.id()))) changed.add(d);

        for (int from = 0; from < changed.size(); from += GeminiClient.EMBED_BATCH) {
            List<Doc> batch = changed.subList(from, Math.min(from + GeminiClient.EMBED_BATCH, changed.size()));
            List<float[]> vectors = gemini.embed(batch.stream().map(Doc::content).toList(), "RETRIEVAL_DOCUMENT");
            for (int i = 0; i < batch.size(); i++) {
                Doc d = batch.get(i);
                repo.upsert(d.type(), d.key(), d.content(), hash(model, d.content()), vectors.get(i), model);
            }
        }
        Set<String> keep = new LinkedHashSet<>();
        for (Doc d : docs) keep.add(d.id());
        int removed = repo.deleteExcept(keep);
        reload();
        return new SyncResult(docs.size(), changed.size(), removed, null);
    }

    /** Nạp lại chỉ mục trong bộ nhớ từ DB. */
    void reload() {
        index = List.copyOf(repo.loadAll());
    }

    /** Các đoạn kiến thức hiện tại: sản phẩm đang bán, FAQ có đáp án, chính sách. */
    private List<Doc> documents() {
        List<Doc> docs = new ArrayList<>();
        for (ProductDoc p : repo.productsForIndex()) docs.add(new Doc(PRODUCT, String.valueOf(p.id()), productText(p)));
        for (ChatAutoReply.Faq f : settings.faqs())
            if (f.answer() != null) docs.add(new Doc(FAQ, f.id(), "Hỏi: " + f.question() + "\nĐáp: " + f.answer()));
        for (String[] p : policies(settings.workingHoursText())) docs.add(new Doc(POLICY, p[0], p[1]));
        return docs;
    }

    /** Chính sách cố định của cửa hàng: {mã, nội dung}. */
    static List<String[]> policies(String workingHours) {
        return List.of(
                new String[] {"return", RETURN_POLICY},
                new String[] {"hours", "Giờ làm việc của nhân viên: " + workingHours + " (giờ Việt Nam)."});
    }

    static String productText(ProductDoc p) {
        String text = p.name() + ". Danh mục: " + p.category();
        String d = descriptionText(p.description());
        if (d.length() > MAX_DESCRIPTION) d = d.substring(0, MAX_DESCRIPTION) + "…";
        return d.isEmpty() ? text : text + ". " + d;
    }

    /** Điểm nổi bật của mô tả có cấu trúc (frontend productDescription.jsx, HIGHLIGHTS) -> nhãn tiếng Việt. */
    private static final Map<String, String> HIGHLIGHTS = Map.ofEntries(
            Map.entry("water", "Trượt nước"), Map.entry("warm", "Giữ ấm"), Map.entry("comfort", "Thoải mái"),
            Map.entry("breathable", "Thoáng khí"), Map.entry("quickdry", "Nhanh khô"), Map.entry("stretch", "Co giãn"),
            Map.entry("windproof", "Chống gió"), Map.entry("uv", "Chống UV"), Map.entry("durable", "Bền bỉ"),
            Map.entry("light", "Siêu nhẹ"), Map.entry("antibac", "Kháng khuẩn"), Map.entry("easywash", "Dễ giặt"));

    /** Các trường thông số được đưa vào chữ: {khóa JSON, nhãn}. Bảo quản / Đổi trả / ảnh theo màu thì bỏ. */
    private static final String[][] SPEC_FIELDS = {
        {"material", "Chất liệu"}, {"fit", "Kiểu dáng"}, {"suitable", "Phù hợp"}, {"features", "Tính năng"}
    };

    private static final com.fasterxml.jackson.databind.ObjectMapper JSON = new com.fasterxml.jackson.databind.ObjectMapper();

    /**
     * Mô tả sản phẩm trong DB -> chữ dễ đọc cho embedding và cho mô hình. Mô tả có cấu trúc là JSON {"v":1,...}
     * (cách đọc giống parseDescription ở frontend): lấy mô tả ngắn, điểm nổi bật, chất liệu, kiểu dáng, phù hợp,
     * tính năng. Mô tả cũ (chữ thường / HTML) thì bỏ thẻ HTML. Không phải JSON hợp lệ có "v" thì coi là chữ thường.
     */
    static String descriptionText(String raw) {
        if (raw == null) return "";
        String trimmed = raw.trim();
        if (trimmed.startsWith("{")) {
            try {
                com.fasterxml.jackson.databind.JsonNode d = JSON.readTree(trimmed);
                if (d != null && d.isObject() && d.hasNonNull("v") && !d.path("v").asText("").isEmpty()
                        && !"0".equals(d.path("v").asText()) && !"false".equals(d.path("v").asText())) {
                    List<String> parts = new ArrayList<>();
                    addPart(parts, d.path("intro").asText(""));
                    List<String> labels = new ArrayList<>();
                    for (com.fasterxml.jackson.databind.JsonNode h : d.path("highlights"))
                        if (HIGHLIGHTS.containsKey(h.asText())) labels.add(HIGHLIGHTS.get(h.asText()));
                    if (!labels.isEmpty()) parts.add("Nổi bật: " + String.join(", ", labels));
                    for (String[] f : SPEC_FIELDS) {
                        String value = d.path(f[0]).isTextual() ? d.path(f[0]).asText() : "";
                        if (!clean(value).isEmpty()) addPart(parts, f[1] + ": " + value);
                    }
                    return String.join(". ", parts);
                }
            } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
                // không phải JSON hợp lệ -> coi là chữ thường
            }
        }
        return clean(raw);
    }

    private static void addPart(List<String> parts, String text) {
        String t = clean(text).replaceAll("[.\\s]+$", "");
        if (!t.isEmpty()) parts.add(t);
    }

    /** Bỏ thẻ HTML, gộp khoảng trắng. */
    private static String clean(String text) {
        return text == null ? "" : text.replaceAll("<[^>]+>", " ").replaceAll("\\s+", " ").trim();
    }

    static String hash(String model, String content) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest((model + "\n" + content).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(h);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    // ------------------------------------------------------------------ Tìm theo nghĩa (SD2)

    /**
     * Tối đa k đoạn thuộc các loại types gần nghĩa nhất với query (điểm ≥ {@link #MIN_SCORE}), điểm giảm dần.
     * Trả [] khi query rỗng hoặc chỉ mục chưa có đoạn nào thuộc types (không gọi Gemini). Gemini lỗi thì ném
     * GeminiException để nơi gọi quay về cách tìm cũ.
     */
    public List<Hit> search(String query, Set<String> types, int k) {
        if (query == null || query.isBlank()) return List.of();
        List<Stored> all = index;
        if (all == null) {
            if (!repo.ready()) return List.of();
            reload();
            all = index;
        }
        List<Stored> candidates = all.stream().filter(s -> types.contains(s.type())).toList();
        if (candidates.isEmpty()) return List.of();

        float[] q = gemini.embed(List.of(query.trim()), "RETRIEVAL_QUERY").get(0);
        List<Hit> scored = candidates.stream()
                .map(s -> new Hit(s.type(), s.key(), s.content(), cosine(q, s.vector())))
                .sorted(Comparator.comparingDouble(Hit::score).reversed())
                .toList();
        double best = scored.get(0).score();
        return scored.stream()
                .filter(h -> h.score() >= MIN_SCORE && h.score() >= best - MAX_GAP)
                .limit(k)
                .toList();
    }

    /** Độ giống nhau cosine; 0 khi khác số chiều hoặc có vector 0. */
    static double cosine(float[] a, float[] b) {
        if (a == null || b == null || a.length != b.length) return 0;
        double dot = 0, na = 0, nb = 0;
        for (int i = 0; i < a.length; i++) {
            dot += a[i] * (double) b[i];
            na += a[i] * (double) a[i];
            nb += b[i] * (double) b[i];
        }
        if (na == 0 || nb == 0) return 0;
        return dot / (Math.sqrt(na) * Math.sqrt(nb));
    }

    // ------------------------------------------------------------------ Lưu vector (float32 little-endian)

    static byte[] toBytes(float[] v) {
        ByteBuffer buf = ByteBuffer.allocate(v.length * 4).order(ByteOrder.LITTLE_ENDIAN);
        for (float f : v) buf.putFloat(f);
        return buf.array();
    }

    static float[] fromBytes(byte[] b) {
        if (b == null || b.length % 4 != 0)
            throw new IllegalArgumentException("Dữ liệu vector không hợp lệ (" + (b == null ? 0 : b.length) + " byte).");
        ByteBuffer buf = ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN);
        float[] v = new float[b.length / 4];
        for (int i = 0; i < v.length; i++) v[i] = buf.getFloat();
        return v;
    }
}
