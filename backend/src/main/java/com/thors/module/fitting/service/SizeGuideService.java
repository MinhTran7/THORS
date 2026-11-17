package com.thors.module.fitting.service;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.fitting.dto.BodyProfileRequest;
import com.thors.module.fitting.dto.SizeGuide;
import com.thors.module.fitting.entity.BodyProfile;
import com.thors.module.fitting.entity.SizeChartRow;
import com.thors.module.fitting.repository.BodyProfileRepository;
import com.thors.module.fitting.repository.SizeChartRepository;
import com.thors.module.shop.repository.ShopRepository;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * Gợi ý size trên trang sản phẩm của cửa hàng: ghép bảng size + số đo khách + tồn kho rồi gọi SizeRecommender.
 * Tồn kho dùng lại ShopRepository.findVariants (cùng cách tính "còn bán được" với trang sản phẩm).
 */
@Service
public class SizeGuideService {

    private final SizeChartRepository charts;
    private final BodyProfileRepository profiles;
    private final ShopRepository shop;

    public SizeGuideService(SizeChartRepository charts, BodyProfileRepository profiles, ShopRepository shop) {
        this.charts = charts;
        this.profiles = profiles;
        this.shop = shop;
    }

    /**
     * @param actor khách đang đăng nhập (null = khách vãng lai)
     * @param custom số đo khách tự nhập để thử (null = dùng số đo đã lưu)
     */
    public SizeGuide guide(int productId, Account actor, BodyProfileRequest custom) {
        if (shop.findProduct(productId) == null) {
            throw new ApiException(404, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm.");
        }
        List<Map<String, Object>> variants = shop.findVariants(productId);
        var info = charts.categoryInfo(productId);
        var kind = StandardSizeCharts.detectKind(info == null ? List.of() : info.names());

        List<SizeChartRow> chart = List.of();
        try {
            chart = SizeChartService.whenReady(() -> charts.findByProduct(productId));
        } catch (ApiException e) {
            // chưa chạy migration bảng size: vẫn dùng được bảng size chuẩn bên dưới
        }
        // Chưa có bảng size riêng -> bảng size chuẩn theo danh mục (ước lượng, giao diện ghi rõ)
        boolean standard = false;
        if (chart.isEmpty()) {
            List<String> sizes = variants.stream().map(v -> String.valueOf(v.get("size"))).distinct().toList();
            chart = StandardSizeCharts.rowsFor(kind, info == null ? null : info.targetGroup(),
                    StandardSizeCharts.sortSizes(sizes));
            standard = !chart.isEmpty();
        }

        Optional<BodyProfileRequest> saved = savedProfile(actor);
        BodyProfileRequest body = custom != null ? validate(custom) : saved.orElse(null);
        if (chart.isEmpty() || body == null) {
            return new SizeGuide(chart, null, saved.isPresent(), standard, kind.name());
        }
        var recommendation = SizeRecommender.recommend(chart, body, sizesInStock(variants), custom == null);
        return new SizeGuide(chart, recommendation, saved.isPresent(), standard, kind.name());
    }

    private Optional<BodyProfileRequest> savedProfile(Account actor) {
        if (actor == null || !"CUSTOMER".equals(actor.role())) return Optional.empty();
        try {
            return profiles.findByUserId(actor.id()).map(SizeGuideService::toRequest);
        } catch (org.springframework.jdbc.BadSqlGrammarException e) {
            return Optional.empty(); // chưa có bảng body_profile
        }
    }

    private static BodyProfileRequest toRequest(BodyProfile p) {
        return new BodyProfileRequest(p.gender(), p.heightCm(), p.weightKg(), p.chestCm(), p.waistCm(), p.hipCm(),
                p.footLengthCm(), p.fitPreference());
    }

    /** Số đo khách tự nhập: dùng chung luật kiểm tra với "Số đo của tôi" (giới tính không ảnh hưởng chọn size). */
    private static BodyProfileRequest validate(BodyProfileRequest r) {
        String gender = r.gender() == null || r.gender().isBlank() ? "FEMALE" : r.gender();
        return BodyProfileService.validate(new BodyProfileRequest(gender, r.heightCm(), r.weightKg(), r.chestCm(),
                r.waistCm(), r.hipCm(), r.footLengthCm(), r.fitPreference()));
    }

    /** Size còn ít nhất một màu bán online còn hàng. */
    private static Set<String> sizesInStock(List<Map<String, Object>> variants) {
        return variants.stream()
                .filter(v -> v.get("stock") instanceof Number n && n.intValue() > 0)
                .map(v -> String.valueOf(v.get("size")))
                .collect(Collectors.toSet());
    }
}
