package com.thors.module.imagesearch.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.sun.net.httpserver.HttpServer;
import com.thors.common.ApiException;
import com.thors.module.imagesearch.color.ColorClassifier;
import com.thors.module.imagesearch.color.ColorNames;
import com.thors.module.imagesearch.color.ProductGroup;
import com.thors.module.imagesearch.color.TypeClassifier;
import com.thors.module.imagesearch.config.ImageSearchProperties;
import com.thors.module.imagesearch.model.ImageDecoder;
import com.thors.module.imagesearch.model.ImageEncoder;
import com.thors.module.imagesearch.model.ImageEncoder.Vectors;
import com.thors.module.imagesearch.model.OnnxImageEncoder;
import com.thors.module.imagesearch.repository.ImageSearchRepository;
import com.thors.module.imagesearch.repository.ImageSearchRepository.CatalogImage;
import com.thors.module.imagesearch.repository.ImageSearchRepository.ProductRoot;
import com.thors.module.imagesearch.service.CatalogIndex.Entry;
import com.thors.module.imagesearch.service.CatalogIndex.ProductScore;
import com.thors.module.shop.repository.ShopRepository;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Function;
import java.util.stream.Stream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedStatic;
import org.mockito.MockMakers;

/**
 * Unit test cho chức năng "Tìm sản phẩm bằng ảnh", viết theo sheet "Image Search" của Report-5.1_Unit Test
 * (UTC-IMG-001..031). Mỗi test mang đúng mã Test Case ID trong sheet. Không tải mô hình thật: file mô hình là
 * file giả trong thư mục tạm, máy chủ tải ảnh / mô hình là HttpServer cục bộ, OnnxImageEncoder và
 * BackgroundRemover được thay bằng mock khi khởi tạo.
 */
@DisplayName("Tìm sản phẩm bằng ảnh - Unit Test")
class ImageSearchUnitTest {
    private static final int MB = 1024 * 1024;

    // ------------------------------------------------------------------ helpers

