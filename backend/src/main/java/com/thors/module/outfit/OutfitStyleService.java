package com.thors.module.outfit;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.fitting.repository.SizeChartRepository;
import com.thors.module.outfit.OutfitDtos.ProductStyle;
import com.thors.module.outfit.OutfitDtos.ProductStyleRequest;
import com.thors.module.outfit.OutfitDtos.StyleProfile;
import java.time.Year;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/** Thẻ phối đồ của sản phẩm (Owner) + hồ sơ phong cách của khách. */
@Service
public class OutfitStyleService {

    private final OutfitRepository repo;
    private final SizeChartRepository charts;

    public OutfitStyleService(OutfitRepository repo, SizeChartRepository charts) {
        this.repo = repo;
        this.charts = charts;
    }

    /** Thẻ đã gắn; chưa gắn -> thẻ đoán theo tên (guessed = true) để Owner xem rồi sửa. */
    public ProductStyle productStyle(int productId) {
        if (!repo.productExists(productId)) throw new ApiException(404, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm.");
        var saved = repo.styleOf(productId);
        if (saved.isPresent()) {
            return new ProductStyle(OutfitTags.parseCodes(saved.get().occasions(), OutfitTags.OCCASIONS),
                    OutfitTags.parseCodes(saved.get().styles(), OutfitTags.STYLES), false);
        }
        var info = charts.categoryInfo(productId);
        List<String> names = info == null ? List.of() : info.names();
        String name = repo.productName(productId);
        return new ProductStyle(List.copyOf(OutfitTags.guessOccasions(name, names)),
                List.copyOf(OutfitTags.guessStyles(name, names)), true);
    }

    /** Lưu thẻ (bỏ trống cả hai = xóa, quay về tự đoán). */
    public ProductStyle saveProductStyle(int productId, ProductStyleRequest request) {
        if (!repo.productExists(productId)) throw new ApiException(404, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm.");
        String occasions = OutfitTags.joinCodes(request == null ? null : request.occasions(), OutfitTags.OCCASIONS);
        String styles = OutfitTags.joinCodes(request == null ? null : request.styles(), OutfitTags.STYLES);
        if (!repo.saveStyle(productId, occasions, styles)) throw unavailable();
        return productStyle(productId);
    }

    public StyleProfile styleProfile(Account actor) {
        int userId = customerId(actor);
        return repo.styleProfile(userId)
                .map(p -> new StyleProfile(p.birthYear(), p.occupation(),
                        OutfitTags.parseCodes(p.preferredStyles(), OutfitTags.STYLES), colors(p.avoidColors())))
                .orElse(new StyleProfile(null, null, List.of(), List.of()));
    }

    public StyleProfile saveStyleProfile(Account actor, StyleProfile p) {
        int userId = customerId(actor);
        if (p == null) throw invalid("Thiếu dữ liệu.");
        int year = Year.now().getValue();
        if (p.birthYear() != null && (p.birthYear() < year - 100 || p.birthYear() > year - 10)) {
            throw invalid("Năm sinh không hợp lệ.");
        }
        String occupation = p.occupation() == null || p.occupation().isBlank() ? null : p.occupation().trim();
        if (occupation != null && occupation.length() > 60) throw invalid("Nghề nghiệp tối đa 60 ký tự.");
        String avoid = p.avoidColors() == null ? null : p.avoidColors().stream()
                .map(c -> c == null ? "" : c.trim()).filter(c -> !c.isEmpty() && c.length() <= 20).distinct().limit(10)
                .collect(Collectors.joining(","));
        int updated = repo.saveStyleProfile(userId, new OutfitRepository.StyleProfileRow(p.birthYear(), occupation,
                OutfitTags.joinCodes(p.preferredStyles(), OutfitTags.STYLES), avoid == null || avoid.isEmpty() ? null : avoid));
        if (updated < 0) throw unavailable();
        if (updated == 0) throw invalid("Hãy lưu số đo (giới tính, chiều cao, cân nặng) trước khi lưu phong cách.");
        return styleProfile(actor);
    }

    private static List<String> colors(String csv) {
        return csv == null || csv.isBlank() ? List.of() : Arrays.stream(csv.split(",")).map(String::trim).toList();
    }

    private static int customerId(Account actor) {
        if (actor == null || !"CUSTOMER".equals(actor.role())) {
            throw new ApiException(403, "CUSTOMER_ONLY", "Chỉ khách hàng mới lưu được hồ sơ phong cách.");
        }
        return actor.id();
    }

    private static ApiException invalid(String message) {
        return new ApiException(400, "OUTFIT_INVALID", message);
    }

    private static ApiException unavailable() {
        return new ApiException(503, "OUTFIT_UNAVAILABLE", "Tính năng phối đồ chưa sẵn sàng (chưa chạy migration).");
    }
}
