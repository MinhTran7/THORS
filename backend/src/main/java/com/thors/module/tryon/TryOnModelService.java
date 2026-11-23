package com.thors.module.tryon;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.tryon.TryOnRepository.JobRow;
import com.thors.module.tryon.TryOnRepository.ModelRow;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * Owner quản lý người mẫu dựng sẵn cho chế độ "Người mẫu dáng giống bạn".
 * Ảnh phải được phép dùng (tự chụp có đồng ý của người mẫu, ảnh AI tạo theo điều khoản dịch vụ...) - ghi ở note.
 */
@Service
public class TryOnModelService {

    private static final Set<String> GENDERS = Set.of("MALE", "FEMALE");
    private static final Set<String> SOURCES = Set.of("UPLOAD", "AI");

    private final TryOnRepository repo;
    private final TryOnImageStore images;
    private final TryOnService tryOn;

    public TryOnModelService(TryOnRepository repo, TryOnImageStore images, TryOnService tryOn) {
        this.repo = repo;
        this.images = images;
        this.tryOn = tryOn;
    }

    public List<ModelRow> list(Account actor) {
        requireOwner(actor);
        tryOn.requireReady();
        return repo.models(false);
    }

    public ModelRow create(Account actor, MultipartFile image, String gender, String bodyType, Integer heightCm,
                           String source, String note) {
        requireOwner(actor);
        tryOn.requireReady();
        String g = upper(gender);
        if (!GENDERS.contains(g)) throw new ApiException(400, "TRYON_MODEL_GENDER", "Hãy chọn giới tính người mẫu.");
        String b = upper(bodyType);
        try {
            TryOnModels.BodyType.valueOf(b);
        } catch (IllegalArgumentException e) {
            throw new ApiException(400, "TRYON_MODEL_BODY", "Hãy chọn dáng người mẫu (gầy / vừa / đầy đặn).");
        }
        if (heightCm == null || heightCm < 120 || heightCm > 220) {
            throw new ApiException(400, "TRYON_MODEL_HEIGHT", "Chiều cao người mẫu phải từ 120 đến 220 cm.");
        }
        String s = source == null || source.isBlank() ? "UPLOAD" : upper(source);
        if (!SOURCES.contains(s)) throw new ApiException(400, "TRYON_MODEL_SOURCE", "Nguồn ảnh không hợp lệ.");
        String n = note == null ? null : note.trim();
        if (n == null || n.isEmpty()) {
            throw new ApiException(400, "TRYON_MODEL_NOTE",
                    "Hãy ghi nguồn ảnh / giấy phép (vd: ảnh tự chụp, người mẫu đã đồng ý).");
        }
        if (n.length() > 255) throw new ApiException(400, "TRYON_MODEL_NOTE", "Ghi chú tối đa 255 ký tự.");

        byte[] bytes = images.readPhoto(image);
        String url = images.uploadModel(bytes);
        try {
            int id = repo.insertModel(g, b, heightCm, url, s, n, actor.id());
            return repo.model(id).orElseThrow();
        } catch (RuntimeException e) {
            images.destroyModel(url);
            throw e;
        }
    }

    public ModelRow setActive(Account actor, int modelId, boolean active) {
        requireOwner(actor);
        tryOn.requireReady();
        find(modelId);
        repo.setModelActive(modelId, active);
        return find(modelId);
    }

    /** Xóa người mẫu + ảnh + các kết quả dùng chung đã vẽ trên người mẫu này. */
    public void delete(Account actor, int modelId) {
        requireOwner(actor);
        tryOn.requireReady();
        ModelRow model = find(modelId);
        for (JobRow job : repo.jobsOfModel(modelId)) {
            images.destroyShared(modelId, job.resultImageUrl());
            repo.markPurged(job.jobId());
        }
        repo.deleteModel(modelId);
        images.destroyModel(model.imageUrl());
    }

    private ModelRow find(int modelId) {
        return repo.model(modelId)
                .orElseThrow(() -> new ApiException(404, "TRYON_MODEL_NOT_FOUND", "Không tìm thấy người mẫu."));
    }

    private static void requireOwner(Account actor) {
        if (actor == null || !"OWNER".equals(actor.role())) {
            throw new ApiException(403, "FORBIDDEN", "Chỉ chủ cửa hàng được quản lý người mẫu thử đồ.");
        }
    }

    private static String upper(String s) {
        return s == null ? "" : s.trim().toUpperCase(Locale.ROOT);
    }
}
