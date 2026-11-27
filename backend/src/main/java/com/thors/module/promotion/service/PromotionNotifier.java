package com.thors.module.promotion.service;

import com.thors.module.notification.service.NotificationPublisher;
import com.thors.module.notification.service.NotificationTypes;
import com.thors.module.promotion.entity.Promotion;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

// Báo khách khi có khuyến mãi mới; chỉ gửi sau khi transaction tạo khuyến mãi commit thành công
@Component
public class PromotionNotifier {

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy");

    private final NotificationPublisher notifications;

    public PromotionNotifier(NotificationPublisher notifications) {
        this.notifications = notifications;
    }

    public void created(int id, Promotion p) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                send(id, p);
            }
        });
    }

    // Khuyến mãi chưa bắt đầu thì không gắn liên kết
    private void send(int id, Promotion p) {
        boolean startsNow = !p.startDate().isAfter(LocalDateTime.now());
        String title = p.isOrderVoucher()
                ? (startsNow ? "Mã giảm giá mới" : "Sắp có mã giảm giá mới")
                : (startsNow ? "Sản phẩm đang giảm giá" : "Sắp có giảm giá sản phẩm");
        String time = startsNow
                ? "áp dụng đến " + TIME.format(p.endDate())
                : "từ " + TIME.format(p.startDate()) + " đến " + TIME.format(p.endDate());
        String message = "\"" + p.name() + "\": " + discount(p) + " " + target(p) + ", " + time + ".";
        String entity = p.isOrderVoucher() ? NotificationTypes.ENTITY_PROMOTION : NotificationTypes.ENTITY_PRODUCT_SALE;
        notifications.toRole("CUSTOMER", NotificationTypes.PROMOTION, title, message, startsNow ? entity : null, startsNow ? id : null);
    }

    private static String discount(Promotion p) {
        if (!"PERCENT".equals(p.discountType())) return "giảm " + money(p.discountValue());
        String text = "giảm " + p.discountValue().stripTrailingZeros().toPlainString() + "%";
        return p.maxDiscountAmount() == null ? text : text + " (tối đa " + money(p.maxDiscountAmount()) + ")";
    }

    private static String target(Promotion p) {
        if (p.isOrderVoucher()) return "cho đơn từ " + money(p.minOrderValue());
        return "ALL".equals(p.applyScope()) ? "cho toàn bộ sản phẩm" : "cho " + p.productIds().size() + " sản phẩm";
    }

    private static String money(BigDecimal value) {
        return String.format(Locale.forLanguageTag("vi-VN"), "%,d", value.longValue()) + "đ";
    }
}
