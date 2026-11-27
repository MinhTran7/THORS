package com.thors.module.imagesearch.service;

import com.thors.common.ApiException;
import com.thors.module.imagesearch.color.ColorClassifier;
import com.thors.module.imagesearch.color.ColorNames;
import com.thors.module.imagesearch.color.ProductGroup;
import com.thors.module.imagesearch.color.TypeClassifier;
import com.thors.module.imagesearch.config.ImageSearchProperties;
import com.thors.module.imagesearch.model.ImageDecoder;
import com.thors.module.imagesearch.model.ImageEncoder;
import com.thors.module.imagesearch.repository.ImageSearchRepository;
import com.thors.module.imagesearch.repository.ImageSearchRepository.ProductRoot;
import com.thors.module.imagesearch.service.CatalogIndex.ProductScore;
import com.thors.module.imagesearch.service.ImageSearchResult.ColorStock;
import com.thors.module.imagesearch.service.ImageSearchResult.DetectedColor;
import com.thors.module.imagesearch.service.ImageSearchResult.Product;
import com.thors.module.shop.repository.ShopRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Tìm sản phẩm bằng ảnh khách chụp. Ảnh chỉ xử lý trong bộ nhớ, không lưu lại.
 *
 * Điểm giống = trung bình điểm ảnh gốc và điểm ảnh đã xóa nền (xem CatalogIndex, BackgroundRemover).
 * Cách quyết định (theo báo cáo đánh giá lần 4, 15/11/2026), theo điểm giống của sản phẩm hạng 1:
 *  - >= 0,85 (confident-threshold): khẳng định "shop có mẫu này" kèm màu / tồn kho.
 *  - 0,808 (match-threshold) .. 0,85: "có sản phẩm khá giống" (SIMILAR), không khẳng định cùng mẫu.
 *    Lý do: dép xám trơn (shop không bán) được 0,834 với Dép Bánh Mì; nâng hẳn ngưỡng lên thì mất nhiều ảnh đúng.
 *  - < 0,808: chưa có mẫu này.
 *  - Luôn trả kèm các sản phẩm gần giống cùng danh mục gốc (Dép / Giày / Balo...) với sản phẩm hạng 1,
 *    vì kể cả ảnh mờ / lệch, hạng 1 vẫn đúng ~93%.
 *  - Chỉ nói "không có màu này" khi AI chắc về màu (>= 60%) và mọi màu trong DB đều quy đổi được.
 */
@Service
public class ImageSearchService {

    private final ImageSearchEngine engine;
    private final ImageSearchProperties props;
    private final ImageSearchRepository repository;
    private final ShopRepository shopRepository;
    private final ColorClassifier colors;
    /** Đoán loại hàng (danh mục gốc) trong ảnh khách; null = không dùng. */
    private final Function<float[], TypeClassifier.Guess> types;
    private final Semaphore slots;

    @Autowired
    public ImageSearchService(ImageSearchEngine engine, ImageSearchProperties props, ImageSearchRepository repository,
                              ShopRepository shopRepository) {
        this(engine, props, repository, shopRepository, ColorClassifier.loadDefault(), TypeClassifier.loadDefault()::guess);
    }

    ImageSearchService(ImageSearchEngine engine, ImageSearchProperties props, ImageSearchRepository repository,
                       ShopRepository shopRepository, ColorClassifier colors) {
        this(engine, props, repository, shopRepository, colors, null);
    }

    ImageSearchService(ImageSearchEngine engine, ImageSearchProperties props, ImageSearchRepository repository,
                       ShopRepository shopRepository, ColorClassifier colors, Function<float[], TypeClassifier.Guess> types) {
        this.engine = engine;
        this.props = props;
        this.repository = repository;
        this.shopRepository = shopRepository;
        this.colors = colors;
        this.types = types;
        this.slots = new Semaphore(Math.max(1, props.getMaxConcurrentSearches()));
    }

    /** Trạng thái để giao diện biết có hiện nút chụp ảnh hay không. */
    public Map<String, Object> status() {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("enabled", engine.state() != ImageSearchEngine.State.DISABLED);
        s.put("ready", engine.state() == ImageSearchEngine.State.READY);
        s.put("message", engine.message());
        return s;
    }

