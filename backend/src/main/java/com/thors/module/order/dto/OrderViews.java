package com.thors.module.order.dto;

import java.time.LocalDateTime;
import java.util.List;

public class OrderViews {

    /** Một dòng sản phẩm rút gọn trong danh sách đơn: ảnh, tên, phân loại, số lượng, giá. */
    public record Preview(
            String productName,
            String size,
            String color,
            int quantity,
            long unitPrice,
            String imageUrl,
            // Biến thể đã mua, dùng cho nút "Mua lại" (thêm lại vào giỏ)
            int detailId) {}

    /** Một dòng trong danh sách đơn hàng. */
    public record ListItem(
            int id,
            String orderNumber,
            LocalDateTime orderDate,
            String orderStatus,
            String preparationStatus,
            String paymentMethod,
            String paymentStatus,
            long totalAmount,
            String deliveryName,
            String deliveryPhone,
            String deliveryAddress,
            long itemCount,
            String firstItemName,
            String shippingCarrier,
            List<Preview> lines,
            // Chỉ có khi khách xem đơn của mình: hạn cuối được yêu cầu trả hàng (giao thành công + 7 ngày,
            // null = đơn chưa giao / không còn trả được) và trạng thái yêu cầu trả hàng mới nhất (null = chưa có)
            LocalDateTime returnDeadline,
            String returnStatus) {

        public ListItem withLines(List<Preview> newLines) {
            return new ListItem(
                    id, orderNumber, orderDate, orderStatus, preparationStatus, paymentMethod, paymentStatus,
                    totalAmount, deliveryName, deliveryPhone, deliveryAddress, itemCount, firstItemName,
                    shippingCarrier, newLines, returnDeadline, returnStatus);
        }

        public ListItem withReturn(LocalDateTime deadline, String status) {
            return new ListItem(
                    id, orderNumber, orderDate, orderStatus, preparationStatus, paymentMethod, paymentStatus,
                    totalAmount, deliveryName, deliveryPhone, deliveryAddress, itemCount, firstItemName,
                    shippingCarrier, lines, deadline, status);
        }
    }

    public record Page(List<ListItem> items, int page, int size, long total, int totalPages) {}

    public record Line(
            int orderItemId,
            int detailId,
            Integer productId,
            String productName,
            String size,
            String color,
            int quantity,
            long unitPrice,
            long lineTotal,
            String imageUrl) {}

    /** Thông tin vận chuyển; null khi đơn chưa có thông tin giao vận. */
    public record Shipment(
            String carrier,
            String trackingNumber,
            String status,
            LocalDateTime createdAt,
            LocalDateTime pickedUpAt,
            LocalDateTime deliveredAt) {}

    /** Tài khoản ngân hàng (bankBin = mã BIN NAPAS, dùng tạo mã VietQR). */
    public record BankAccount(String bankBin, String bankName, String accountNumber, String accountName) {}

    /** Thông tin khách đặt đơn; chỉ trả cho Owner, Family Member và Staff. */
    public record Customer(int userId, String fullName, String email, String phone) {}

    public record Detail(
            int id,
            String orderNumber,
            LocalDateTime orderDate,
            String orderStatus,
            String preparationStatus,
            String paymentMethod,
            String paymentStatus,
            LocalDateTime paymentExpiresAt,
            long itemsAmount,
            String promotionName,
            long promotionDiscountAmount,
            String couponCode,
            long couponDiscountAmount,
            long shippingFee,
            long totalAmount,
            String deliveryName,
            String deliveryPhone,
            String deliveryAddress,
            LocalDateTime confirmedAt,
            String confirmedByName,
            LocalDateTime cancelledAt,
            String cancelReason,
            Shipment shipment,
            Customer customer,
            List<Line> lines,
            // Tài khoản nhận tiền hoàn (đơn đã thanh toán online bị hủy / từ chối); null = chưa có
            BankAccount refundAccount,
            // Tài khoản khách đã dùng để chuyển khoản (PayOS gửi kèm); dùng điền sẵn khi hoàn tiền
            BankAccount payerAccount,
            // Trạng thái yêu cầu trả hàng mới nhất của đơn (PENDING / APPROVED / RECEIVED / COMPLETED / REJECTED); null = chưa có
            String returnStatus) {}
}