    /** Ảnh JPEG hợp lệ đúng size byte (ảnh nhiễu 64x64, phần thừa sau EOI được bộ đọc JPEG bỏ qua). */
    static byte[] jpeg(int size) throws Exception {
        BufferedImage img = new BufferedImage(64, 64, BufferedImage.TYPE_INT_RGB);
        Random r = new Random(1);
        for (int y = 0; y < 64; y++)
            for (int x = 0; x < 64; x++) img.setRGB(x, y, r.nextInt(0xFFFFFF));
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "jpg", out);
        byte[] raw = out.toByteArray();
        assertTrue(raw.length <= size);
        return Arrays.copyOf(raw, size);
    }

    /** Dự án dùng mock-maker-subclass; class final / static / constructor cần mock-maker-inline cho riêng mock đó. */
    static <T> T inline(Class<T> type) {
        return mock(type, withSettings().mockMaker(MockMakers.INLINE));
    }

    static ImageSearchProperties props() {
        ImageSearchProperties p = new ImageSearchProperties();
        p.setEnabled(true);
        return p;
    }

    static Object field(Object target, String name) throws Exception {
        Field f = ImageSearchEngine.class.getDeclaredField(name);
        f.setAccessible(true);
        return f.get(target);
    }

    static void setField(Class<?> type, Object target, String name, Object value) throws Exception {
        Field f = type.getDeclaredField(name);
        f.setAccessible(true);
        f.set(target, value);
    }

    static Object call(ImageSearchEngine engine, String method) throws Exception {
        Method m = ImageSearchEngine.class.getDeclaredMethod(method);
        m.setAccessible(true);
        return m.invoke(engine);
    }

    static String sha256(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    static Vectors vec(float... original) {
        return new Vectors(original, original);
    }

    /** Máy chủ HTTP cục bộ thay cho Cloudinary / nơi tải mô hình; đếm số lần mỗi đường dẫn được gọi. */
    static final class FakeServer implements AutoCloseable {
        final HttpServer server;
        final Map<String, AtomicInteger> hits = new ConcurrentHashMap<>();

        FakeServer() throws Exception {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.start();
        }

        FakeServer serve(String path, int status, byte[] body) {
            hits.put(path, new AtomicInteger());
            server.createContext(path, ex -> {
                hits.get(path).incrementAndGet();
                ex.getRequestBody().readAllBytes();
                ex.sendResponseHeaders(status, body.length == 0 ? -1 : body.length);
                if (body.length > 0) {
                    try (OutputStream o = ex.getResponseBody()) {
                        o.write(body);
                    }
                }
                ex.close();
            });
            return this;
        }

        String url(String path) {
            return "http://127.0.0.1:" + server.getAddress().getPort() + path;
        }

        int hits(String path) {
            return hits.get(path).get();
        }

        @Override
        public void close() {
            server.stop(0);
        }
    }

    /** Ghi file ONNX (protobuf ModelProto) tối giản bằng tay, để test khởi tạo không cần mô hình thật. */
    static final class TinyOnnx {
        private TinyOnnx() {}

        static byte[] reduceMean(String input, String output) {
            byte[] axes = cat(str(1, "axes"), ints(8, 2), ints(8, 3), varint(20, 7));
            byte[] keepdims = cat(str(1, "keepdims"), varint(3, 0), varint(20, 2));
            byte[] node = cat(str(1, input), str(2, output), str(4, "ReduceMean"), msg(5, axes), msg(5, keepdims));
            return model(node, valueInfo(input, -1, 3, -1, -1), valueInfo(output, -1, 3));
        }

        static byte[] identity(String input, String output) {
            byte[] node = cat(str(1, input), str(2, output), str(4, "Identity"));
            return model(node, valueInfo(input, -1, 3, -1, -1), valueInfo(output, -1, 3, -1, -1));
        }

        private static byte[] model(byte[] node, byte[] in, byte[] out) {
            byte[] graph = cat(msg(1, node), str(2, "g"), msg(11, in), msg(12, out));
            return cat(varint(1, 7), msg(7, graph), msg(8, varint(2, 13)));
        }

        /** dim < 0 = kích thước động. */
        private static byte[] valueInfo(String name, int... dims) {
            byte[] shape = new byte[0];
            for (int i = 0; i < dims.length; i++) {
                shape = cat(shape, msg(1, dims[i] < 0 ? str(2, "d" + i) : varint(1, dims[i])));
            }
            byte[] tensor = cat(varint(1, 1), msg(2, shape));
            return cat(str(1, name), msg(2, msg(1, tensor)));
        }

        private static byte[] ints(int field, long v) {
            return varint(field, v);
        }

        private static byte[] varint(int field, long v) {
            return cat(raw((long) field << 3), raw(v));
        }

        private static byte[] str(int field, String s) {
            return msg(field, s.getBytes(StandardCharsets.UTF_8));
        }

        private static byte[] msg(int field, byte[] body) {
            return cat(raw(((long) field << 3) | 2), raw(body.length), body);
        }

        private static byte[] raw(long v) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            while ((v & ~0x7FL) != 0) {
                out.write((int) ((v & 0x7F) | 0x80));
                v >>>= 7;
            }
            out.write((int) v);
            return out.toByteArray();
        }

        private static byte[] cat(byte[]... parts) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            for (byte[] p : parts) out.writeBytes(p);
            return out.toByteArray();
        }
    }

    // ================================================================== ImageSearchService.search

    @Nested
    @DisplayName("ImageSearchService.search(byte[] image)")
    class SearchTests {
        ImageSearchProperties props;
        ImageSearchEngine engine;
        ImageEncoder encoder;
        CatalogIndex index;
        ImageSearchRepository repo;
        ShopRepository shop;
        ColorClassifier colors;
        ImageSearchService service;

        @BeforeEach
        void setUp() {
            props = props();
            engine = mock(ImageSearchEngine.class);
            encoder = mock(ImageEncoder.class);
            index = inline(CatalogIndex.class);
            repo = mock(ImageSearchRepository.class);
            shop = mock(ShopRepository.class);
            colors = inline(ColorClassifier.class);
            when(engine.encoder()).thenReturn(encoder);
            when(engine.index()).thenReturn(index);
            service = new ImageSearchService(engine, props, repo, shop, colors);
        }

        @Test
        @DisplayName("UTC-IMG-001: Tính năng đang tắt: 404, không decode ảnh, không gọi encoder")
        void img001() throws Exception {
            when(engine.state()).thenReturn(ImageSearchEngine.State.DISABLED);
            byte[] image = jpeg(200 * 1024);
            try (MockedStatic<ImageDecoder> decoder = mockStatic(ImageDecoder.class, withSettings().mockMaker(MockMakers.INLINE))) {
                ApiException e = assertThrows(ApiException.class, () -> service.search(image));
                assertEquals(404, e.status);
                decoder.verify(() -> ImageDecoder.decode(any()), never());
            }
            verifyNoInteractions(encoder);
        }

        @Test
        @DisplayName("UTC-IMG-002: Mô hình đang tải: 503, không gọi encoder")
        void img002() throws Exception {
            when(engine.state()).thenReturn(ImageSearchEngine.State.LOADING);

            ApiException e = assertThrows(ApiException.class, () -> service.search(jpeg(200 * 1024)));
            assertEquals(503, e.status);
            verifyNoInteractions(encoder);
        }

        @Test
        @DisplayName("UTC-IMG-003: Ảnh 8 MB + 1 byte: 400, không gọi encoder")
        void img003() throws Exception {
            when(engine.state()).thenReturn(ImageSearchEngine.State.READY);

            ApiException e = assertThrows(ApiException.class, () -> service.search(jpeg(8 * MB + 1)));
            assertEquals(400, e.status);
            verifyNoInteractions(encoder);
        }

        @Test
        @DisplayName("UTC-IMG-004: Ảnh đúng 8 MB vẫn được xử lý")
        void img004() throws Exception {
            when(engine.state()).thenReturn(ImageSearchEngine.State.READY);
            when(encoder.encodeBoth(any())).thenReturn(vec(1, 0));

            assertDoesNotThrow(() -> service.search(jpeg(8 * MB)));
            verify(encoder).encodeBoth(any());
        }

        @Test
        @DisplayName("UTC-IMG-005: File văn bản không đọc được: 400, không gọi encoder")
        void img005() {
            when(engine.state()).thenReturn(ImageSearchEngine.State.READY);
            byte[] text = "day khong phai anh. ".repeat(52).substring(0, 1024).getBytes(StandardCharsets.UTF_8);

            ApiException e = assertThrows(ApiException.class, () -> service.search(text));
            assertEquals(400, e.status);
            verifyNoInteractions(encoder);
        }

        @Test
        @DisplayName("UTC-IMG-006: Hệ thống bận (không lấy được slot sau 3 giây): 429, không gọi encoder")
        void img006() throws Exception {
            when(engine.state()).thenReturn(ImageSearchEngine.State.READY);
            Semaphore slots = mock(Semaphore.class);
            when(slots.tryAcquire(3, TimeUnit.SECONDS)).thenReturn(false);
            setField(ImageSearchService.class, service, "slots", slots);

            ApiException e = assertThrows(ApiException.class, () -> service.search(jpeg(200 * 1024)));
            assertEquals(429, e.status);
            verify(slots).tryAcquire(3, TimeUnit.SECONDS);
            verifyNoInteractions(encoder);
        }

        @Test
        @DisplayName("UTC-IMG-007: Ảnh sản phẩm 17: AVAILABLE, sản phẩm 17 đứng đầu, trả slot sau khi xong")
        void img007() throws Exception {
            when(engine.state()).thenReturn(ImageSearchEngine.State.READY);
            Vectors v = new Vectors(new float[] {1, 0}, new float[] {0, 1});
            when(encoder.encodeBoth(any())).thenReturn(v);
            when(index.rank(v)).thenReturn(List.of(new ProductScore(17, 0.90)));
            when(repo.findVisibleProductRoots()).thenReturn(List.of(new ProductRoot(17, 1, "Áo")));
            when(repo.findProductCards(anyCollection())).thenReturn(List.of(Map.of("productId", 17,
                    "productName", "Áo thun trắng", "categoryName", "Áo thun", "imageUrl", "https://img/17.jpg",
                    "minPrice", new BigDecimal("150000"), "maxPrice", new BigDecimal("150000"))));
            when(shop.findVariants(17)).thenReturn(List.of(Map.of("color", "Trắng", "stock", 3)));
            when(colors.guess(any(), any()))
                    .thenReturn(new ColorClassifier.Guess("trang", "Trắng", ColorNames.familyOf("Trắng"), 0.9));
            Field f = ImageSearchService.class.getDeclaredField("slots");
            f.setAccessible(true);
            Semaphore slots = (Semaphore) f.get(service);
            int permits = slots.availablePermits();

            ImageSearchResult r = service.search(jpeg(200 * 1024));

            verify(encoder).encodeBoth(any());
            assertEquals(permits, slots.availablePermits(), "slot được trả lại");
            assertEquals("AVAILABLE", r.status());
            assertEquals(17, r.product().productId());
        }
    }

    // ================================================================== answer / rank

    @Nested
    @DisplayName("ImageSearchEngine.answer(Vectors v) / CatalogIndex.rank(Vectors v)")
    class AnswerTests {
        ImageSearchProperties props;
        ImageSearchEngine engine;
        CatalogIndex index;
        ImageSearchRepository repo;
        ShopRepository shop;
        ColorClassifier colors;
        ImageSearchService service;
        final Vectors v = new Vectors(new float[] {1, 0}, new float[] {1, 0});
        final Map<Integer, String> categoryOf = new ConcurrentHashMap<>();

        @BeforeEach
        void setUp() {
            props = props();
            engine = mock(ImageSearchEngine.class);
            index = inline(CatalogIndex.class);
            repo = mock(ImageSearchRepository.class);
            shop = mock(ShopRepository.class);
            colors = inline(ColorClassifier.class);
            when(engine.state()).thenReturn(ImageSearchEngine.State.READY);
            when(engine.index()).thenReturn(index);
            when(repo.findProductCards(anyCollection())).thenAnswer(inv -> {
                List<Map<String, Object>> rows = new ArrayList<>();
                for (Integer id : inv.<Collection<Integer>>getArgument(0)) {
                    rows.add(Map.of("productId", id, "productName", "Sản phẩm " + id,
                            "categoryName", categoryOf.getOrDefault(id, "Áo thun"), "imageUrl", "https://img/" + id + ".jpg",
                            "minPrice", new BigDecimal("150000"), "maxPrice", new BigDecimal("150000")));
                }
                return rows;
            });
            service = new ImageSearchService(engine, props, repo, shop, colors);
        }

        /** Sản phẩm (id, điểm, danh mục gốc) theo thứ tự hạng. */
        void ranked(Object... idScoreRoot) {
            List<ProductScore> scores = new ArrayList<>();
            List<ProductRoot> roots = new ArrayList<>();
            for (int i = 0; i < idScoreRoot.length; i += 3) {
                int id = (Integer) idScoreRoot[i];
                String root = (String) idScoreRoot[i + 2];
                scores.add(new ProductScore(id, (Double) idScoreRoot[i + 1]));
                roots.add(new ProductRoot(id, root.hashCode(), root));
            }
            when(index.rank(v)).thenReturn(scores);
            when(repo.findVisibleProductRoots()).thenReturn(roots);
        }

        ColorClassifier.Guess guess(String name) {
            return new ColorClassifier.Guess(ProductGroup.fold(name), name, ColorNames.familyOf(name), 0.9);
        }

        @Test
        @DisplayName("UTC-IMG-008: rank lấy điểm cao nhất mỗi sản phẩm, trung bình gốc / xóa nền, xếp giảm dần")
        void img008() {
            CatalogIndex real = new CatalogIndex();
            real.sync(List.of(new CatalogImage(1, 17, "a"), new CatalogImage(2, 17, "b"), new CatalogImage(3, 20, "c")),
                    img -> switch ((int) img.imageId()) {
                        case 1 -> new Vectors(new float[] {1, 0}, new float[] {0.6f, 0.8f});
                        case 2 -> new Vectors(new float[] {0.8f, 0.6f}, new float[] {1, 0});
                        default -> new Vectors(new float[] {0.6f, 0.8f}, new float[] {0.8f, 0.6f});
                    });

            List<ProductScore> r = real.rank(v);

            assertEquals(List.of(17, 20), r.stream().map(ProductScore::productId).toList());
            // 17: gốc max(1, 0.8) = 1, xóa nền max(0.6, 1) = 1 -> 1.0 ; 20: (0.6 + 0.8) / 2 = 0.7
            assertEquals(1.0, r.get(0).score(), 1e-6);
            assertEquals(0.7, r.get(1).score(), 1e-6);
        }

        @Test
        @DisplayName("UTC-IMG-009: Điểm đúng 0,85: nhánh tự tin, đoán màu, AVAILABLE")
        void img009() {
            ranked(17, 0.85, "Áo");
            when(shop.findVariants(17)).thenReturn(List.of(Map.of("color", "Trắng", "stock", 3)));
            when(colors.guess(any(), any())).thenReturn(guess("Trắng"));

            ImageSearchResult r;
            try (MockedStatic<ProductGroup> groups = mockStatic(ProductGroup.class, withSettings().mockMaker(MockMakers.INLINE).defaultAnswer(CALLS_REAL_METHODS))) {
                r = service.answer(v);
                groups.verify(() -> ProductGroup.of(anyString(), anyString()));
            }
            verify(colors).guess(any(), any());
            assertEquals("AVAILABLE", r.status());
        }

        @Test
        @DisplayName("UTC-IMG-010: Điểm 0,849: SIMILAR, không đoán màu")
        void img010() {
            ranked(17, 0.849, "Áo");
            when(shop.findVariants(17)).thenReturn(List.of(Map.of("color", "Trắng", "stock", 3)));

            ImageSearchResult r = service.answer(v);

            assertEquals("SIMILAR", r.status());
            verify(colors, never()).guess(any(), any());
        }

        @Test
        @DisplayName("UTC-IMG-011: Điểm đúng 0,808: SIMILAR, lấy biến thể sản phẩm hạng 1")
        void img011() {
            ranked(17, 0.808, "Áo");
            when(shop.findVariants(17)).thenReturn(List.of(Map.of("color", "Trắng", "stock", 3)));

            ImageSearchResult r = service.answer(v);

            assertEquals("SIMILAR", r.status());
            verify(shop).findVariants(17);
        }

        @Test
        @DisplayName("UTC-IMG-012: Điểm 0,807: đoán loại 'Áo', NOT_FOUND kèm 3 gợi ý cùng danh mục Áo")
        void img012() {
            ranked(40, 0.807, "Dép", 30, 0.80, "Áo", 31, 0.79, "Áo", 32, 0.78, "Áo");
            AtomicInteger typeCalls = new AtomicInteger();
            Function<float[], TypeClassifier.Guess> types = vector -> {
                typeCalls.incrementAndGet();
                return new TypeClassifier.Guess("Áo", 0.9);
            };
            ImageSearchService typed = new ImageSearchService(engine, props, repo, shop, colors, types);

            ImageSearchResult r = typed.answer(v);

            assertTrue(typeCalls.get() > 0, "TypeClassifier.guess được gọi");
            assertEquals("NOT_FOUND", r.status());
            assertEquals("Áo", r.suggestionCategory());
            assertEquals(List.of(30, 31, 32), r.suggestions().stream().map(ImageSearchResult.Product::productId).toList());
            verify(shop, never()).findVariants(anyInt());
        }

        @Test
        @DisplayName("UTC-IMG-013: Không khớp, 9 sản phẩm cùng danh mục: tối đa 5 gợi ý điểm cao nhất")
        void img013() {
            Object[] nine = new Object[27];
            for (int i = 0; i < 9; i++) {
                nine[i * 3] = 60 + i;
                nine[i * 3 + 1] = 0.70 - i * 0.01;
                nine[i * 3 + 2] = "Áo";
            }
            ranked(nine);

            ImageSearchResult r = service.answer(v);

            assertEquals("NOT_FOUND", r.status());
            assertTrue(r.suggestions().size() <= 5, "số gợi ý = " + r.suggestions().size());
            assertEquals(List.of(60, 61, 62, 63, 64),
                    r.suggestions().stream().map(ImageSearchResult.Product::productId).toList());
        }

        @Test
        @DisplayName("UTC-IMG-014: Khớp tự tin, màu Trắng hết hàng: OUT_OF_STOCK")
        void img014() {
            ranked(17, 0.90, "Áo");
            when(shop.findVariants(17)).thenReturn(List.of(Map.of("color", "Trắng", "stock", 0)));
            when(colors.guess(any(), any())).thenReturn(guess("Trắng"));

            assertEquals("OUT_OF_STOCK", service.answer(v).status());
        }

        @Test
        @DisplayName("UTC-IMG-015: Khớp tự tin, màu Đỏ không có (chỉ Trắng, Đen): COLOR_UNAVAILABLE")
        void img015() {
            ranked(17, 0.90, "Áo");
            when(shop.findVariants(17)).thenReturn(List.of(Map.of("color", "Trắng", "stock", 2),
                    Map.of("color", "Đen", "stock", 4)));
            when(colors.guess(any(), any())).thenReturn(guess("Đỏ"));

            assertEquals("COLOR_UNAVAILABLE", service.answer(v).status());
        }

        @Test
        @DisplayName("UTC-IMG-016: Chỉ mục rỗng: rank trả [], NOT_FOUND, không lỗi")
        void img016() {
            CatalogIndex empty = new CatalogIndex();
            when(engine.index()).thenReturn(empty);
            when(repo.findVisibleProductRoots()).thenReturn(List.of());

            assertEquals(List.of(), empty.rank(v));
            ImageSearchResult r = assertDoesNotThrow(() -> service.answer(v));
            assertEquals("NOT_FOUND", r.status());
        }
    }

    // ================================================================== scheduledRefresh / refresh

    @Nested
    @DisplayName("ImageSearchEngine.scheduledRefresh() / refresh()")
    class RefreshTests {
        ImageSearchProperties props;
        ImageSearchRepository repo;

        @BeforeEach
        void setUp(@TempDir Path dir) {
            props = props();
            props.setCacheDir(dir.toString());
            repo = mock(ImageSearchRepository.class);
        }

        @Test
        @DisplayName("UTC-IMG-017: Encoder chưa sẵn sàng (LOADING): không refresh")
        void img017() {
            ImageSearchEngine engine = spy(new ImageSearchEngine(props, repo));
            assertEquals(ImageSearchEngine.State.LOADING, engine.state());

            engine.scheduledRefresh();

            verify(engine, never()).refresh();
            verify(repo, never()).findCatalogImages();
        }

        @Test
        @DisplayName("UTC-IMG-018: Mới refresh 1 phút 59 giây trước (chu kỳ 2 phút): chưa refresh")
        void img018() throws Exception {
            props.setRefreshMinutes(2);
            ImageSearchEngine engine = spy(new ImageSearchEngine(props, repo, mock(ImageEncoder.class)));
            engine.markReady();
            setField(ImageSearchEngine.class, engine, "lastRefreshMillis",
                    System.currentTimeMillis() - (2 * 60_000L - 1_000L));

            engine.scheduledRefresh();

            verify(engine, never()).refresh();
            verify(repo, never()).findCatalogImages();
        }

        @Test
        @DisplayName("UTC-IMG-019: refreshLock đang bị giữ: thoát, không gọi findCatalogImages")
        void img019() throws Exception {
            ImageSearchEngine engine = new ImageSearchEngine(props, repo, mock(ImageEncoder.class));
            engine.markReady();
            setField(ImageSearchEngine.class, engine, "lastRefreshMillis", System.currentTimeMillis() - 2 * 60_000L);
            ReentrantLock lock = (ReentrantLock) field(engine, "refreshLock");
            CountDownLatch locked = new CountDownLatch(1);
            CountDownLatch done = new CountDownLatch(1);
            Thread other = new Thread(() -> {
                lock.lock();
                locked.countDown();
                try {
                    done.await(10, TimeUnit.SECONDS);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                } finally {
                    lock.unlock();
                }
            });
            other.start();
            assertTrue(locked.await(5, TimeUnit.SECONDS));
            try {
                engine.refresh();
            } finally {
                done.countDown();
                other.join(5_000);
            }
            verify(repo, never()).findCatalogImages();
        }
    }

    // ================================================================== CatalogIndex.sync

    @Nested
    @DisplayName("CatalogIndex.sync(List<CatalogImage> images, Function embed)")
    class SyncTests {
        @TempDir
        Path dir;
        ImageSearchProperties props;
        ImageSearchRepository repo;
        ImageEncoder encoder;
        ImageSearchEngine engine;
        FakeServer cloudinary;

        @BeforeEach
        void setUp() throws Exception {
            props = props();
            props.setCacheDir(dir.toString());
            repo = mock(ImageSearchRepository.class);
            encoder = mock(ImageEncoder.class);
            when(encoder.encodeBoth(any())).thenReturn(vec(0, 1));
            engine = new ImageSearchEngine(props, repo, encoder);
            engine.markReady();
            cloudinary = new FakeServer()
                    .serve("/p17-31.jpg", 200, jpeg(20 * 1024))
                    .serve("/p17-35.jpg", 200, jpeg(20 * 1024))
                    .serve("/p20-40.jpg", 200, jpeg(20 * 1024))
                    .serve("/p21-41.jpg", 404, new byte[0])
                    .serve("/p22-42.jpg", 200, new byte[15 * MB + 1]);
        }

        @AfterEach
        void tearDown() {
            cloudinary.close();
        }

        Path indexFile() {
            return dir.resolve("catalog-index.bin");
        }

        CatalogImage img(long id, int product, String path) {
            return new CatalogImage(id, product, cloudinary.url(path));
        }

        @Test
        @DisplayName("UTC-IMG-020: Ảnh 31 không đổi: giữ Entry cũ, không tải lại, changed = false, không ghi file")
        void img020() {
            CatalogImage old = img(31, 17, "/p17-31.jpg");
            engine.index().sync(List.of(old), i -> vec(1, 0));
            Entry before = engine.index().entries().iterator().next();
            AtomicInteger embeds = new AtomicInteger();

            boolean changed = engine.index().sync(List.of(old), i -> {
                embeds.incrementAndGet();
                return vec(0, 1);
            });
            when(repo.findCatalogImages()).thenReturn(List.of(old));
            engine.refresh();

            assertFalse(changed);
            assertEquals(0, embeds.get());
            assertSame(before, engine.index().entries().iterator().next());
            assertEquals(0, cloudinary.hits("/p17-31.jpg"), "không tải lại ảnh");
            verifyNoInteractions(encoder);
            assertFalse(Files.exists(indexFile()), "không ghi catalog-index.bin");
        }

        @Test
        @DisplayName("UTC-IMG-021: Ảnh 31 đổi sản phẩm 17 -> 18, URL giữ nguyên: giữ vector, không embed")
        void img021() {
            CatalogIndex index = new CatalogIndex();
            index.sync(List.of(new CatalogImage(31, 17, "old.jpg")), i -> vec(1, 0));
            float[] vector = index.entries().iterator().next().vector();
            AtomicInteger embeds = new AtomicInteger();

            index.sync(List.of(new CatalogImage(31, 18, "old.jpg")), i -> {
                embeds.incrementAndGet();
                return vec(0, 1);
            });

            Entry e = index.entries().iterator().next();
            assertEquals(18, e.productId());
            assertSame(vector, e.vector());
            assertEquals(0, embeds.get());
        }

        @Test
        @DisplayName("UTC-IMG-022: Ảnh mới 40 (HTTP 200): tải, decode, encodeBoth, thêm Entry, ghi file chỉ mục")
        void img022() throws Exception {
            CatalogImage old = img(31, 17, "/p17-31.jpg");
            CatalogImage added = img(40, 20, "/p20-40.jpg");
            engine.index().sync(List.of(old), i -> vec(1, 0));
            when(repo.findCatalogImages()).thenReturn(List.of(old, added));

            engine.refresh();

            assertEquals(1, cloudinary.hits("/p20-40.jpg"));
            assertEquals(0, cloudinary.hits("/p17-31.jpg"));
            verify(encoder, times(1)).encodeBoth(any());
            Entry e = engine.index().entries().stream().filter(x -> x.imageId() == 40).findFirst().orElseThrow();
            assertEquals(20, e.productId());
            assertEquals(added.imageUrl(), e.imageUrl());
            assertArrayEquals(new float[] {0, 1}, e.vector());
            assertArrayEquals(new float[] {0, 1}, e.cutout());
            assertTrue(Files.exists(indexFile()), "changed = true -> ghi catalog-index.bin");
            try (Stream<Path> files = Files.list(dir)) {
                assertTrue(files.noneMatch(p -> p.getFileName().toString().endsWith(".part")), "không còn file tạm");
            }
        }

        @Test
        @DisplayName("UTC-IMG-023: Ảnh 35 bị xóa khỏi DB: chỉ còn ảnh 31, ghi lại file chỉ mục")
        void img023() {
            CatalogImage a = img(31, 17, "/p17-31.jpg");
            engine.index().sync(List.of(a, img(35, 17, "/p17-35.jpg")), i -> vec(1, 0));
            when(repo.findCatalogImages()).thenReturn(List.of(a));

            engine.refresh();

            assertEquals(List.of(31L), engine.index().entries().stream().map(Entry::imageId).toList());
            assertTrue(Files.exists(indexFile()));
        }

        @Test
        @DisplayName("UTC-IMG-024: Ảnh mới 41 lỗi HTTP 404: không thêm Entry, không ném lỗi")
        void img024() {
            when(repo.findCatalogImages()).thenReturn(List.of(img(41, 21, "/p21-41.jpg")));

            assertDoesNotThrow(() -> engine.refresh());

            assertEquals(1, cloudinary.hits("/p21-41.jpg"));
            assertEquals(0, engine.index().size());
            verifyNoInteractions(encoder);
        }

        @Test
        @DisplayName("UTC-IMG-025: Ảnh mới 42 nặng 15 MB + 1 byte: bỏ qua, không thêm Entry")
        void img025() {
            when(repo.findCatalogImages()).thenReturn(List.of(img(42, 22, "/p22-42.jpg")));

            assertDoesNotThrow(() -> engine.refresh());

            assertEquals(1, cloudinary.hits("/p22-42.jpg"));
            assertEquals(0, engine.index().size());
            verifyNoInteractions(encoder);
        }
    }

    // ================================================================== start / initialize

    @Nested
    @DisplayName("ImageSearchEngine.start() / initialize()")
    class StartTests {
        /*
         * Dự án dùng mock-maker-subclass nên không mock được constructor của OnnxImageEncoder / BackgroundRemover.
         * Thay vào đó dùng 2 file ONNX tí hon tự dựng trong test (vài trăm byte, không tải gì):
         *  - "SigLIP" giả: pixel_values [1,3,H,W] -> ReduceMean(H,W) -> pooler_output [1,3]
         *  - "u2net" giả: Identity
         * OnnxImageEncoder / BackgroundRemover thật mở được 2 file này như mô hình thật.
         */
        static final byte[] SIGLIP = TinyOnnx.reduceMean("pixel_values", "pooler_output");
        static final byte[] U2NET = TinyOnnx.identity("input.1", "output");
        static final String SIGLIP_FILE = "siglip-b16-vision-fp16.onnx";

        @TempDir
        Path dir;
        ImageSearchProperties props;
        ImageSearchRepository repo;
        FakeServer models;
        final List<ImageSearchEngine> engines = new ArrayList<>();

        ImageSearchEngine newEngine() {
            ImageSearchEngine e = new ImageSearchEngine(props, repo);
            engines.add(e);
            return e;
        }

        @BeforeEach
        void setUp() throws Exception {
            props = props();
            props.setCacheDir(dir.toString());
            props.setModelSha256(sha256(SIGLIP));
            props.setBackgroundModelSha256(sha256(U2NET));
            models = new FakeServer()
                    .serve("/siglip.onnx", 200, SIGLIP)
                    .serve("/u2net.onnx", 200, U2NET)
                    .serve("/p17.jpg", 200, jpeg(20 * 1024));
            props.setModelUrl(models.url("/siglip.onnx"));
            props.setBackgroundModelUrl(models.url("/u2net.onnx"));
            repo = mock(ImageSearchRepository.class);
        }

        @AfterEach
        void tearDown() throws Exception {
            for (ImageSearchEngine e : engines) call(e, "stop");
            models.close();
        }

        void cachedModels() throws Exception {
            Files.write(dir.resolve(SIGLIP_FILE), SIGLIP);
            Files.write(dir.resolve("u2net.onnx"), U2NET);
        }

        @Test
        @DisplayName("UTC-IMG-026: enabled = false: giữ DISABLED, không submit initialize, không tải mô hình")
        void img026() throws Exception {
            props.setEnabled(false);
            ImageSearchEngine engine = newEngine();
            ExecutorService background = mock(ExecutorService.class);
            setField(ImageSearchEngine.class, engine, "background", background);

            engine.start();

            assertEquals(ImageSearchEngine.State.DISABLED, engine.state());
            verify(background, never()).submit(any(Runnable.class));
            verifyNoInteractions(background);
            assertEquals(0, models.hits("/siglip.onnx") + models.hits("/u2net.onnx"));
            assertNull(engine.encoder(), "không tải / tạo mô hình");
        }

        @Test
        @DisplayName("UTC-IMG-027: Mô hình và catalog-index.bin hợp lệ trong cache: READY ngay, không tải lại, rồi refresh")
        void img027() throws Exception {
            cachedModels();
            ImageSearchEngine engine = newEngine();
            CatalogImage cached = new CatalogImage(31, 17, models.url("/p17.jpg"));
            CatalogIndex saved = new CatalogIndex();
            saved.sync(List.of(cached), i -> vec(1, 0));
            saved.save(dir.resolve("catalog-index.bin"), (String) call(engine, "modelId"));
            AtomicReference<ImageSearchEngine.State> atRefresh = new AtomicReference<>();
            when(repo.findCatalogImages()).thenAnswer(inv -> {
                atRefresh.set(engine.state());
                return List.of(cached);
            });
            assertEquals(ImageSearchEngine.State.LOADING, engine.state());

            call(engine, "initialize");

            assertEquals(ImageSearchEngine.State.READY, atRefresh.get(), "READY ngay sau khi nạp cache, trước refresh");
            assertEquals(ImageSearchEngine.State.READY, engine.state());
            assertEquals(0, models.hits("/siglip.onnx"));
            assertEquals(0, models.hits("/u2net.onnx"));
            verify(repo).findCatalogImages();
            assertEquals(1, engine.index().size());
        }

        @Test
        @DisplayName("UTC-IMG-028: File SigLIP sai SHA-256: tải lại từ modelUrl, kiểm SHA-256 rồi mới thay")
        void img028() throws Exception {
            cachedModels();
            Files.write(dir.resolve(SIGLIP_FILE), "file-hong".getBytes(StandardCharsets.UTF_8));
            when(repo.findCatalogImages()).thenReturn(List.of());
            ImageSearchEngine engine = newEngine();

            call(engine, "initialize");

            assertEquals(1, models.hits("/siglip.onnx"));
            assertArrayEquals(SIGLIP, Files.readAllBytes(dir.resolve(SIGLIP_FILE)));
            try (Stream<Path> files = Files.list(dir)) {
                assertTrue(files.noneMatch(p -> p.getFileName().toString().endsWith(".part")));
            }
            assertEquals(ImageSearchEngine.State.READY, engine.state());
        }

        @Test
        @DisplayName("UTC-IMG-029: backgroundRemoval = false: không tải u2net, không tạo BackgroundRemover")
        void img029() throws Exception {
            props.setBackgroundRemoval(false);
            Files.write(dir.resolve(SIGLIP_FILE), SIGLIP);
            when(repo.findCatalogImages()).thenReturn(List.of());
            ImageSearchEngine engine = newEngine();

            call(engine, "initialize");

            assertEquals(0, models.hits("/u2net.onnx"));
            assertFalse(Files.exists(dir.resolve("u2net.onnx")));
            assertInstanceOf(OnnxImageEncoder.class, engine.encoder());
            Field remover = OnnxImageEncoder.class.getDeclaredField("backgroundRemover");
            remover.setAccessible(true);
            assertNull(remover.get(engine.encoder()), "OnnxImageEncoder tạo với BackgroundRemover = null");
        }

        @Test
        @DisplayName("UTC-IMG-030: catalog-index.bin của mô hình khác: không dùng cache, refresh dựng lại rồi READY")
        void img030() throws Exception {
            // Tắt xóa nền để bước dựng lại chỉ mục tính được vector bằng mô hình SigLIP giả (u2net giả không chạy được)
            props.setBackgroundRemoval(false);
            cachedModels();
            ImageSearchEngine engine = newEngine();
            Path file = dir.resolve("catalog-index.bin");
            CatalogIndex stale = new CatalogIndex();
            stale.sync(List.of(new CatalogImage(99, 9, "old")), i -> vec(0, 1));
            stale.save(file, "siglip-b16:mo-hinh-cu");
            CatalogImage now = new CatalogImage(50, 17, models.url("/p17.jpg"));
            AtomicReference<ImageSearchEngine.State> atRefresh = new AtomicReference<>();
            when(repo.findCatalogImages()).thenAnswer(inv -> {
                atRefresh.set(engine.state());
                return List.of(now);
            });
            String modelId = (String) call(engine, "modelId");

            assertFalse(new CatalogIndex().load(file, modelId), "load trả false");
            call(engine, "initialize");

            assertEquals(ImageSearchEngine.State.LOADING, atRefresh.get(), "không READY từ cache cũ");
            assertEquals(ImageSearchEngine.State.READY, engine.state());
            assertEquals(List.of(50L), engine.index().entries().stream().map(Entry::imageId).toList());
            assertTrue(new CatalogIndex().load(file, modelId), "file chỉ mục được dựng lại theo mô hình hiện tại");
        }

        @Test
        @DisplayName("UTC-IMG-031: Tải modelUrl lỗi mạng: state = ERROR kèm thông báo lỗi, không ném lỗi ra ngoài")
        void img031() throws Exception {
            int closedPort;
            try (ServerSocket s = new ServerSocket(0)) {
                closedPort = s.getLocalPort();
            }
            props.setModelUrl("http://127.0.0.1:" + closedPort + "/siglip.onnx");
            ImageSearchEngine engine = newEngine();

            assertDoesNotThrow(() -> call(engine, "initialize"));

            assertEquals(ImageSearchEngine.State.ERROR, engine.state());
            assertNotNull(engine.message());
            assertFalse(engine.message().isBlank(), "message phải chứa nội dung lỗi");
            verifyNoInteractions(repo);
        }
    }
}