    public ImageSearchResult search(byte[] upload) {
        if (engine.state() == ImageSearchEngine.State.DISABLED) {
            throw new ApiException(404, "IMAGE_SEARCH_DISABLED", "Tính năng tìm bằng ảnh chưa được bật.");
        }
        if (engine.state() != ImageSearchEngine.State.READY || engine.encoder() == null) {
            throw new ApiException(503, "IMAGE_SEARCH_NOT_READY",
                    "Tính năng tìm bằng ảnh đang khởi động, vui lòng thử lại sau ít phút.");
        }
        if (upload == null || upload.length == 0) {
            throw new ApiException(400, "IMAGE_REQUIRED", "Vui lòng chọn hoặc chụp một ảnh.");
        }
        if (upload.length > props.getMaxUploadBytes()) {
            throw new ApiException(400, "IMAGE_TOO_LARGE", "Ảnh quá lớn, vui lòng chọn ảnh nhỏ hơn 8 MB.");
        }
        BufferedImage image;
        try {
            image = ImageDecoder.decode(upload);
        } catch (IOException e) {
            throw new ApiException(400, "IMAGE_INVALID", "Không đọc được ảnh. Vui lòng chụp lại hoặc chọn ảnh JPG / PNG.");
        }
        ImageEncoder.Vectors vectors;
        boolean acquired = false;
        try {
            acquired = slots.tryAcquire(3, TimeUnit.SECONDS);
            if (!acquired) {
                throw new ApiException(429, "IMAGE_SEARCH_BUSY", "Hệ thống đang bận, vui lòng thử lại sau vài giây.");
            }
            vectors = engine.encoder().encodeBoth(image);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(503, "IMAGE_SEARCH_BUSY", "Hệ thống đang bận, vui lòng thử lại.");
        } finally {
            if (acquired) slots.release();
        }
        return answer(vectors);
    }

    ImageSearchResult answer(ImageEncoder.Vectors vectors) {
        List<ProductScore> ranked = engine.index().rank(vectors);
        // Sản phẩm vừa bị ẩn khỏi web (chưa kịp cập nhật chỉ mục) thì bỏ qua
        Map<Integer, ProductRoot> roots = repository.findVisibleProductRoots().stream()
                .collect(Collectors.toMap(ProductRoot::productId, r -> r, (a, b) -> a));
        List<ProductScore> visible = ranked.stream().filter(s -> roots.containsKey(s.productId())).toList();

        ProductScore best = visible.isEmpty() ? null : visible.get(0);
        boolean matched = best != null && best.score() >= props.getMatchThreshold();
        // Gợi ý chỉ lấy sản phẩm cùng danh mục gốc (chụp dép thì gợi ý dép, không gợi ý áo).
        ProductRoot root = suggestionRoot(best, matched, roots, vectors);
        List<ProductScore> picked = visible.stream()
                .skip(matched ? 1 : 0)
                .filter(s -> roots.get(s.productId()).rootCategoryId() == root.rootCategoryId())
                .limit(props.getSuggestions())
                .toList();
        List<Integer> ids = new ArrayList<>(picked.stream().map(ProductScore::productId).toList());
        if (matched) ids.add(0, best.productId());
        Map<Integer, Map<String, Object>> cards = repository.findProductCards(ids).stream()
                .collect(Collectors.toMap(r -> ((Number) r.get("productId")).intValue(), r -> r, (a, b) -> a));
        List<Product> suggestions = picked.stream()
                .filter(s -> cards.containsKey(s.productId()))
                .map(s -> card(cards.get(s.productId()), s.score(), null))
                .toList();
        String category = root == null || root.rootCategoryName().isBlank() ? null : root.rootCategoryName();
        if (!matched || !cards.containsKey(best.productId())) {
            return new ImageSearchResult("NOT_FOUND",
                    suggestions.isEmpty() ? "Shop chưa có mẫu này."
                            : "Shop chưa có mẫu này. Bạn có thể xem các sản phẩm khác bên dưới.",
                    null, null, suggestions, category);
        }

        Map<String, Object> bestCard = cards.get(best.productId());
        List<ColorTotal> totals = colorTotals(shopRepository.findVariants(best.productId()));
        if (best.score() < Math.max(props.getConfidentThreshold(), props.getMatchThreshold())) {
            // Giống nhưng chưa đủ chắc là cùng mẫu: hiện sản phẩm giống nhất, không khẳng định, không kết luận về màu
            List<ColorStock> plain = totals.stream().map(t -> new ColorStock(t.color(), t.stock(), false)).toList();
            return new ImageSearchResult("SIMILAR",
                    "Sản phẩm giống nhất trong shop là \"" + str(bestCard.get("productName"))
                            + "\", nhưng có thể không phải cùng mẫu. Bạn so lại ảnh giúp nhé.",
                    card(bestCard, best.score(), plain), null, suggestions, category);
        }
        ProductGroup group = ProductGroup.of(str(bestCard.get("categoryName")), str(bestCard.get("productName")));
        // Màu đoán trên ảnh gốc (cách đã đánh giá ở lần 1-4)
        ColorClassifier.Guess guess = colors.guess(vectors.original(), group);
        Decision d = decide(guess, totals, props.getColorConfidence());

        List<ColorStock> colorStocks = totals.stream()
                .map(t -> new ColorStock(t.color(), t.stock(), d.colorChecked() && guess.family().equals(t.family())))
                .toList();
        DetectedColor detected = guess == null ? null
                : new DetectedColor(guess.name(), round(guess.probability()), d.colorChecked());
        return new ImageSearchResult(d.status(), d.message(), card(bestCard, best.score(), colorStocks), detected, suggestions, category);
    }

