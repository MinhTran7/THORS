package com.thors.module.imagesearch.service;

import com.thors.module.imagesearch.config.ImageSearchProperties;
import com.thors.module.imagesearch.model.BackgroundRemover;
import com.thors.module.imagesearch.model.ImageDecoder;
import com.thors.module.imagesearch.model.ImageEncoder;
import com.thors.module.imagesearch.model.ModelFiles;
import com.thors.module.imagesearch.model.OnnxImageEncoder;
import com.thors.module.imagesearch.repository.ImageSearchRepository;
import com.thors.module.imagesearch.repository.ImageSearchRepository.CatalogImage;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Vòng đời của tính năng tìm bằng ảnh: tải mô hình, dựng chỉ mục ảnh sản phẩm ở nền (không làm chậm lúc
 * khởi động backend), rồi cập nhật định kỳ. Tắt (thors.image-search.enabled=false) thì không làm gì cả.
 */
@Component
@EnableScheduling
public class ImageSearchEngine {

    private static final Logger log = LoggerFactory.getLogger(ImageSearchEngine.class);
    private static final long MAX_CATALOG_IMAGE_BYTES = 15L * 1024 * 1024;

    public enum State { DISABLED, LOADING, READY, ERROR }

    private final ImageSearchProperties props;
    private final ImageSearchRepository repository;
    private final CatalogIndex index = new CatalogIndex();
    private final ReentrantLock refreshLock = new ReentrantLock();
    private final ExecutorService background = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "image-search-init");
        t.setDaemon(true);
        return t;
    });
    private final HttpClient http = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    private volatile State state;
    private volatile String message = "";
    private volatile ImageEncoder encoder;
    private volatile long lastRefreshMillis;

    @Autowired
    public ImageSearchEngine(ImageSearchProperties props, ImageSearchRepository repository) {
        this.props = props;
        this.repository = repository;
        this.state = props.isEnabled() ? State.LOADING : State.DISABLED;
    }

    /** Dùng trong test: gắn sẵn encoder, không tải mô hình. */
    ImageSearchEngine(ImageSearchProperties props, ImageSearchRepository repository, ImageEncoder encoder) {
        this(props, repository);
        this.encoder = encoder;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        if (!props.isEnabled()) {
            log.info("Tìm sản phẩm bằng ảnh đang tắt (thors.image-search.enabled=false).");
            return;
        }
        background.submit(this::initialize);
    }

    private void initialize() {
        try {
            state = State.LOADING;
            message = "Đang tải mô hình AI...";
            Path dir = Path.of(props.getCacheDir());
            Path model = ModelFiles.ensureModel(dir, props.getModelUrl(), props.getModelSha256());
            BackgroundRemover remover = null;
            if (props.isBackgroundRemoval()) {
                Path u2net = ModelFiles.ensureModel(dir, "u2net.onnx", props.getBackgroundModelUrl(),
                        props.getBackgroundModelSha256());
                remover = new BackgroundRemover(u2net);
            }
            encoder = new OnnxImageEncoder(model, remover);
            if (index.load(indexFile(), modelId())) {
                log.info("Đã đọc {} vector ảnh sản phẩm từ cache.", index.size());
                state = State.READY; // dùng được ngay, rồi cập nhật ảnh mới bên dưới
            }
            message = "Đang chuẩn bị dữ liệu ảnh sản phẩm...";
            refresh();
        } catch (Exception e) {
            state = State.ERROR;
            message = "Chưa dùng được tìm bằng ảnh: " + e.getMessage();
            log.error("Khởi tạo tìm sản phẩm bằng ảnh lỗi", e);
        }
    }

    /** Cập nhật định kỳ danh sách ảnh sản phẩm (ảnh mới / đổi / xóa). Kiểm tra mỗi 30 giây, đủ chu kỳ refresh-minutes thì chạy. */
    @Scheduled(fixedDelay = 30_000L, initialDelay = 60_000L)
    public void scheduledRefresh() {
        if (encoder == null || state == State.DISABLED) return;
        long due = lastRefreshMillis + TimeUnit.MINUTES.toMillis(Math.max(1, props.getRefreshMinutes()));
        if (System.currentTimeMillis() < due) return;
        try {
            refresh();
        } catch (RuntimeException e) {
            log.warn("Cập nhật ảnh sản phẩm cho tìm bằng ảnh lỗi: {}", e.getMessage());
        }
    }

    void refresh() {
        if (!refreshLock.tryLock()) return;
        try {
            List<CatalogImage> images = repository.findCatalogImages();
            long start = System.currentTimeMillis();
            boolean changed = index.sync(images, this::embedCatalogImage);
            lastRefreshMillis = System.currentTimeMillis();
            if (changed) {
                try {
                    index.save(indexFile(), modelId());
                } catch (IOException e) {
                    log.warn("Không lưu được cache vector ảnh: {}", e.getMessage());
                }
                log.info("Tìm bằng ảnh: {} ảnh / {} sản phẩm ({} ms).", index.size(), index.productCount(),
                        lastRefreshMillis - start);
            }
            state = State.READY;
            message = "";
        } finally {
            refreshLock.unlock();
        }
    }

    private ImageEncoder.Vectors embedCatalogImage(CatalogImage img) {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(img.imageUrl())).timeout(Duration.ofSeconds(30)).GET().build();
            HttpResponse<InputStream> res = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
            byte[] bytes;
            try (InputStream in = res.body()) {
                if (res.statusCode() != 200) {
                    log.warn("Ảnh sản phẩm {} (p{}) lỗi HTTP {}", img.imageId(), img.productId(), res.statusCode());
                    return null;
                }
                bytes = in.readNBytes((int) MAX_CATALOG_IMAGE_BYTES + 1);
            }
            if (bytes.length > MAX_CATALOG_IMAGE_BYTES) {
                log.warn("Ảnh sản phẩm {} quá lớn, bỏ qua", img.imageId());
                return null;
            }
            return encoder.encodeBoth(ImageDecoder.decode(bytes));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        } catch (Exception e) {
            log.warn("Không tính được vector cho ảnh {} (p{}): {}", img.imageId(), img.productId(), e.getMessage());
            return null;
        }
    }

    private Path indexFile() {
        return Path.of(props.getCacheDir(), "catalog-index.bin");
    }

    private String modelId() {
        // Đổi cách xử lý ảnh (xóa nền) thì vector cũ không dùng được nữa -> tính lại
        return "siglip-b16:" + props.getModelSha256()
                + (props.isBackgroundRemoval() ? ":u2net-cut-v1:" + props.getBackgroundModelSha256() : "");
    }

    public State state() {
        return state;
    }

    public String message() {
        return message;
    }

    public ImageEncoder encoder() {
        return encoder;
    }

    public CatalogIndex index() {
        return index;
    }

    /** Dùng trong test. */
    void markReady() {
        state = State.READY;
    }

    @PreDestroy
    void stop() {
        background.shutdownNow();
        if (encoder instanceof AutoCloseable c) {
            try {
                c.close();
            } catch (Exception ignored) {
                // đang tắt ứng dụng
            }
        }
    }
}
