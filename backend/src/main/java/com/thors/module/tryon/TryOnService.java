package com.thors.module.tryon;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.fitting.entity.BodyProfile;
import com.thors.module.fitting.repository.BodyProfileRepository;
import com.thors.module.fitting.repository.SizeChartRepository;
import com.thors.module.fitting.service.StandardSizeCharts;
import com.thors.module.tryon.TryOnDtos.JobItem;
import com.thors.module.tryon.TryOnDtos.JobView;
import com.thors.module.tryon.TryOnDtos.ModelCard;
import com.thors.module.tryon.TryOnDtos.ModelChoice;
import com.thors.module.tryon.TryOnDtos.Quota;
import com.thors.module.tryon.TryOnPlan.Garment;
import com.thors.module.tryon.TryOnPlan.Pick;
import com.thors.module.tryon.TryOnRepository.ItemRow;
import com.thors.module.tryon.TryOnRepository.JobRow;
import com.thors.module.tryon.TryOnRepository.ModelRow;
import jakarta.annotation.PreDestroy;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * Mặc thử 2D, 3 chế độ:
 * <ul>
 *   <li>MODEL - người mẫu dựng sẵn dáng gần khách (chọn theo số đo). Không có dữ liệu cá nhân: kết quả
 *       dùng chung cho mọi khách, giữ thors.tryon.model-keep-days ngày; đã có sẵn thì trả ngay, không tính lượt.</li>
 *   <li>GENERATE - AI tạo người mẫu mới theo mô tả dáng của khách đang mặc món đồ (1 món / lần).</li>
 *   <li>PHOTO - ảnh của khách (tải / chụp); phải đồng ý, ảnh tự xóa sau thors.tryon.keep-hours giờ.</li>
 * </ul>
 * Các món mặc lần lượt (quần / đầm trước, áo sau; ảnh kết quả bước trước là ảnh người của bước sau),
 * xử lý ở luồng nền; giao diện hỏi trạng thái tới khi xong. Giới hạn số lượt gọi AI trong 24 giờ.
 */
@Service
public class TryOnService {

    private static final Logger log = LoggerFactory.getLogger(TryOnService.class);
    /** Job chờ / đang vẽ quá lâu (máy chủ khởi động lại giữa chừng...) thì báo lỗi. */
    static final int STUCK_MINUTES = 10;
    /** Kết quả chế độ GENERATE (không có ảnh khách) giữ lâu hơn ảnh khách. */
    static final int GENERATE_KEEP_DAYS = 7;
    /** Số lần thử tối đa hiện ở trang "Ảnh mặc thử của tôi". */
    static final int HISTORY_LIMIT = 40;

    private final TryOnRepository repo;
    private final TryOnImageStore images;
    private final TryOnProvider provider;
    private final SizeChartRepository categories;
    private final BodyProfileRepository bodyProfiles;
    private final int dailyLimit;
    private final int keepHours;
    private final int modelKeepDays;
    private final ExecutorService workers;
    private volatile boolean ready;

    public TryOnService(TryOnRepository repo, TryOnImageStore images, TryOnProvider provider,
                        SizeChartRepository categories, BodyProfileRepository bodyProfiles,
                        @Value("${thors.tryon.daily-limit:5}") int dailyLimit,
                        @Value("${thors.tryon.keep-hours:24}") int keepHours,
                        @Value("${thors.tryon.model-keep-days:30}") int modelKeepDays,
                        @Value("${thors.tryon.workers:2}") int workerCount) {
        this.repo = repo;
        this.images = images;
        this.provider = provider;
        this.categories = categories;
        this.bodyProfiles = bodyProfiles;
        this.dailyLimit = Math.max(1, dailyLimit);
        this.keepHours = Math.max(1, keepHours);
        this.modelKeepDays = Math.max(1, modelKeepDays);
        AtomicInteger n = new AtomicInteger();
        this.workers = Executors.newFixedThreadPool(Math.max(1, workerCount), r -> {
            Thread t = new Thread(r, "tryon-worker-" + n.incrementAndGet());
            t.setDaemon(true);
            return t;
        });
    }

    @PreDestroy
    void shutdown() {
        workers.shutdownNow();
    }

