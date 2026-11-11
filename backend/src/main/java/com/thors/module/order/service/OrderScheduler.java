package com.thors.module.order.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Các việc tự chạy nền cho đơn hàng online. Annotation @EnableScheduling đặt ngay ở đây để không phải
 * sửa class chính của ứng dụng (đặt thêm ở chỗ khác cũng không sao).
 */
@Component
@EnableScheduling
public class OrderScheduler {
    private static final Logger log = LoggerFactory.getLogger(OrderScheduler.class);

    private final OrderService service;

    public OrderScheduler(OrderService service) {
        this.service = service;
    }

    /**
     * Mỗi phút: hủy đơn chuyển khoản quá hạn thanh toán (giữ 10 phút — CheckoutService.ONLINE_PAYMENT_HOLD_MINUTES)
     * và trả lại hàng đang giữ. Chạy mỗi phút để đơn không bị giữ quá lâu sau hạn.
     */
    @Scheduled(fixedDelay = 60 * 1000L, initialDelay = 30 * 1000L)
    public void expireUnpaid() {
        try {
            int expired = service.expireUnpaidOrders();
            if (expired > 0) log.info("Đã hết hạn thanh toán {} đơn hàng", expired);
        } catch (RuntimeException e) {
            log.warn("Không xử lý được đơn hết hạn thanh toán: {}", e.getClass().getSimpleName());
        }
    }

    /** Mỗi 5 phút: tự hoàn tất đơn đã giao mà khách chưa bấm "Đã nhận hàng". */
    @Scheduled(fixedDelay = 5 * 60 * 1000L, initialDelay = 60 * 1000L)
    public void run() {
        try {
            int completed = service.autoCompleteDelivered();
            if (completed > 0) log.info("Đã tự hoàn tất {} đơn hàng đã giao", completed);
        } catch (RuntimeException e) {
            log.warn("Không tự hoàn tất được đơn đã giao: {}", e.getClass().getSimpleName());
        }
    }
}