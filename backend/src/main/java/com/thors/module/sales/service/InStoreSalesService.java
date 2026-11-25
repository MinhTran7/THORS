package com.thors.module.sales.service;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.promotion.dto.SalePrice;
import com.thors.module.promotion.service.PricingService;
import com.thors.module.sales.dto.CreateInStoreSaleRequest;
import com.thors.module.sales.dto.InStoreSaleDetailResponse;
import com.thors.module.sales.dto.InStoreSalePageResponse;
import com.thors.module.sales.dto.PriceRange;
import com.thors.module.sales.dto.SellerOption;
import com.thors.module.sales.dto.VariantSale;
import com.thors.module.sales.entity.SaleVariant;
import com.thors.module.sales.repository.InStoreSalesRepository;
import com.thors.security.SessionAccess;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.BiFunction;
import java.util.function.Function;
import java.util.regex.Pattern;

@Service
public class InStoreSalesService {

    private static final int MAX_LINES = 100;
    private static final BigDecimal FAMILY_DISCOUNT_PERCENT = BigDecimal.TEN;
    private static final Pattern REQUEST_ID = Pattern.compile("^[A-Za-z0-9-]{8,64}$");
    private static final ZoneId SHOP_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final InStoreSalesRepository repository;
    private final SessionAccess sessionAccess;
    private final PricingService pricing;

    public InStoreSalesService(InStoreSalesRepository repository, SessionAccess sessionAccess, PricingService pricing) {
        this.repository = repository;
        this.sessionAccess = sessionAccess;
        this.pricing = pricing;
    }

    // ---- Tạo hóa đơn ----

    // READ_COMMITTED: số hàng đang giữ cho đơn online luôn đọc bản mới nhất sau khi khóa biến thể
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public InStoreSaleDetailResponse createSale(CreateInStoreSaleRequest request) {
        Account seller = currentSeller();
        String requestId = validateRequest(request);
        Map<Integer, Integer> quantities = mergeQuantities(request.items());

        // Khóa biến thể theo thứ tự ID (TreeMap) để tránh deadlock, rồi mới kiểm tra bấm lặp
        Map<Integer, SaleVariant> variants = new LinkedHashMap<>();
        for (int detailId : quantities.keySet()) {
            variants.put(detailId, repository.lockVariant(detailId)
                    .orElseThrow(() -> badRequest("Có sản phẩm trong hóa đơn không còn tồn tại. Vui lòng xóa sản phẩm đó và thêm lại.")));
        }
        var existing = repository.findOrderIdByRequest(requestId);
        if (existing.isPresent()) {
            return findSale(existing.get());
        }

        BiFunction<Integer, BigDecimal, SalePrice> quoter = pricing.quoter();
        List<SaleLine> lines = new ArrayList<>();
        for (var entry : quantities.entrySet()) {
            SaleVariant variant = variants.get(entry.getKey());
            checkSellable(variant, entry.getValue());
            lines.add(new SaleLine(variant, entry.getValue(), quoter.apply(variant.productId(), variant.price())));
        }
        BigDecimal subtotal = lines.stream().map(SaleLine::total).reduce(BigDecimal.ZERO, BigDecimal::add);

        if (request.expectedSubtotal().compareTo(subtotal) != 0) {
            throw new ApiException(409, "PRICE_CHANGED",
                    "Giá sản phẩm vừa thay đổi do khuyến mãi. Đã cập nhật lại giá, vui lòng kiểm tra và thanh toán lại.");
        }

        BigDecimal discount = validateDiscount(request.discountAmount(), subtotal, seller);
        String paymentMethod = normalizePaymentMethod(request.paymentMethod());
        BigDecimal total = subtotal.subtract(discount);
        LocalDateTime now = LocalDateTime.now();

        OrderRef order = withUniqueNumber("POS", number ->
                new OrderRef(repository.insertOrder(number, seller.id(), paymentMethod, subtotal, discount, total, now), number));
        int orderId = order.id();
        String reason = "Bán tại cửa hàng " + order.number();
        for (SaleLine line : lines) {
            SaleVariant v = line.variant();
            int orderItemId = repository.insertItem(orderId, v, line.quantity(), line.price());
            if (!repository.deductStock(v.detailId(), line.quantity())) {
                throw badRequest("Tồn kho vừa thay đổi. Vui lòng tải lại sản phẩm và thử lại.");
            }
            repository.insertStockOut(v.detailId(), line.quantity(), reason, seller.id(), orderItemId,
                    InStoreSalesRepository.stockKey(requestId, v.detailId()));
        }

        // Bảng payment yêu cầu amount > 0: đơn giảm 100% không tạo payment
        if (total.signum() > 0) {
            repository.insertPayment(orderId, paymentMethod, total, now);
        }
        withUniqueNumber("INV", number -> {
            repository.insertInvoice(orderId, number, seller.id(), now);
            return number;
        });
        return findSale(orderId);
    }