    /**
     * Danh mục gốc để lấy gợi ý. Đã tìm thấy (>= match-threshold): danh mục của sản phẩm đó.
     * Chưa có mẫu này: danh mục theo loại hàng AI đoán trong ảnh (nếu shop có danh mục đó), vì sản phẩm hạng 1 có thể
     * khác loại - giày da trắng (giay1.jpg) giống ảnh balo da trắng của p55 hơn giày của shop.
     */
    private ProductRoot suggestionRoot(ProductScore best, boolean matched, Map<Integer, ProductRoot> roots,
                                       ImageEncoder.Vectors vectors) {
        ProductRoot top = best == null ? null : roots.get(best.productId());
        if (matched || types == null || roots.isEmpty()) {
            return top;
        }
        String guessed = ProductGroup.fold(types.apply(vectors.original()).type());
        return roots.values().stream()
                .filter(r -> ProductGroup.fold(r.rootCategoryName()).equals(guessed))
                .findFirst()
                .orElse(top);
    }

    // ------------------------------------------------------------------ quyết định trạng thái (tách riêng để test)

    /** Tổng tồn kho còn bán được theo từng màu trong DB. family = nhóm màu (null nếu không nhận ra tên màu). */
    record ColorTotal(String color, String family, int stock) {}

    record Decision(String status, String message, boolean colorChecked) {}

    static Decision decide(ColorClassifier.Guess guess, List<ColorTotal> totals, double colorConfidence) {
        boolean colorUsable = guess != null
                && guess.probability() >= colorConfidence
                && !totals.isEmpty()
                && totals.stream().allMatch(t -> t.family() != null);
        int allStock = totals.stream().mapToInt(ColorTotal::stock).sum();
        String inStock = names(totals.stream().filter(t -> t.stock() > 0).toList());

        if (!colorUsable) {
            return allStock > 0
                    ? new Decision("AVAILABLE", "Shop có mẫu này và đang còn hàng" + (inStock.isEmpty() ? "." : " (màu " + inStock + ")."), false)
                    : new Decision("OUT_OF_STOCK", "Shop có mẫu này nhưng hiện đang hết hàng.", false);
        }
        List<ColorTotal> same = totals.stream().filter(t -> guess.family().equals(t.family())).toList();
        if (same.isEmpty()) {
            return new Decision("COLOR_UNAVAILABLE", "Shop có mẫu này nhưng không có màu " + guess.name().toLowerCase()
                    + (inStock.isEmpty()
                            ? ". Shop chỉ bán màu " + names(totals) + " và hiện đang hết hàng."
                            : ". Màu còn hàng: " + inStock + "."), true);
        }
        int sameStock = same.stream().mapToInt(ColorTotal::stock).sum();
        if (sameStock > 0) {
            return new Decision("AVAILABLE", "Shop có mẫu này, còn hàng màu " + names(same) + ".", true);
        }
        return new Decision("OUT_OF_STOCK", "Shop có mẫu này nhưng màu " + names(same) + " đang hết hàng"
                + (inStock.isEmpty() ? "." : ". Màu còn hàng: " + inStock + "."), true);
    }

    static List<ColorTotal> colorTotals(List<Map<String, Object>> variants) {
        Map<String, Integer> stockByColor = new LinkedHashMap<>();
        Map<String, String> display = new HashMap<>();
        for (Map<String, Object> v : variants) {
            String color = str(v.get("color")).trim();
            if (color.isEmpty()) continue;
            String key = ProductGroup.fold(color);
            display.putIfAbsent(key, color);
            Object s = v.get("stock");
            stockByColor.merge(key, s instanceof Number n ? n.intValue() : 0, Integer::sum);
        }
        List<ColorTotal> out = new ArrayList<>();
        stockByColor.forEach((k, stock) -> {
            String name = display.get(k);
            out.add(new ColorTotal(name, ColorNames.familyOf(name), stock));
        });
        return out;
    }

    private static String names(List<ColorTotal> list) {
        return list.stream().map(ColorTotal::color).distinct().collect(Collectors.joining(", "));
    }

    private static Product card(Map<String, Object> row, double score, List<ColorStock> colorStocks) {
        return new Product(
                ((Number) row.get("productId")).intValue(),
                str(row.get("productName")),
                str(row.get("categoryName")),
                (String) row.get("imageUrl"),
                decimal(row.get("minPrice")),
                decimal(row.get("maxPrice")),
                round(score),
                colorStocks);
    }

    private static BigDecimal decimal(Object o) {
        if (o == null) return null;
        return o instanceof BigDecimal b ? b : new BigDecimal(o.toString());
    }

    private static String str(Object o) {
        return Objects.toString(o, "");
    }

    private static double round(double v) {
        return Math.round(v * 1000) / 1000.0;
    }
}