    // ---------------------------------------------------------------- API cho khách

    public Quota quota(Account actor) {
        requireCustomer(actor);
        boolean generate = provider.supportsGenerate();
        if (!isReady()) return new Quota(false, dailyLimit, 0, 0, isMock(), keepHours, generate);
        int used = repo.countSince(actor.id(), now().minusHours(24));
        return new Quota(true, dailyLimit, used, Math.max(0, dailyLimit - used), isMock(), keepHours, generate);
    }

    /** Người mẫu đang dùng + người mẫu gợi ý theo số đo đã lưu (gender: lọc theo giới tính, null = theo số đo). */
    public ModelChoice models(Account actor, String gender) {
        requireCustomer(actor);
        requireReady();
        Optional<BodyProfile> body = bodyProfiles.findByUserId(actor.id());
        String g = gender != null && !gender.isBlank() ? gender.trim().toUpperCase(Locale.ROOT)
                : body.map(BodyProfile::gender).orElse(null);
        List<ModelRow> rows = repo.models(true).stream().filter(m -> g == null || g.equals(m.gender())).toList();
        Integer suggested = TryOnModels.suggest(rows.stream().map(ModelRow::toModel).toList(), g,
                        body.filter(b -> b.gender().equals(g)).map(b -> b.heightCm().doubleValue()).orElse(null),
                        body.filter(b -> b.gender().equals(g)).map(b -> b.weightKg().doubleValue()).orElse(null))
                .map(TryOnModels.Model::modelId).orElse(null);
        String description = body.map(b -> TryOnModels.describe(b.gender(), b.heightCm().doubleValue(),
                b.weightKg().doubleValue())).orElse(null);
        return new ModelChoice(rows.stream().map(m -> new ModelCard(m.modelId(), m.gender(), m.bodyType(),
                m.heightCm(), m.imageUrl())).toList(), suggested, g, description);
    }

    /**
     * Tạo lần mặc thử.
     *
     * @param mode PHOTO | MODEL | GENERATE
     * @param photo ảnh mới (PHOTO)
     * @param photoFromJob dùng lại ảnh của lần thử trước, khỏi tải lại khi "đổi món" (PHOTO)
     * @param modelId người mẫu dựng sẵn (MODEL)
     * @param consent khách đã đồng ý điều khoản dùng ảnh (bắt buộc ở PHOTO)
     */
    public JobView create(Account actor, String mode, MultipartFile photo, Long photoFromJob, Integer modelId,
                          List<Integer> productIds, boolean consent) {
        requireCustomer(actor);
        requireReady();
        String m = mode == null ? "PHOTO" : mode.trim().toUpperCase(Locale.ROOT);
        TryOnPlan.Result plan = TryOnPlan.plan(picks(productIds));
        return switch (m) {
            case "MODEL" -> createOnModel(actor, modelId, plan);
            case "GENERATE" -> createGenerated(actor, plan);
            case "PHOTO" -> createOnPhoto(actor, photo, photoFromJob, plan, consent);
            default -> throw new ApiException(400, "TRYON_MODE", "Chế độ mặc thử không hợp lệ.");
        };
    }

