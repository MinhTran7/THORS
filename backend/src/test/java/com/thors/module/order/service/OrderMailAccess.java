package com.thors.module.order.service;

import com.thors.module.order.dto.OrderViews;

/** Cho test ở package khác gọi hàm dựng nội dung email (package-private) của OrderMailService. */
public final class OrderMailAccess {
    private OrderMailAccess() {}

    public static String confirmedBody(OrderMailService.Recipient to, OrderViews.Detail order, String url) {
        return OrderMailService.confirmedBody(to, order, url);
    }
}
