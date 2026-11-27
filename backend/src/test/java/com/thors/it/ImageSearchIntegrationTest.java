package com.thors.it;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

import com.fasterxml.jackson.databind.JsonNode;
import com.sun.net.httpserver.HttpServer;
import com.thors.module.imagesearch.model.ImageEncoder;
import com.thors.module.imagesearch.model.ModelFiles;
import com.thors.module.imagesearch.service.ImageSearchEngine;
import com.thors.module.imagesearch.service.ImageSearchEngineAccess;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Integration test tab "Image Search" (IT-IMG-01..08): ImageSearchController ↔ ImageSearchService, ImageSearchEngine
 * ↔ ModelFiles, CatalogIndex, TypeClassifier, ColorClassifier ↔ DB.
 *
 * <p>Không tải mô hình thật và không chạy ONNX: "nguồn tải mô hình" và "Cloudinary" là một HTTP server cục bộ
 * (127.0.0.1, cổng ngẫu nhiên); mô hình SigLIP được thay bằng {@link FakeEncoder} gắn vào ImageSearchEngine của
 * context. Ảnh thử là ảnh một màu: kênh R = mã sản phẩm, G = màu (chỉ số trong bảng 14 màu), B = kiểu ảnh.
 * Vector giả = vector riêng của sản phẩm (vuông góc với mọi vector chữ của bộ đoán màu / đoán loại) + vector chữ của màu,
 * nên ColorClassifier / TypeClassifier thật vẫn chạy trên đó.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(locations = "classpath:it-notification-chat.properties",
        properties = {"thors.image-search.enabled=true", "thors.image-search.max-concurrent-searches=4"})