    private JobView createOnPhoto(Account actor, MultipartFile photo, Long photoFromJob, TryOnPlan.Result plan,
                                  boolean consent) {
        if (!consent) {
            throw new ApiException(400, "TRYON_CONSENT", "Vui lòng đồng ý điều khoản sử dụng ảnh để mặc thử.");
        }
        byte[] bytes = null;
        String personHash;
        String personUrl = null;
        LocalDateTime expiresAt = now().plusHours(keepHours);
        if (photo != null && !photo.isEmpty()) {
            bytes = images.readPhoto(photo);
            personHash = TryOnImageStore.sha256(bytes);
        } else if (photoFromJob != null) {
            JobRow source = owned(actor, photoFromJob);
            if (!"PHOTO".equals(source.mode()) || source.personImageUrl() == null || source.purgedAt() != null
                    || !source.expiresAt().isAfter(now())) {
                throw new ApiException(400, "TRYON_PHOTO_EXPIRED", "Ảnh cũ đã được xóa, vui lòng chọn lại ảnh.");
            }
            personHash = source.personHash();
            personUrl = source.personImageUrl();
            // Dùng lại ảnh cũ không kéo dài thời gian lưu ảnh khách đã đồng ý
            expiresAt = source.expiresAt();
        } else {
            throw new ApiException(400, "TRYON_PHOTO_EMPTY", "Vui lòng chọn hoặc chụp ảnh của bạn.");
        }

        var reusable = repo.findReusablePhoto(actor.id(), personHash, plan.steps());
        if (reusable.isPresent()) return view(repo.find(reusable.get()).orElseThrow(), true, plan.skipped());

        requireTurnLeft(actor);
        if (personUrl == null) personUrl = images.upload(actor.id(), bytes);
        long jobId;
        try {
            jobId = repo.insertJob(actor.id(), "PHOTO", null, provider.name(), personHash, personUrl, expiresAt,
                    plan.steps());
        } catch (RuntimeException e) {
            if (bytes != null) images.destroy(actor.id(), personUrl);
            throw e;
        }
        return submit(jobId, plan.skipped());
    }

    private JobView createOnModel(Account actor, Integer modelId, TryOnPlan.Result plan) {
        if (modelId == null) throw new ApiException(400, "TRYON_MODEL_REQUIRED", "Hãy chọn người mẫu.");
        ModelRow model = repo.model(modelId).filter(ModelRow::active)
                .orElseThrow(() -> new ApiException(404, "TRYON_MODEL_NOT_FOUND", "Người mẫu không còn được dùng."));

        // Người mẫu không có dữ liệu cá nhân: kết quả của khách khác cũng dùng được
        var reusable = repo.findReusableModel(modelId, plan.steps());
        if (reusable.isPresent()) return view(repo.find(reusable.get()).orElseThrow(), true, plan.skipped());

        requireTurnLeft(actor);
        String hash = TryOnImageStore.sha256(model.imageUrl().getBytes(StandardCharsets.UTF_8));
        long jobId = repo.insertJob(actor.id(), "MODEL", modelId, provider.name(), hash, model.imageUrl(),
                now().plusDays(modelKeepDays), plan.steps());
        return submit(jobId, plan.skipped());
    }

    private JobView createGenerated(Account actor, TryOnPlan.Result plan) {
        if (!provider.supportsGenerate()) {
            throw new ApiException(400, "TRYON_GENERATE_UNSUPPORTED",
                    "Dịch vụ AI hiện tại chưa hỗ trợ tự tạo người mẫu. Hãy chọn người mẫu dựng sẵn hoặc ảnh của bạn.");
        }
        if (plan.steps().size() != 1) {
            throw new ApiException(400, "TRYON_GENERATE_ONE",
                    "AI tạo người mẫu chỉ mặc được 1 món mỗi lần. Để thử cả bộ, hãy chọn người mẫu dựng sẵn hoặc ảnh của bạn.");
        }
        if (bodyProfiles.findByUserId(actor.id()).isEmpty()) {
            throw new ApiException(400, "TRYON_NEED_BODY_PROFILE",
                    "Hãy lưu số đo (Số đo của tôi) để AI tạo người mẫu có dáng giống bạn.");
        }
        requireTurnLeft(actor);
        long jobId = repo.insertJob(actor.id(), "GENERATE", null, provider.name(), null, null,
                now().plusDays(GENERATE_KEEP_DAYS), plan.steps());
        return submit(jobId, plan.skipped());
    }

    /** "Ảnh mặc thử của tôi": các lần thử còn ảnh, mới nhất trước (tối đa HISTORY_LIMIT). */
    public List<JobView> history(Account actor) {
        requireCustomer(actor);
        requireReady();
        return repo.recentOfUser(actor.id(), HISTORY_LIMIT).stream().map(j -> view(j, false, List.of())).toList();
    }

    public JobView get(Account actor, long jobId) {
        requireCustomer(actor);
        requireReady();
        return view(owned(actor, jobId), false, List.of());
    }

