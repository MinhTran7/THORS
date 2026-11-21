package com.thors.module.fitting.service;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.fitting.dto.BodyProfileRequest;
import com.thors.module.fitting.dto.BodyProfileResponse;
import com.thors.module.fitting.repository.BodyProfileRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Optional;
import java.util.Set;
import java.util.function.Supplier;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Hồ sơ số đo cơ thể của khách: xem / lưu (thêm hoặc sửa) / xóa. */
@Service
public class BodyProfileService {

    private static final Set<String> GENDERS = Set.of("MALE", "FEMALE");
    private static final Set<String> FITS = Set.of("SLIM", "REGULAR", "LOOSE");

    private final BodyProfileRepository profiles;

    public BodyProfileService(BodyProfileRepository profiles) {
        this.profiles = profiles;
    }

    public Optional<BodyProfileResponse> get(Account actor) {
        int userId = customerId(actor);
        return whenReady(() -> profiles.findByUserId(userId).map(BodyProfileResponse::from));
    }

    @Transactional
    public BodyProfileResponse save(Account actor, BodyProfileRequest request) {
        int userId = customerId(actor);
        BodyProfileRequest data = validate(request);
        return whenReady(() -> {
            profiles.upsert(userId, data);
            return profiles.findByUserId(userId).map(BodyProfileResponse::from).orElseThrow();
        });
    }

    @Transactional
    public void delete(Account actor) {
        int userId = customerId(actor);
        whenReady(() -> {
            profiles.delete(userId);
            return null;
        });
    }

    /** Kiểm tra và chuẩn hóa dữ liệu (làm tròn 1 chữ số thập phân). Public static để test riêng. */
    public static BodyProfileRequest validate(BodyProfileRequest r) {
        if (r == null) throw invalid("Vui lòng nhập số đo.");
        String gender = r.gender() == null ? "" : r.gender().trim().toUpperCase();
        if (!GENDERS.contains(gender)) throw invalid("Vui lòng chọn giới tính (Nam / Nữ).");
        String fit = r.fitPreference() == null || r.fitPreference().isBlank()
                ? "REGULAR"
                : r.fitPreference().trim().toUpperCase();
        if (!FITS.contains(fit)) throw invalid("Kiểu mặc không hợp lệ.");
        return new BodyProfileRequest(
                gender,
                range(r.heightCm(), "Chiều cao", "cm", 120, 220, true),
                range(r.weightKg(), "Cân nặng", "kg", 30, 200, true),
                range(r.chestCm(), "Vòng ngực", "cm", 60, 150, false),
                range(r.waistCm(), "Vòng eo", "cm", 50, 150, false),
                range(r.hipCm(), "Vòng hông", "cm", 60, 160, false),
                range(r.footLengthCm(), "Chiều dài bàn chân", "cm", 9, 35, false),
                fit);
    }

    private static BigDecimal range(BigDecimal value, String label, String unit, int min, int max, boolean required) {
        if (value == null) {
            if (required) throw invalid(label + " là bắt buộc.");
            return null;
        }
        if (value.compareTo(BigDecimal.valueOf(min)) < 0 || value.compareTo(BigDecimal.valueOf(max)) > 0) {
            throw invalid(label + " phải từ " + min + " đến " + max + " " + unit + ".");
        }
        return value.setScale(1, RoundingMode.HALF_UP);
    }

    private static ApiException invalid(String message) {
        return new ApiException(400, "BODY_PROFILE_INVALID", message);
    }

    /** Số đo là dữ liệu riêng của khách: Owner / Family Member không dùng tính năng này. */
    private static int customerId(Account actor) {
        if (actor == null || !"CUSTOMER".equals(actor.role())) {
            throw new ApiException(403, "CUSTOMER_ONLY", "Chỉ khách hàng mới lưu được số đo cơ thể.");
        }
        return actor.id();
    }

    /** Chưa chạy migration (chưa có bảng body_profile) -> báo lỗi dễ hiểu thay vì lỗi SQL 500. */
    private static <T> T whenReady(Supplier<T> work) {
        try {
            return work.get();
        } catch (BadSqlGrammarException e) {
            throw new ApiException(503, "BODY_PROFILE_UNAVAILABLE",
                    "Tính năng số đo chưa sẵn sàng (chưa tạo bảng body_profile).");
        }
    }
}
