package com.thors.module.tryon;

import com.thors.common.ApiException;
import com.thors.module.fitting.service.StandardSizeCharts.Kind;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/**
 * Sắp các món khách chọn thành thứ tự "mặc" cho AI (không gọi DB, dễ kiểm thử).
 *
 * <ul>
 *   <li>Mỗi lần thử 1-3 món, mỗi loại (áo / quần / đầm) tối đa 1 món.</li>
 *   <li>Giày dép, phụ kiện: dịch vụ thử đồ không vẽ được -> bỏ qua (giao diện hiện ảnh sản phẩm bên cạnh).</li>
 *   <li>Đầm không đi cùng quần (đầm đã gồm cả phần dưới).</li>
 *   <li>Thứ tự: quần / đầm trước, áo sau (áo phủ lên trên cạp quần, áo khoác phủ lên đầm).</li>
 * </ul>
 */
public final class TryOnPlan {

    /** Loại món gửi cho AI (khớp cột tryon_job_item.garment). */
    public enum Garment { TOP, BOTTOM, DRESS }

    public static final int MAX_ITEMS = 3;

    /** Một món khách chọn: loại hàng suy ra từ danh mục (StandardSizeCharts.detectKind). */
    public record Pick(int productId, String productName, Kind kind) {
    }

    /** Một bước mặc: món + loại gửi cho AI, theo đúng thứ tự. */
    public record Step(int productId, String productName, Garment garment) {
    }

    /** steps: các món sẽ vẽ; skipped: tên các món bỏ qua (giày dép...) để báo cho khách. */
    public record Result(List<Step> steps, List<String> skipped) {
    }

    private TryOnPlan() {
    }

    public static Result plan(List<Pick> picks) {
        if (picks == null || picks.isEmpty()) {
            throw new ApiException(400, "TRYON_NO_ITEM", "Hãy chọn ít nhất 1 món để mặc thử.");
        }
        if (picks.size() > MAX_ITEMS) {
            throw new ApiException(400, "TRYON_TOO_MANY", "Mỗi lần mặc thử tối đa " + MAX_ITEMS + " món.");
        }
        List<Step> steps = new ArrayList<>();
        List<String> skipped = new ArrayList<>();
        Set<Garment> used = EnumSet.noneOf(Garment.class);
        for (Pick p : picks) {
            Garment g = garmentOf(p.kind());
            if (g == null) {
                skipped.add(p.productName());
                continue;
            }
            if (!used.add(g)) {
                throw new ApiException(400, "TRYON_DUPLICATE_KIND",
                        "Mỗi lần chỉ mặc thử được 1 " + label(g) + ".");
            }
            steps.add(new Step(p.productId(), p.productName(), g));
        }
        if (used.contains(Garment.DRESS) && used.contains(Garment.BOTTOM)) {
            throw new ApiException(400, "TRYON_DRESS_WITH_BOTTOM", "Đầm / váy liền không mặc thử cùng quần được.");
        }
        if (steps.isEmpty()) {
            throw new ApiException(400, "TRYON_UNSUPPORTED",
                    "Chưa mặc thử được loại hàng này (chỉ hỗ trợ áo, quần, đầm / váy).");
        }
        steps.sort(Comparator.comparingInt(s -> order(s.garment())));
        return new Result(List.copyOf(steps), List.copyOf(skipped));
    }

    /** Loại hàng theo danh mục -> loại món của AI; null = không vẽ được (giày dép, chưa nhận ra loại). */
    static Garment garmentOf(Kind kind) {
        if (kind == null) return null;
        return switch (kind) {
            case TOP -> Garment.TOP;
            case BOTTOM -> Garment.BOTTOM;
            case DRESS -> Garment.DRESS;
            case SHOES, NONE -> null;
        };
    }

    private static int order(Garment g) {
        return switch (g) {
            case BOTTOM, DRESS -> 0;
            case TOP -> 1;
        };
    }

    private static String label(Garment g) {
        return switch (g) {
            case TOP -> "áo";
            case BOTTOM -> "quần";
            case DRESS -> "đầm / váy";
        };
    }
}
