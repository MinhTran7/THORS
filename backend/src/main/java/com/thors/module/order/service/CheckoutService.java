package com.thors.module.order.service;

import com.thors.module.address.repository.AddressRepository;
import com.thors.module.cart.repository.CartRepository;
import com.thors.module.order.dto.CreateOrderRequest;
import com.thors.module.order.repository.CheckoutRepository;
import com.thors.module.promotion.entity.Promotion;
import com.thors.module.promotion.repository.PromotionRepository;
import com.thors.module.promotion.service.PromotionService;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class CheckoutService {

    private static final BigDecimal SHIPPING_FEE = BigDecimal.ZERO;
    private static final Pattern PHONE = Pattern.compile("^(0|\\+84)\\d{9}$");

    private final CheckoutRepository checkoutRepository;
    private final CartRepository cartRepository;
    private final AddressRepository addressRepository;
    private final PromotionRepository promotionRepository;
    private final PromotionService promotionService;

    public CheckoutService(CheckoutRepository checkoutRepository,
                           CartRepository cartRepository,
                           AddressRepository addressRepository,
                           PromotionRepository promotionRepository,
                           PromotionService promotionService) {
        this.checkoutRepository = checkoutRepository;
        this.cartRepository = cartRepository;
        this.addressRepository = addressRepository;
        this.promotionRepository = promotionRepository;
        this.promotionService = promotionService;
    }

    private record Receiver(String name, String phone, String address) {
    }

    private record Line(int detailId, int quantity, BigDecimal unitPrice, Map<String, Object> detail) {
    }

    @Transactional
    public Map<String, Object> placeOrder(int userId, CreateOrderRequest request) {
        String paymentMethod = "ONLINE".equalsIgnoreCase(request.paymentMethod()) ? "ONLINE" : "COD";

        Receiver receiver = resolveReceiver(userId, request);

        List<Integer> cartItemIds = new ArrayList<>();
        List<Line> lines = new ArrayList<>();
        boolean fromCart = request.cartItemIds() != null && !request.cartItemIds().isEmpty();
        boolean buyNow = request.items() != null && !request.items().isEmpty();
        if (fromCart == buyNow) {
            throw new IllegalArgumentException("Đơn hàng chưa có sản phẩm nào.");
        }

        if (fromCart) {
            for (Integer cartItemId : new LinkedHashSet<>(request.cartItemIds())) {
                if (cartItemId == null || cartItemId <= 0) {
                    throw new IllegalArgumentException("Mã sản phẩm trong giỏ không hợp lệ.");
                }
                Map<String, Object> cartItem = cartRepository.findItem(userId, cartItemId);
                if (cartItem == null) {
                    throw new IllegalArgumentException("Có sản phẩm không còn trong giỏ hàng.");
                }
                int detailId = ((Number) cartItem.get("detailId")).intValue();
                int quantity = ((Number) cartItem.get("quantity")).intValue();
                lines.add(loadLine(detailId, quantity));
                cartItemIds.add(cartItemId);
            }
        } else {
            for (CreateOrderRequest.Item item : request.items()) {
                if (item == null || item.productVariantId() == null || item.productVariantId() <= 0) {
                    throw new IllegalArgumentException("Biến thể sản phẩm không hợp lệ.");
                }
                if (item.quantity() == null || item.quantity() <= 0) {
                    throw new IllegalArgumentException("Số lượng phải lớn hơn 0.");
                }
                lines.add(loadLine(item.productVariantId(), item.quantity()));
            }
        }

        BigDecimal itemsAmount = BigDecimal.ZERO;
        for (Line line : lines) {
            itemsAmount = itemsAmount.add(line.unitPrice().multiply(BigDecimal.valueOf(line.quantity())));
        }

        Integer promotionId = null;
        String promotionName = null;
        BigDecimal promotionDiscount = BigDecimal.ZERO;

        if (request.promotionId() != null) {
            Promotion promo = promotionRepository.lockById(request.promotionId())
                    .orElseThrow(() -> new IllegalArgumentException("Khuyến mãi không tồn tại."));
            if (!promo.isOrderVoucher()) {
                throw new IllegalArgumentException("Giảm giá sản phẩm được áp dụng tự động, không cần chọn mã.");
            }
            LocalDateTime now = LocalDateTime.now();
            if (!"ACTIVE".equals(promo.status()) || now.isBefore(promo.startDate()) || !now.isBefore(promo.endDate())) {
                throw new IllegalArgumentException("Khuyến mãi hiện không khả dụng.");
            }
            if (promo.usageLimit() != null && promotionRepository.countUsage(promo.promotionId()) >= promo.usageLimit()) {
                throw new IllegalArgumentException("Khuyến mãi đã hết lượt sử dụng.");
            }
            if (itemsAmount.compareTo(promo.minOrderValue()) < 0) {
                throw new IllegalArgumentException("Đơn hàng chưa đạt giá trị tối thiểu để áp dụng khuyến mãi.");
            }

            promotionDiscount = promo.discountOf(itemsAmount);
            promotionId = promo.promotionId();
            promotionName = promo.name();
        }

        BigDecimal total = itemsAmount.subtract(promotionDiscount).add(SHIPPING_FEE);

        int orderId = 0;
        String orderNumber = null;
        for (int attempt = 0; attempt < 3 && orderId == 0; attempt++) {
            orderNumber = newOrderNumber();
            try {
                orderId = checkoutRepository.insertOrder(orderNumber, userId,
                        receiver.name(), receiver.phone(), receiver.address(),
                        itemsAmount, SHIPPING_FEE, total, paymentMethod,
                        promotionId, promotionName, promotionDiscount);
            } catch (DuplicateKeyException ex) {
                if (attempt == 2) throw ex;
            }
        }

        for (Line line : lines) {
            Map<String, Object> d = line.detail();
            checkoutRepository.insertItem(orderId, line.detailId(), line.quantity(), line.unitPrice(),
                    String.valueOf(d.get("productName")), String.valueOf(d.get("size")), String.valueOf(d.get("color")));
        }

        for (Integer cartItemId : cartItemIds) {
            cartRepository.deleteItem(userId, cartItemId);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", orderId);
        result.put("orderNumber", orderNumber);
        result.put("totalAmount", total);
        result.put("paymentMethod", paymentMethod);
        if (promotionDiscount.compareTo(BigDecimal.ZERO) > 0) {
            result.put("discountAmount", promotionDiscount);
            result.put("promotionName", promotionName);
        }
        return result;
    }

    private Line loadLine(int detailId, int quantity) {
        Map<String, Object> detail = checkoutRepository.findDetailForOrder(detailId);
        if (detail == null) {
            throw new IllegalArgumentException("Không tìm thấy sản phẩm.");
        }
        String name = String.valueOf(detail.get("productName"));
        if (!isTrue(detail.get("available"))) {
            throw new IllegalArgumentException("\"" + name + "\" hiện không được bán online.");
        }
        int stock = ((Number) detail.get("stock")).intValue();
        if (quantity > stock) {
            throw new IllegalArgumentException("\"" + name + "\" chỉ còn " + stock + " sản phẩm trong kho.");
        }
        BigDecimal unitPrice = promotionService.salePrice(((Number) detail.get("productId")).intValue(), toMoney(detail.get("price")));
        return new Line(detailId, quantity, unitPrice, detail);
    }

    private Receiver resolveReceiver(int userId, CreateOrderRequest request) {
        if (request.shippingAddressId() != null) {
            Map<String, Object> a = addressRepository.findOne(userId, request.shippingAddressId());
            if (a == null) {
                throw new IllegalArgumentException("Địa chỉ nhận hàng không hợp lệ.");
            }
            return new Receiver(
                    limit(str(a.get("recipientName")), 100),
                    limit(str(a.get("phone")), 15),
                    limit(joinAddress(str(a.get("addressDetail")), str(a.get("wardName")), str(a.get("provinceName"))), 255));
        }
        CreateOrderRequest.ShippingAddressInput in = request.shippingAddress();
        if (in == null) {
            throw new IllegalArgumentException("Vui lòng chọn địa chỉ nhận hàng.");
        }
        String name = required(in.recipientName(), "Vui lòng nhập họ tên người nhận.");
        String phone = required(in.phone(), "Vui lòng nhập số điện thoại.");
        if (!PHONE.matcher(phone).matches()) {
            throw new IllegalArgumentException("Số điện thoại không hợp lệ.");
        }
        String province = required(in.provinceName(), "Vui lòng chọn tỉnh / thành phố.");
        String ward = required(in.wardName(), "Vui lòng chọn phường / xã.");
        String detail = required(in.addressDetail(), "Vui lòng nhập địa chỉ cụ thể.");
        return new Receiver(limit(name, 100), limit(phone, 15), limit(joinAddress(detail, ward, province), 255));
    }

    private String newOrderNumber() {
        String date = LocalDate.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh")).format(DateTimeFormatter.BASIC_ISO_DATE);
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase();
        return "ORD-" + date + "-" + suffix;
    }

    private String joinAddress(String detail, String ward, String province) {
        List<String> parts = new ArrayList<>();
        for (String p : new String[] {detail, ward, province}) {
            if (p != null && !p.isBlank()) parts.add(p.trim());
        }
        return String.join(", ", parts);
    }

    private String required(String value, String message) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(message);
        }
        return value.trim();
    }

    private String str(Object value) {
        return value == null ? "" : value.toString();
    }

    private String limit(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }

    private BigDecimal toMoney(Object value) {
        return value instanceof BigDecimal b ? b : new BigDecimal(String.valueOf(value));
    }

    private boolean isTrue(Object value) {
        if (value instanceof Boolean b) return b;
        return value instanceof Number n && n.intValue() == 1;
    }
}