@Import(H2MysqlShim.class)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class ImageSearchIntegrationTest extends ItSupport {

    // ------------------------------------------------------------------ HTTP server cục bộ (nguồn mô hình + ảnh sản phẩm)

    static final HttpServer SERVER;
    static final Path CACHE_DIR;
    /** Request tải mô hình của backend bị giữ lại tới khi test mở (để quan sát trạng thái LOADING), rồi trả 404. */
    static final CountDownLatch RELEASE_MODEL = new CountDownLatch(1);
    static final Map<String, AtomicInteger> HITS = new ConcurrentHashMap<>();
    static final byte[] FAKE_MODEL = "fake onnx bytes for ModelFiles test".getBytes(StandardCharsets.UTF_8);

    static {
        try {
            CACHE_DIR = Files.createTempDirectory("thors-it-image-search");
            SERVER = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            SERVER.setExecutor(Executors.newCachedThreadPool(r -> {
                Thread t = new Thread(r, "it-fake-model-host");
                t.setDaemon(true);
                return t;
            }));
            SERVER.createContext("/", ex -> {
                String path = ex.getRequestURI().getPath();
                HITS.computeIfAbsent(path, k -> new AtomicInteger()).incrementAndGet();
                byte[] out;
                int status = 200;
                if (path.equals("/models/wrong-url.onnx")) {
                    try {
                        RELEASE_MODEL.await(120, TimeUnit.SECONDS);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    status = 404;
                    out = "not found".getBytes(StandardCharsets.UTF_8);
                } else if (path.startsWith("/models/")) {
                    out = FAKE_MODEL;
                } else if (path.startsWith("/img/")) {
                    String[] p = path.substring(5).replace(".png", "").split("-");
                    out = png(Integer.parseInt(p[0]), Integer.parseInt(p[1]), Integer.parseInt(p[2]));
                } else {
                    status = 404;
                    out = new byte[0];
                }
                ex.sendResponseHeaders(status, out.length == 0 ? -1 : out.length);
                if (out.length > 0) ex.getResponseBody().write(out);
                ex.close();
            });
            SERVER.start();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static String host() {
        return "http://127.0.0.1:" + SERVER.getAddress().getPort();
    }

    @DynamicPropertySource
    static void imageSearchProps(DynamicPropertyRegistry r) {
        // "modelUrl sai": máy chủ trả 404 (sau khi test cho phép), không bao giờ tải mô hình thật
        r.add("thors.image-search.model-url", () -> host() + "/models/wrong-url.onnx");
        r.add("thors.image-search.cache-dir", CACHE_DIR::toString);
    }

    @AfterAll
    static void stopServer() {
        RELEASE_MODEL.countDown();
    }

    // ------------------------------------------------------------------ Ảnh và vector giả

    /** Ảnh 64x64 một màu: R = mã sản phẩm, G = màu, B = kiểu ảnh. */
    static byte[] png(int product, int color, int mode) {
        BufferedImage img = new BufferedImage(64, 64, BufferedImage.TYPE_INT_RGB);
        int rgb = (product << 16) | (color << 8) | mode;
        for (int y = 0; y < 64; y++) for (int x = 0; x < 64; x++) img.setRGB(x, y, rgb);
        var out = new ByteArrayOutputStream();
        try {
            ImageIO.write(img, "png", out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    static final int NORMAL = 0, SLOW = 1, LOOKALIKE = 2, UNRELATED = 3;
    /** Chỉ số màu theo thứ tự trong color-text-embeddings.json. */
    static final int DEN = 0, TRANG = 1, XANH = 4, DO = 8;

    static final float[][] COLOR; // 14 vector chữ màu (nhóm CLOTHES)
    static final List<float[]> BASIS = new ArrayList<>(); // cơ sở trực chuẩn của mọi vector chữ (màu + loại)

    static {
        try {
            COLOR = readMatrix("/imagesearch/color-text-embeddings.json", "CLOTHES", 14);
            float[][] types = readMatrix("/imagesearch/type-text-embeddings.json", null, 25);
            for (float[] v : COLOR) addToBasis(v);
            for (float[] v : types) addToBasis(v);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static float[][] readMatrix(String resource, String group, int rows) throws IOException {
        try (InputStream in = ImageSearchIntegrationTest.class.getResourceAsStream(resource)) {
            JsonNode root = new com.fasterxml.jackson.databind.ObjectMapper().readTree(in);
            int dim = root.path("dimension").asInt();
            String b64 = group == null ? root.path("vectors").asText() : root.path("groups").path(group).path("vectors").asText();
            ByteBuffer buf = ByteBuffer.wrap(Base64.getDecoder().decode(b64)).order(ByteOrder.LITTLE_ENDIAN);
            float[][] m = new float[rows][dim];
            for (float[] row : m) for (int j = 0; j < dim; j++) row[j] = buf.getFloat();
            return m;
        }
    }

    static void addToBasis(float[] v) {
        double[] r = new double[v.length];
        for (int i = 0; i < v.length; i++) r[i] = v[i];
        for (float[] b : BASIS) {
            double d = 0;
            for (int i = 0; i < r.length; i++) d += r[i] * b[i];
            for (int i = 0; i < r.length; i++) r[i] -= d * b[i];
        }
        double n = 0;
        for (double x : r) n += x * x;
        n = Math.sqrt(n);
        if (n < 1e-6) return;
        float[] out = new float[r.length];
        for (int i = 0; i < r.length; i++) out[i] = (float) (r[i] / n);
        BASIS.add(out);
    }

    /** Vector đơn vị ngẫu nhiên (theo seed) vuông góc với mọi vector chữ màu / loại. */
    static float[] orthogonal(long seed) {
        Random rnd = new Random(seed);
        double[] r = new double[768];
        for (int i = 0; i < r.length; i++) r[i] = rnd.nextGaussian();
        for (float[] b : BASIS) {
            double d = 0;
            for (int i = 0; i < r.length; i++) d += r[i] * b[i];
            for (int i = 0; i < r.length; i++) r[i] -= d * b[i];
        }
        double n = 0;
        for (double x : r) n += x * x;
        n = Math.sqrt(n);
        float[] out = new float[r.length];
        for (int i = 0; i < r.length; i++) out[i] = (float) (r[i] / n);
        return out;
    }

    /** "Mô hình" giả: đọc mã sản phẩm / màu / kiểu ảnh từ điểm ảnh rồi dựng vector. */
    static final class FakeEncoder implements ImageEncoder {
        volatile CountDownLatch slowGate = new CountDownLatch(0);
        final AtomicInteger slowInside = new AtomicInteger();

        @Override
        public float[] encode(BufferedImage image) {
            int rgb = image.getRGB(0, 0);
            int product = (rgb >> 16) & 0xff, color = (rgb >> 8) & 0xff, mode = rgb & 0xff;
            if (mode == SLOW) {
                slowInside.incrementAndGet();
                try {
                    slowGate.await(30, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            float[] v = new float[768];
            if (mode == UNRELATED) return orthogonal(999_000L + product);
            float[] p = orthogonal(product);
            float[] q = mode == LOOKALIKE ? orthogonal(500_000L + product) : null;
            for (int i = 0; i < v.length; i++) v[i] = p[i] + COLOR[color][i] + (q == null ? 0 : q[i]);
            return ImageEncoder.normalize(v);
        }
    }

    // ------------------------------------------------------------------ Dữ liệu

    @Autowired ImageSearchEngine engine;
    final FakeEncoder encoder = new FakeEncoder();
    int rootAo;
    int rootGiay;
    int aoThun;
    int productA; // "Áo thun A": Trắng còn 5, Đen còn 3; ảnh màu trắng

    @BeforeEach
    void seed() {
        cleanAll();
        rootAo = category("Áo", null);
        aoThun = category("Áo thun", rootAo);
        rootGiay = category("Giày", null);
        productA = product(aoThun, "Áo thun A", null);
        variant(productA, "M", "Trắng", 150_000, 5);
        variant(productA, "M", "Đen", 150_000, 3);
        image(productA, imageUrl(productA, TRANG));
        // 6 sản phẩm Áo khác + 1 đôi giày
        int[] colors = {DEN, XANH, DO, DEN, XANH, DO};
        for (int i = 0; i < colors.length; i++) {
            int p = product(i % 2 == 0 ? aoThun : rootAo, "Áo mẫu " + (i + 2), null);
            variant(p, "L", "Đen", 120_000 + i * 10_000, 4);
            image(p, imageUrl(p, colors[i]));
        }
        int giay = product(rootGiay, "Giày sneaker", null);
        variant(giay, "42", "Trắng", 500_000, 2);
        image(giay, imageUrl(giay, TRANG));
    }

    static String imageUrl(int product, int color) {
        return host() + "/img/" + product + "-" + color + "-" + NORMAL + ".png";
    }

    /** Trạng thái READY: chờ lượt khởi tạo nền kết thúc (mô hình "sai URL" → ERROR), gắn encoder giả rồi refresh. */
    void ready() throws Exception {
        RELEASE_MODEL.countDown();
        await("lượt khởi tạo nền kết thúc", () -> engine.state() != ImageSearchEngine.State.LOADING);
        ImageSearchEngineAccess.useEncoder(engine, encoder);
        ImageSearchEngineAccess.refresh(engine);
        assertEquals(ImageSearchEngine.State.READY, engine.state());
    }

    MockHttpServletResponse search(byte[] bytes, String filename) throws Exception {
        var file = new MockMultipartFile("image", filename, "image/png", bytes);
        var r = mvc.perform(multipart("/api/shop/image-search").file(file).with(csrf())).andReturn().getResponse();
        r.setCharacterEncoding("UTF-8");
        return r;
    }

    MockHttpServletResponse search(int product, int color, int mode) throws Exception {
        return search(png(product, color, mode), "photo.png");
    }

    static void await(String what, BooleanSupplier condition) throws InterruptedException {
        long end = System.nanoTime() + Duration.ofSeconds(30).toNanos();
        while (System.nanoTime() < end) {
            if (condition.getAsBoolean()) return;
            Thread.sleep(100);
        }
        fail("Hết 30 giây vẫn chưa thấy: " + what);
    }

    static String sha256(byte[] b) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b));
    }

    static List<Integer> ids(JsonNode result) {
        List<Integer> out = new ArrayList<>();
        if (!result.path("product").isNull() && !result.path("product").isMissingNode())
            out.add(result.path("product").path("productId").asInt());
        for (JsonNode s : result.path("suggestions")) out.add(s.path("productId").asInt());
        return out;
    }

    int rootOf(int productId) {
        int c = db.queryForObject("SELECT category_id FROM product WHERE product_id = ?", Integer.class, productId);
        Integer parent = db.queryForObject("SELECT parent_id FROM category WHERE category_id = ?", Integer.class, c);
        return parent == null ? c : parent;
    }

    // ------------------------------------------------------------------ Khởi động và chỉ mục ảnh

    @Nested
    @TestPropertySource(properties = "thors.image-search.enabled=false")
    @DisplayName("Tắt tính năng")
    class Disabled {
        @Autowired MockMvc mvcOff;
        @Autowired ImageSearchEngine engineOff;

        @Test
        @DisplayName("IT-IMG-01: Tắt tính năng thì không hiện nút chụp ảnh và API từ chối")
        void disabledFeature() throws Exception {
            // Bước 2: trang Cửa hàng hỏi /status để biết có hiện nút chụp / chọn ảnh không
            var status = mvcOff.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                    .get("/api/shop/image-search/status")).andReturn().getResponse();
            assertEquals(200, status.getStatus());
            assertFalse(json.readTree(status.getContentAsString()).path("enabled").asBoolean(), "Không có nút chụp / chọn ảnh");
            // Bước 3
            var file = new MockMultipartFile("image", "a.png", "image/png", png(1, TRANG, NORMAL));
            var r = mvcOff.perform(multipart("/api/shop/image-search").file(file).with(csrf())).andReturn().getResponse();
            assertEquals(404, r.getStatus());
            // Không có việc tải mô hình
            assertEquals(ImageSearchEngine.State.DISABLED, engineOff.state());
            assertNull(engineOff.encoder());
            try (var files = Files.list(CACHE_DIR)) {
                assertTrue(files.noneMatch(f -> f.toString().endsWith(".onnx")), "Không có file mô hình trong cacheDir");
            }
        }
    }

    @Test
    @Order(1)
    @DisplayName("IT-IMG-02: Lần đầu khởi động tải mô hình, lần sau dùng cache")
    void firstStartDownloadsThenUsesCache() throws Exception {
        // Bước 2: trong lúc backend đang tải mô hình (request tải đang bị giữ ở máy chủ giả)
        await("backend bắt đầu tải mô hình", () -> HITS.containsKey("/models/wrong-url.onnx"));
        assertEquals(ImageSearchEngine.State.LOADING, engine.state());
        assertEquals(503, search(productA, TRANG, NORMAL).getStatus());

        // Bước 1, 3: ModelFiles (đúng hàm ImageSearchEngine dùng) với cacheDir rỗng: tải 1 lần, kiểm SHA-256, lần sau dùng cache
        Path dir = Files.createTempDirectory("thors-it-model-cache");
        String sha = sha256(FAKE_MODEL);
        ModelFiles.ensureModel(dir, host() + "/models/vision_model_fp16.onnx", sha);
        ModelFiles.ensureModel(dir, "u2net.onnx", host() + "/models/u2net.onnx", sha);
        assertTrue(Files.exists(dir.resolve("u2net.onnx")));
        assertEquals(sha, sha256(Files.readAllBytes(dir.resolve("u2net.onnx"))));
        int downloads = HITS.get("/models/vision_model_fp16.onnx").get() + HITS.get("/models/u2net.onnx").get();
        assertEquals(2, downloads);
        ModelFiles.ensureModel(dir, host() + "/models/vision_model_fp16.onnx", sha); // "khởi động lại"
        ModelFiles.ensureModel(dir, "u2net.onnx", host() + "/models/u2net.onnx", sha);
        assertEquals(downloads, HITS.get("/models/vision_model_fp16.onnx").get() + HITS.get("/models/u2net.onnx").get(),
                "Không tải lại mô hình");
        // Tên file theo sheet (để cuối cho các kiểm tra trên vẫn chạy)
        assertTrue(Files.exists(dir.resolve("vision_model_fp16.onnx")), "cacheDir có vision_model_fp16.onnx: " + listing(dir));
        assertEquals(sha, sha256(Files.readAllBytes(dir.resolve("vision_model_fp16.onnx"))));
    }

    static String listing(Path dir) throws IOException {
        try (var files = Files.list(dir)) {
            return files.map(f -> f.getFileName().toString()).toList().toString();
        }
    }

    @Test
    @Order(2)
    @DisplayName("IT-IMG-03: Không tải được mô hình thì chuyển trạng thái lỗi")
    void modelDownloadFailureGoesToError() throws Exception {
        RELEASE_MODEL.countDown(); // máy chủ trả 404 cho modelUrl sai
        await("trạng thái ERROR", () -> engine.state() == ImageSearchEngine.State.ERROR);
        JsonNode status = body(get("/api/shop/image-search/status", null));
        assertFalse(status.path("ready").asBoolean());
        assertTrue(status.path("message").asText().contains("HTTP 404"), "Có nội dung lỗi: " + status);
        assertEquals(503, search(productA, TRANG, NORMAL).getStatus());
        // Backend vẫn chạy các chức năng khác
        var customer = account("CUSTOMER", "Khách", "c@example.com", "ACTIVE");
        assertEquals(200, get("/api/notifications/unread-count", login(customer)).getStatus());
    }

    @Test
    @Order(3)
    @DisplayName("IT-IMG-04: Ảnh sản phẩm mới được thêm vào chỉ mục, sản phẩm ẩn bị gỡ")
    void newProductIndexedHiddenProductRemoved() throws Exception {
        ready();
        Path index = ImageSearchEngineAccess.indexFile(engine);
        assertTrue(Files.exists(index));
        Files.setLastModifiedTime(index, FileTime.fromMillis(0));

        // Bước 1
        int fresh = product(aoThun, "Áo thun mới về", null);
        variant(fresh, "M", "Đỏ", 180_000, 6);
        image(fresh, imageUrl(fresh, DO));
        db.update("UPDATE product SET status = 'INACTIVE' WHERE product_id = ?", productA);
        // Bước 2: lượt cập nhật định kỳ (thay cho chờ 2 phút 30 giây)
        ImageSearchEngineAccess.refresh(engine);
        assertTrue(Files.getLastModifiedTime(index).toMillis() > 0, "catalog-index.bin được ghi lại");
        assertTrue(new com.thors.module.imagesearch.service.CatalogIndex().load(index, ImageSearchEngineAccess.modelId(engine)));

        // Bước 3
        JsonNode r1 = body(search(fresh, DO, NORMAL));
        assertEquals(fresh, r1.path("product").path("productId").asInt(), "Ảnh sản phẩm mới trả về đúng sản phẩm đó ở hạng 1");
        JsonNode r2 = body(search(productA, TRANG, NORMAL));
        assertFalse(ids(r2).contains(productA), "Sản phẩm đã ẩn không còn trong kết quả và gợi ý: " + r2);
    }

    // ------------------------------------------------------------------ Khách tìm sản phẩm bằng hình ảnh

    @Test
    @Order(4)
    @DisplayName("IT-IMG-05: Chụp đúng sản phẩm của cửa hàng thì trả kết quả khớp, còn hàng")
    void exactProductAvailable() throws Exception {
        ready();
        var r = search(productA, TRANG, NORMAL);
        assertEquals(200, r.getStatus());
        JsonNode b = body(r);
        assertEquals("AVAILABLE", b.path("status").asText(), b.toString());
        assertEquals(productA, b.path("product").path("productId").asInt(), "Sản phẩm đó đứng đầu");
        assertTrue(b.path("suggestions").size() > 0, "Kèm gợi ý");
    }

    @Test
    @Order(5)
    @DisplayName("IT-IMG-06: Ảnh gần giống trả SIMILAR, ảnh không liên quan trả NOT_FOUND kèm gợi ý")
    void lookalikeAndUnrelated() throws Exception {
        ready();
        // Bước 1: áo cùng kiểu nhưng không phải sản phẩm của cửa hàng
        var r1 = search(productA, TRANG, LOOKALIKE);
        assertEquals(200, r1.getStatus());
        JsonNode b1 = body(r1);
        assertTrue(Set.of("SIMILAR", "NOT_FOUND").contains(b1.path("status").asText()), b1.toString());
        assertTrue(b1.path("suggestions").size() > 0);
        for (JsonNode s : b1.path("suggestions"))
            assertEquals(rootAo, rootOf(s.path("productId").asInt()), "Sản phẩm gợi ý cùng danh mục Áo: " + b1);

        // Bước 2: đồ vật khác loại (cốc nước)
        var r2 = search(1, 0, UNRELATED);
        assertEquals(200, r2.getStatus());
        JsonNode b2 = body(r2);
        assertEquals("NOT_FOUND", b2.path("status").asText());
        assertTrue(b2.path("suggestions").size() <= 5, "Tối đa 5 gợi ý, thực tế " + b2.path("suggestions").size());
    }

    @Test
    @Order(6)
    @DisplayName("IT-IMG-07: Khớp sản phẩm nhưng màu hết hàng hoặc không có màu đó")
    void colorOutOfStockOrUnavailable() throws Exception {
        ready();
        // Bước 1
        db.update("UPDATE product_detail SET stock_quantity = 0 WHERE product_id = ? AND color = 'Trắng'", productA);
        JsonNode b1 = body(search(productA, TRANG, NORMAL));
        assertEquals("OUT_OF_STOCK", b1.path("status").asText(), b1.toString());
        // Bước 2: ảnh sản phẩm A ở màu cửa hàng không bán (đỏ)
        JsonNode b2 = body(search(productA, DO, NORMAL));
        assertEquals("COLOR_UNAVAILABLE", b2.path("status").asText(), b2.toString());
    }

    @Test
    @Order(7)
    @DisplayName("IT-IMG-08: Ảnh không hợp lệ hoặc hệ thống bận bị từ chối")
    void invalidImagesAndBusy() throws Exception {
        ready();
        // Bước 1: file 9 MB
        assertEquals(400, search(new byte[9 * 1024 * 1024], "big.jpg").getStatus());
        // Bước 2: file văn bản đổi đuôi .jpg
        assertEquals(400, search("đây là file văn bản".getBytes(StandardCharsets.UTF_8), "note.jpg").getStatus());

        // Bước 3: nhiều request cùng lúc; 4 lượt (max-concurrent-searches) đang xử lý chậm
        encoder.slowGate = new CountDownLatch(1);
        encoder.slowInside.set(0);
        ExecutorService pool = Executors.newFixedThreadPool(6);
        try {
            List<Future<Integer>> busy = new ArrayList<>();
            for (int i = 0; i < 4; i++) busy.add(pool.submit(() -> search(productA, TRANG, SLOW).getStatus()));
            await("4 lượt đang xử lý", () -> encoder.slowInside.get() == 4);
            List<Future<Integer>> extra = new ArrayList<>();
            for (int i = 0; i < 2; i++) extra.add(pool.submit(() -> search(productA, TRANG, NORMAL).getStatus()));
            for (Future<Integer> f : extra) assertEquals(429, f.get(20, TimeUnit.SECONDS), "Chờ quá 3 giây nhận HTTP 429");
            encoder.slowGate.countDown();
            for (Future<Integer> f : busy) assertEquals(200, f.get(20, TimeUnit.SECONDS));
        } finally {
            encoder.slowGate.countDown();
            pool.shutdownNow();
        }
    }
}
