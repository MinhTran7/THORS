package com.thors.module.order.service;

import java.util.List;

/** Giá trị cột orders.order_status. */
public final class OrderStatus {
    private OrderStatus() {}

    public static final String AWAITING_PAYMENT = "AWAITING_PAYMENT";
    public static final String PENDING_CONFIRMATION = "PENDING_CONFIRMATION";
    public static final String AWAITING_PICKUP = "AWAITING_PICKUP";
    public static final String SHIPPING = "SHIPPING";
    public static final String DELIVERED = "DELIVERED";
    public static final String COMPLETED = "COMPLETED";
    public static final String CANCELLED = "CANCELLED";
    public static final String REJECTED = "REJECTED";
    public static final String EXPIRED = "EXPIRED";

    public static final List<String> ALL =
            List.of(
                    AWAITING_PAYMENT,
                    PENDING_CONFIRMATION,
                    AWAITING_PICKUP,
                    SHIPPING,
                    DELIVERED,
                    COMPLETED,
                    CANCELLED,
                    REJECTED,
                    EXPIRED);

    /** Giá trị cột orders.order_type của đơn mua trên website. */
    public static final String TYPE_ONLINE = "Online";
}