    // ---- Lịch sử, chi tiết, giá ----

    @Transactional(readOnly = true)
    public InStoreSalePageResponse listSales(String q, LocalDate fromDate, LocalDate toDate, Integer sellerId,
                                             String paymentMethod, int page, int size) {
        currentSeller();
        if (fromDate != null && toDate != null && fromDate.isAfter(toDate)) {
            throw badRequest("Từ ngày không được sau đến ngày.");
        }
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), 50);
        var filter = new InStoreSalesRepository.Filter(
                q == null || q.isBlank() ? null : q.trim(),
                fromDate, toDate,
                sellerId != null && sellerId > 0 ? sellerId : null,
                paymentMethod == null || paymentMethod.isBlank() ? null : normalizePaymentMethod(paymentMethod));

        long total = repository.countSales(filter);
        return new InStoreSalePageResponse(repository.findSales(filter, safeSize, (long) safePage * safeSize),
                total, (int) Math.ceil((double) total / safeSize));
    }

    @Transactional(readOnly = true)
    public InStoreSaleDetailResponse getSaleDetail(int orderId) {
        currentSeller();
        return findSale(orderId);
    }

    @Transactional(readOnly = true)
    public List<SellerOption> listSellers() {
        currentSeller();
        return repository.findSellers();
    }

    // Giá sau khuyến mãi và số còn bán được (đã trừ hàng giữ cho đơn khác) của từng biến thể
    @Transactional(readOnly = true)
    public Map<Integer, VariantSale> variantSales(int productId) {
        currentSeller();
        BiFunction<Integer, BigDecimal, SalePrice> quoter = pricing.quoter();
        Map<Integer, VariantSale> result = new LinkedHashMap<>();
        repository.findVariantStocks(productId).forEach((detailId, v) ->
                result.put(detailId, new VariantSale(quoter.apply(productId, v.price()).price(), v.available())));
        return result;
    }

    // Khoảng giá gốc và giá sau khuyến mãi của từng sản phẩm, dùng ở ô tìm kiếm
    @Transactional(readOnly = true)
    public Map<Integer, PriceRange> salePriceRanges() {
        currentSeller();
        BiFunction<Integer, BigDecimal, SalePrice> quoter = pricing.quoter();
        Map<Integer, PriceRange> result = new LinkedHashMap<>();
        repository.findPriceRanges().forEach((productId, r) -> result.put(productId,
                new PriceRange(r.min(), r.max(), quoter.apply(productId, r.min()).price(), quoter.apply(productId, r.max()).price())));
        return result;
    }

    // ---- Kiểm tra dữ liệu ----

    // Mỗi hóa đơn chờ có một mã riêng; gửi lại cùng mã thì trả đơn đã tạo, không bán lần hai
    private static String validateRequest(CreateInStoreSaleRequest request) {
        if (request == null || request.requestId() == null || !REQUEST_ID.matcher(request.requestId()).matches()) {
            throw badRequest("Mã yêu cầu thanh toán không hợp lệ. Vui lòng tải lại trang.");
        }
        if (request.expectedSubtotal() == null) {
            throw badRequest("Thiếu tổng tiền hàng để đối chiếu giá.");
        }
        return request.requestId();
    }

    // Gộp dòng cùng biến thể; TreeMap giữ thứ tự ID để khóa
    private static Map<Integer, Integer> mergeQuantities(List<CreateInStoreSaleRequest.ItemRequest> items) {
        if (items == null || items.isEmpty()) {
            throw badRequest("Hóa đơn phải có ít nhất một sản phẩm.");
        }
        if (items.size() > MAX_LINES) {
            throw badRequest("Một hóa đơn không được vượt quá " + MAX_LINES + " dòng sản phẩm.");
        }
        Map<Integer, Integer> quantities = new TreeMap<>();
        for (var item : items) {
            if (item == null || item.detailId() == null || item.detailId() <= 0 || item.quantity() == null || item.quantity() <= 0) {
                throw badRequest("Hóa đơn có sản phẩm hoặc số lượng không hợp lệ.");
            }
            try {
                quantities.merge(item.detailId(), item.quantity(), Math::addExact);
            } catch (ArithmeticException ex) {
                throw badRequest("Số lượng sản phẩm vượt giới hạn cho phép.");
            }
        }
        return quantities;
    }

    // Biến thể còn bán, có giá, đủ hàng sau khi trừ phần giữ cho đơn khác
    private static void checkSellable(SaleVariant v, int quantity) {
        if (!v.active()) {
            throw badRequest("Sản phẩm hoặc biến thể đã ngừng hoạt động: " + v.productName());
        }
        if (v.price() == null || v.price().signum() < 0) {
            throw badRequest("Giá bán của sản phẩm không hợp lệ: " + v.productName());
        }
        if (quantity > v.available()) {
            throw badRequest("Không đủ hàng cho " + v.productName() + " (tồn " + v.stockQuantity()
                    + ", đang giữ cho đơn khác " + v.held() + ", cần " + quantity + ").");
        }
    }

    // OWNER giảm tự do; FAMILY_MEMBER tối đa FAMILY_DISCOUNT_PERCENT% tổng tiền hàng
    private static BigDecimal validateDiscount(BigDecimal amount, BigDecimal subtotal, Account seller) {
        BigDecimal discount = amount == null ? BigDecimal.ZERO : amount;
        if (discount.signum() < 0 || discount.stripTrailingZeros().scale() > 0) {
            throw badRequest("Giảm giá phải là số VNĐ nguyên và không âm.");
        }
        discount = discount.setScale(0, RoundingMode.UNNECESSARY);
        if (discount.compareTo(subtotal) > 0) {
            throw badRequest("Giảm giá không được vượt tổng tiền hàng.");
        }
        if ("FAMILY_MEMBER".equals(seller.role())
                && discount.multiply(BigDecimal.valueOf(100)).compareTo(subtotal.multiply(FAMILY_DISCOUNT_PERCENT)) > 0) {
            throw badRequest("Thành viên gia đình chỉ được giảm tối đa " + FAMILY_DISCOUNT_PERCENT + "% tổng tiền hàng.");
        }
        return discount;
    }

    // CASH: tiền mặt; ONLINE: chuyển khoản (theo quy ước của schema)
    private static String normalizePaymentMethod(String method) {
        if (method == null) {
            throw badRequest("Vui lòng chọn phương thức thanh toán.");
        }
        return switch (method.trim().toUpperCase()) {
            case "CASH" -> "CASH";
            case "BANK_TRANSFER", "TRANSFER" -> "ONLINE";
            default -> throw badRequest("Phương thức thanh toán chỉ được là Cash hoặc Bank transfer.");
        };
    }

    // ---- Tiện ích ----

    // Chỉ OWNER và FAMILY_MEMBER được bán tại quầy
    private Account currentSeller() {
        Account seller = sessionAccess.current();
        if (!"OWNER".equals(seller.role()) && !"FAMILY_MEMBER".equals(seller.role())) {
            throw new ApiException(403, "FORBIDDEN", "Chỉ OWNER hoặc FAMILY_MEMBER được bán tại cửa hàng.");
        }
        return seller;
    }

    private InStoreSaleDetailResponse findSale(int orderId) {
        return repository.findSale(orderId).orElseThrow(InStoreSalesService::notFound);
    }

    // Mã đơn/hóa đơn ngẫu nhiên; trùng (rất hiếm) thì sinh mã khác, tối đa 3 lần
    private static <T> T withUniqueNumber(String prefix, Function<String, T> insert) {
        for (int attempt = 1; ; attempt++) {
            try {
                return insert.apply(makeNumber(prefix));
            } catch (DuplicateKeyException ex) {
                if (attempt == 3) {
                    throw ex;
                }
            }
        }
    }

    private static String makeNumber(String prefix) {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase();
        return prefix + "-" + LocalDate.now(SHOP_ZONE).format(DateTimeFormatter.BASIC_ISO_DATE) + "-" + suffix;
    }

    private static ApiException badRequest(String message) {
        return new ApiException(400, "INVALID_SALE", message);
    }

    private static ApiException notFound() {
        return new ApiException(404, "NOT_FOUND", "Không tìm thấy hóa đơn bán hàng tại quầy.");
    }

    private record OrderRef(int id, String number) {
    }

    // Một dòng hóa đơn: price gồm giá gốc, giá sau khuyến mãi và khuyến mãi đã áp dụng
    private record SaleLine(SaleVariant variant, int quantity, SalePrice price) {
        BigDecimal total() {
            return price.price().multiply(BigDecimal.valueOf(quantity));
        }
    }
}
