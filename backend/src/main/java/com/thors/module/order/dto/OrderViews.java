package com.thors.module.order.dto;

import java.time.LocalDateTime;
import java.util.List;

public class OrderViews {

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
            long itemCount,
            String firstItemName) {}

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
            List<Line> lines) {}
}