    /** "Xóa ảnh của tôi": xóa ngay ảnh khách + kết quả riêng của khách (job đang vẽ thì hủy). */
    public void deleteMyPhotos(Account actor) {
        requireCustomer(actor);
        requireReady();
        for (JobRow job : repo.personalOfUser(actor.id())) {
            repo.markFailed(job.jobId(), "Bạn đã xóa ảnh.");
            images.destroy(actor.id(), job.personImageUrl());
            images.destroy(actor.id(), job.resultImageUrl());
            repo.markPurged(job.jobId());
        }
    }

    // ---------------------------------------------------------------- Xử lý nền

    private JobView submit(long jobId, List<String> skipped) {
        try {
            workers.submit(() -> run(jobId));
        } catch (RejectedExecutionException e) {
            repo.markFailed(jobId, "Máy chủ đang bận, vui lòng thử lại.");
        }
        return view(repo.find(jobId).orElseThrow(), false, skipped);
    }

    void run(long jobId) {
        if (!repo.markRunning(jobId)) return;
        JobRow job = repo.find(jobId).orElse(null);
        if (job == null) return;
        boolean shared = "MODEL".equals(job.mode()) && job.modelId() != null;
        List<String> intermediate = new ArrayList<>();
        String result = null;
        try {
            List<ItemRow> items = repo.items(jobId);
            String person = job.personImageUrl();
            for (int i = 0; i < items.size(); i++) {
                ItemRow item = items.get(i);
                if (item.imageUrl() == null) {
                    throw new TryOnProvider.TryOnException("Sản phẩm \"" + item.productName() + "\" chưa có ảnh.");
                }
                Garment garment = Garment.valueOf(item.garment());
                TryOnProvider.Image out = "GENERATE".equals(job.mode()) && i == 0
                        ? provider.generate(TryOnImageStore.jpegUrl(item.imageUrl()), garment, generateDescription(job.userId()))
                        // Ảnh sản phẩm / kết quả bước trước có thể là WebP: xin bản JPG để dịch vụ nào cũng đọc được
                        : provider.apply(TryOnImageStore.jpegUrl(person), TryOnImageStore.jpegUrl(item.imageUrl()), garment);
                Object source = out.bytes() != null ? out.bytes() : out.url();
                String url = shared ? images.uploadShared(job.modelId(), source) : images.upload(job.userId(), source);
                if (i < items.size() - 1) intermediate.add(url);
                person = url;
            }
            result = person;
            if (!repo.markDone(jobId, result)) {
                destroyResult(job, result); // khách đã xóa ảnh trong lúc vẽ
            }
        } catch (TryOnProvider.TryOnException | ApiException e) {
            log.info("Try-on job {} failed: {}", jobId, e.getMessage());
            repo.markFailed(jobId, e.getMessage());
            destroyResult(job, result);
        } catch (RuntimeException e) {
            log.warn("Try-on job {} failed", jobId, e);
            repo.markFailed(jobId, "Có lỗi khi mặc thử, vui lòng thử lại.");
            destroyResult(job, result);
        } finally {
            intermediate.forEach(url -> destroyResult(job, url));
        }
    }

    private String generateDescription(int userId) {
        BodyProfile b = bodyProfiles.findByUserId(userId).orElseThrow(() -> new TryOnProvider.TryOnException(
                "Bạn đã xóa số đo, AI chưa biết dáng người để tạo người mẫu."));
        return TryOnModels.describe(b.gender(), b.heightCm().doubleValue(), b.weightKg().doubleValue());
    }

    private void destroyResult(JobRow job, String url) {
        if (url == null) return;
        if ("MODEL".equals(job.mode()) && job.modelId() != null) images.destroyShared(job.modelId(), url);
        else images.destroy(job.userId(), url);
    }

