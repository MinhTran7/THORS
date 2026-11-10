package com.thors.module.order.delivery;

import com.thors.module.order.repository.OrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Định kỳ hỏi GHN trạng thái các đơn đang giao. Chạy được cả khi backend ở localhost (GHN không gọi
 * webhook tới được), và làm dự phòng khi webhook bị lỡ. Tắt bằng thors.ghn.poll-enabled=false.
 */
@Component
public class GhnTrackingScheduler {
    private static final Logger log = LoggerFactory.getLogger(GhnTrackingScheduler.class);
    private static final int MAX_PER_RUN = 100;

    private final GhnClient ghn;
    private final GhnStatusService statuses;
    private final OrderRepository orders;
    private final boolean enabled;

    public GhnTrackingScheduler(
            GhnClient ghn,
            GhnStatusService statuses,
            OrderRepository orders,
            @Value("${thors.ghn.poll-enabled:true}") boolean enabled) {
        this.ghn = ghn;
        this.statuses = statuses;
        this.orders = orders;
        this.enabled = enabled;
    }

    @Scheduled(fixedDelayString = "${thors.ghn.poll-interval-ms:30000}", initialDelay = 15_000L)
    public void poll() {
        if (!enabled || !ghn.isConfigured()) return;
        int applied = 0;
        for (String code : orders.activeTrackingNumbers(GhnShippingService.CARRIER).stream().limit(MAX_PER_RUN).toList()) {
            try {
                GhnClient.Tracking t = ghn.detail(code);
                if (statuses.apply(code, t.status(), t.updatedAt(), t.reason()) == GhnStatusService.Result.APPLIED)
                    applied++;
            } catch (RuntimeException e) {
                log.warn("Không lấy được trạng thái GHN của vận đơn {}: {}", code, e.getMessage());
            }
        }
        if (applied > 0) log.info("Đã cập nhật trạng thái {} vận đơn GHN", applied);
    }
}
