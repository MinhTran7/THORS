package com.thors.module.tryon;

import com.thors.module.tryon.TryOnDtos.JobView;
import com.thors.module.tryon.TryOnDtos.ModelChoice;
import com.thors.module.tryon.TryOnDtos.Quota;
import com.thors.module.tryon.TryOnRepository.ModelRow;
import com.thors.security.SessionAccess;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/**
 * Mặc thử 2D. Cần đăng nhập (SecurityConfig chặn mọi /api/** không công khai).
 * /api/try-on/** dành cho khách hàng; /api/try-on/admin/models/** dành cho chủ cửa hàng.
 */
@RestController
@RequestMapping("/api/try-on")
public class TryOnController {

    private final TryOnService service;
    private final TryOnModelService models;
    private final SessionAccess sessions;

    public TryOnController(TryOnService service, TryOnModelService models, SessionAccess sessions) {
        this.service = service;
        this.models = models;
        this.sessions = sessions;
    }

    /** Số lượt còn lại trong 24 giờ, dịch vụ đang dùng (ảnh mẫu hay AI thật). */
    @GetMapping("/quota")
    public Quota quota() {
        return service.quota(sessions.current());
    }

    /** Người mẫu dựng sẵn + người mẫu gợi ý theo số đo đã lưu + mô tả người mẫu AI sẽ tạo. */
    @GetMapping("/models")
    public ModelChoice modelChoice(@RequestParam(required = false) String gender) {
        return service.models(sessions.current(), gender);
    }

    /**
     * Tạo lần mặc thử (multipart). mode = MODEL (modelId) | GENERATE | PHOTO (photo hoặc photoFromJob + consent);
     * productIds = các món (1-3). Trả 202 + job; giao diện hỏi GET /jobs/{id} tới khi DONE / FAILED
     * (kết quả đã có sẵn thì job trả về DONE luôn).
     */
    @PostMapping(value = "/jobs", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public JobView create(@RequestParam(defaultValue = "PHOTO") String mode,
                          @RequestParam(required = false) MultipartFile photo,
                          @RequestParam(required = false) Long photoFromJob,
                          @RequestParam(required = false) Integer modelId,
                          @RequestParam List<Integer> productIds,
                          @RequestParam(defaultValue = "false") boolean consent) {
        return service.create(sessions.current(), mode, photo, photoFromJob, modelId, productIds, consent);
    }

    /** Các lần mặc thử của khách còn ảnh (trang "Ảnh mặc thử của tôi"), mới nhất trước. */
    @GetMapping("/jobs")
    public List<JobView> history() {
        return service.history(sessions.current());
    }

    @GetMapping("/jobs/{jobId}")
    public JobView get(@PathVariable long jobId) {
        return service.get(sessions.current(), jobId);
    }

    /** Xóa ngay ảnh mặc thử của khách (không đợi tự xóa). */
    @DeleteMapping("/photos")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMyPhotos() {
        service.deleteMyPhotos(sessions.current());
    }

    // ---------------------------------------------------------------- Owner: người mẫu dựng sẵn

    @GetMapping("/admin/models")
    public List<ModelRow> listModels() {
        return models.list(sessions.current());
    }

    @PostMapping(value = "/admin/models", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public ModelRow createModel(@RequestParam MultipartFile image,
                                @RequestParam String gender,
                                @RequestParam String bodyType,
                                @RequestParam Integer heightCm,
                                @RequestParam(required = false) String source,
                                @RequestParam(required = false) String note) {
        return models.create(sessions.current(), image, gender, bodyType, heightCm, source, note);
    }

    /** Body: { "active": true | false } - ẩn / hiện người mẫu với khách. */
    @PatchMapping("/admin/models/{modelId}")
    public ModelRow setModelActive(@PathVariable int modelId, @RequestBody Map<String, Boolean> body) {
        return models.setActive(sessions.current(), modelId, Boolean.TRUE.equals(body.get("active")));
    }

    @DeleteMapping("/admin/models/{modelId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteModel(@PathVariable int modelId) {
        models.delete(sessions.current(), modelId);
    }
}