    /** Dọn dẹp định kỳ: job treo -> lỗi; job hết hạn -> xóa ảnh trên Cloudinary. */
    @Scheduled(fixedDelayString = "${thors.tryon.cleanup-interval-ms:600000}", initialDelay = 60_000L)
    void cleanup() {
        if (!isReady()) return;
        for (JobRow job : repo.stuckBefore(now().minusMinutes(STUCK_MINUTES))) {
            repo.markFailed(job.jobId(), "Xử lý quá lâu, vui lòng thử lại.");
        }
        for (JobRow job : repo.expired(100)) {
            // Ảnh người mẫu không bao giờ bị xóa ở đây (destroy chỉ xóa ảnh trong thư mục của khách)
            if ("PHOTO".equals(job.mode()) && job.personImageUrl() != null
                    && !repo.personImageStillUsed(job.personImageUrl(), job.jobId())) {
                images.destroy(job.userId(), job.personImageUrl());
            }
            destroyResult(job, job.resultImageUrl());
            repo.markPurged(job.jobId());
        }
    }

    // ---------------------------------------------------------------- Hỗ trợ

    private List<Pick> picks(List<Integer> productIds) {
        if (productIds == null || productIds.isEmpty()) {
            throw new ApiException(400, "TRYON_NO_ITEM", "Hãy chọn ít nhất 1 món để mặc thử.");
        }
        List<Pick> picks = new ArrayList<>();
        for (Integer id : new LinkedHashSet<>(productIds)) {
            if (id == null) continue;
            var product = repo.product(id).orElseThrow(() ->
                    new ApiException(404, "PRODUCT_NOT_FOUND", "Sản phẩm không tồn tại hoặc đã ngừng bán."));
            if (product.imageUrl() == null) {
                throw new ApiException(400, "TRYON_NO_PRODUCT_IMAGE",
                        "Sản phẩm \"" + product.name() + "\" chưa có ảnh để mặc thử.");
            }
            var info = categories.categoryInfo(id);
            var kind = info == null ? StandardSizeCharts.Kind.NONE : StandardSizeCharts.detectKind(info.names());
            picks.add(new Pick(id, product.name(), kind));
        }
        return picks;
    }

    private void requireTurnLeft(Account actor) {
        if (repo.countSince(actor.id(), now().minusHours(24)) >= dailyLimit) {
            throw new ApiException(429, "TRYON_LIMIT",
                    "Bạn đã dùng hết " + dailyLimit + " lượt mặc thử trong 24 giờ. Vui lòng quay lại sau.");
        }
    }

    private JobView view(JobRow job, boolean reused, List<String> skipped) {
        List<JobItem> items = repo.items(job.jobId()).stream()
                .map(i -> new JobItem(i.productId(), i.productName(), i.garment(), i.imageUrl()))
                .toList();
        boolean photoAvailable = "PHOTO".equals(job.mode()) && job.personImageUrl() != null
                && job.purgedAt() == null && job.expiresAt().isAfter(now());
        return new JobView(job.jobId(), job.status(), job.mode(), job.modelId(), job.resultImageUrl(),
                job.errorMessage(), "MOCK".equals(job.provider()), reused, items, skipped, job.createdAt(),
                job.expiresAt(), photoAvailable);
    }

    /** Job của chính khách; riêng kết quả trên người mẫu dựng sẵn (dùng chung) thì khách nào cũng xem được. */
    private JobRow owned(Account actor, long jobId) {
        return repo.find(jobId)
                .filter(j -> j.userId() == actor.id() || "MODEL".equals(j.mode()))
                .orElseThrow(() -> new ApiException(404, "TRYON_NOT_FOUND", "Không tìm thấy lần mặc thử."));
    }

    private static void requireCustomer(Account actor) {
        if (actor == null || !"CUSTOMER".equals(actor.role())) {
            throw new ApiException(403, "TRYON_CUSTOMER_ONLY", "Mặc thử dành cho tài khoản khách hàng.");
        }
    }

    void requireReady() {
        if (!isReady()) {
            throw new ApiException(503, "TRYON_NOT_READY",
                    "Chức năng mặc thử chưa sẵn sàng. Hãy chạy migration 2026-11-18_tryon_job.sql và 2026-11-18_tryon_model.sql.");
        }
    }

    boolean isReady() {
        if (ready) return true;
        try {
            ready = repo.tablesReady();
        } catch (BadSqlGrammarException e) {
            ready = false;
        }
        return ready;
    }

    private boolean isMock() {
        return "MOCK".equals(provider.name());
    }

    private static LocalDateTime now() {
        return LocalDateTime.now(ZoneOffset.UTC);
    }
}
