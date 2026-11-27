package com.thors.module.sales.service;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.sales.dto.CreateInStoreSaleRequest;
import com.thors.module.sales.entity.SaleVariant;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Pattern;

@Component
public class InStoreSaleValidator {

    private static final int MAX_LINES = 100;
    private static final BigDecimal FAMILY_DISCOUNT_PERCENT = BigDecimal.TEN;
    private static final Pattern REQUEST_ID = Pattern.compile("^[A-Za-z0-9-]{8,64}$");

    // Mỗi hóa đơn chờ có một mã riêng; gửi lại cùng mã thì trả đơn đã tạo, không bán lần hai
    public String requestId(String requestId) {
        if (requestId == null || !REQUEST_ID.matcher(requestId).matches()) {
            throw invalid("Mã yêu cầu thanh toán không hợp lệ. Vui lòng tải lại trang.");
        }
        return requestId;
    }

    // Gộp dòng cùng biến thể; TreeMap giữ thứ tự ID để khóa biến thể không deadlock
    public Map<Integer, Integer> quantities(List<CreateInStoreSaleRequest.ItemRequest> items) {
        if (items == null || items.isEmpty()) {
            throw invalid("Hóa đơn phải có ít nhất một sản phẩm.");
        }
        if (items.size() > MAX_LINES) {
            throw invalid("Một hóa đơn không được vượt quá " + MAX_LINES + " dòng sản phẩm.");
        }
        Map<Integer, Integer> quantities = new TreeMap<>();
        for (var item : items) {
            if (item == null || item.detailId() == null || item.detailId() <= 0 || item.quantity() == null || item.quantity() <= 0) {
                throw invalid("Hóa đơn có sản phẩm hoặc số lượng không hợp lệ.");
            }
            try {
                quantities.merge(item.detailId(), item.quantity(), Math::addExact);
            } catch (ArithmeticException ex) {
                throw invalid("Số lượng sản phẩm vượt giới hạn cho phép.");
            }
        }
        return quantities;
    }

    // Biến thể còn bán, có giá, đủ hàng sau khi trừ phần giữ cho đơn khác
    public void sellable(SaleVariant v, int quantity) {
        if (!v.active()) {
            throw invalid("Sản phẩm hoặc biến thể đã ngừng hoạt động: " + v.productName());
        }
        if (v.price() == null || v.price().signum() < 0) {
            throw invalid("Giá bán của sản phẩm không hợp lệ: " + v.productName());
        }
        if (quantity > v.available()) {
            throw invalid("Không đủ hàng cho " + v.productName() + " (tồn " + v.stockQuantity()
                    + ", đang giữ cho đơn khác " + v.held() + (v.defective() > 0 ? ", đang báo lỗi " + v.defective() : "")
                    + ", cần " + quantity + ").");
        }
    }

    public void samePrice(BigDecimal expectedSubtotal, BigDecimal subtotal) {
        if (expectedSubtotal == null) {
            throw invalid("Thiếu tổng tiền hàng để đối chiếu giá.");
        }
        if (expectedSubtotal.compareTo(subtotal) != 0) {
            throw new ApiException(409, "PRICE_CHANGED",
                    "Giá sản phẩm vừa thay đổi do khuyến mãi. Đã cập nhật lại giá, vui lòng kiểm tra và thanh toán lại.");
        }
    }

    // OWNER giảm tự do; FAMILY_MEMBER tối đa FAMILY_DISCOUNT_PERCENT% tổng tiền hàng
    public BigDecimal discount(BigDecimal amount, BigDecimal subtotal, Account seller) {
        BigDecimal discount = amount == null ? BigDecimal.ZERO : amount;
        if (discount.signum() < 0 || discount.stripTrailingZeros().scale() > 0) {
            throw invalid("Giảm giá phải là số VNĐ nguyên và không âm.");
        }
        discount = discount.setScale(0, RoundingMode.UNNECESSARY);
        if (discount.compareTo(subtotal) > 0) {
            throw invalid("Giảm giá không được vượt tổng tiền hàng.");
        }
        if ("FAMILY_MEMBER".equals(seller.role())
                && discount.multiply(BigDecimal.valueOf(100)).compareTo(subtotal.multiply(FAMILY_DISCOUNT_PERCENT)) > 0) {
            throw invalid("Thành viên gia đình chỉ được giảm tối đa " + FAMILY_DISCOUNT_PERCENT + "% tổng tiền hàng.");
        }
        return discount;
    }

    // CASH: tiền mặt; ONLINE: chuyển khoản (theo quy ước của schema)
    public String paymentMethod(String method) {
        if (method == null) {
            throw invalid("Vui lòng chọn phương thức thanh toán.");
        }
        return switch (method.trim().toUpperCase(Locale.ROOT)) {
            case "CASH" -> "CASH";
            case "TRANSFER" -> "ONLINE";
            default -> throw invalid("Phương thức thanh toán chỉ được là tiền mặt hoặc chuyển khoản.");
        };
    }

    public void transferAmount(String paymentMethod, BigDecimal total) {
        if ("ONLINE".equals(paymentMethod) && total.signum() == 0) {
            throw invalid("Hóa đơn 0 đ không cần chuyển khoản, vui lòng chọn tiền mặt.");
        }
    }

    public void dateRange(LocalDate fromDate, LocalDate toDate) {
        if (fromDate != null && toDate != null && fromDate.isAfter(toDate)) {
            throw invalid("Từ ngày không được sau đến ngày.");
        }
    }

    private static ApiException invalid(String message) {
        return new ApiException(400, "INVALID_SALE", message);
    }
}
