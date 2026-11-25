package com.thors.module.order.service;

import com.thors.config.Settings;
import com.thors.module.order.dto.OrderViews;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Email cho khách khi đơn online được cửa hàng xác nhận: "Đơn hàng của bạn đã được xác nhận", kèm sản phẩm,
 * tổng tiền và link theo dõi đơn trên web. Dùng chung cấu hình email với email tài khoản (Settings.delivery()).
 *
 * <p>Gửi SAU khi transaction xác nhận đơn đã commit và chạy ngầm: gửi lỗi hoặc chưa cấu hình email thì chỉ ghi
 * log, việc xác nhận đơn không bị chậm hay hỏng theo.
 */
@Service
public class OrderMailService {
    private static final Logger log = LoggerFactory.getLogger(OrderMailService.class);

    /** Người nhận email: khách có tài khoản Khách hàng (đơn Facebook do nhân viên tạo thì không có). */
    public record Recipient(String fullName, String email) {}

    private final Settings settings;
    private final ObjectProvider<JavaMailSender> mail;

    public OrderMailService(Settings settings, ObjectProvider<JavaMailSender> mail) {
        this.settings = settings;
        this.mail = mail;
    }

    /** Hẹn gửi email "đơn đã được xác nhận" sau khi transaction hiện tại commit (không có transaction thì gửi luôn). */
    public void sendConfirmedAfterCommit(Recipient to, OrderViews.Detail order) {
        if (to == null || to.email() == null || to.email().isBlank() || order == null) return;
        Runnable send = () -> CompletableFuture.runAsync(() -> sendConfirmed(to, order));
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            send.run();
                        }
                    });
        } else {
            send.run();
        }
    }

    /** @return true nếu đã gửi được. */
    boolean sendConfirmed(Recipient to, OrderViews.Detail order) {
        var delivery = settings.delivery();
        JavaMailSender sender = mail.getIfAvailable();
        if (delivery == null || !delivery.emailEnabled() || sender == null
                || delivery.emailFrom() == null || delivery.emailFrom().isBlank()) {
            log.info("Chưa gửi email xác nhận đơn {}: dịch vụ email chưa được cấu hình", order.orderNumber());
            return false;
        }
        try {
            var m = new SimpleMailMessage();
            m.setFrom(delivery.emailFrom());
            m.setTo(to.email());
            m.setSubject("THORS - Đơn hàng " + order.orderNumber() + " đã được xác nhận");
            m.setText(confirmedBody(to, order, orderUrl(order.id())));
            sender.send(m);
            log.info("Đã gửi email xác nhận đơn {}", order.orderNumber());
            return true;
        } catch (RuntimeException e) {
            log.warn("Gửi email xác nhận đơn {} thất bại: {}", order.orderNumber(), e.getMessage());
            return false;
        }
    }

    private String orderUrl(int orderId) {
        String base = settings.frontendUrl() == null ? "" : settings.frontendUrl().replaceAll("/+$", "");
        return base + "/orders/" + orderId;
    }

    static String confirmedBody(Recipient to, OrderViews.Detail order, String orderUrl) {
        StringBuilder items = new StringBuilder();
        if (order.lines() != null) {
            for (var line : order.lines()) {
                items.append("  - ").append(line.productName());
                String variant = String.join(" / ", java.util.stream.Stream.of(line.size(), line.color())
                        .filter(s -> s != null && !s.isBlank()).toList());
                if (!variant.isEmpty()) items.append(" (").append(variant).append(")");
                items.append(" x").append(line.quantity()).append("\n");
            }
        }
        String name = to.fullName() == null || to.fullName().isBlank() ? "bạn" : to.fullName();
        return "Xin chào " + name + ",\n\n"
                + "Đơn hàng " + order.orderNumber() + " của bạn đã được cửa hàng xác nhận và đang được chuẩn bị để giao.\n\n"
                + (items.isEmpty() ? "" : "Sản phẩm:\n" + items + "\n")
                + "Tổng thanh toán: " + vnd(order.totalAmount()) + "\n"
                + (order.deliveryAddress() == null ? "" : "Giao đến: " + order.deliveryAddress() + "\n")
                + "\nBạn có thể theo dõi tình trạng đơn hàng tại:\n" + orderUrl + "\n\n"
                + "Cảm ơn bạn đã mua sắm tại THORS!\n\n"
                + "THORS";
    }

    private static String vnd(long amount) {
        return NumberFormat.getNumberInstance(Locale.forLanguageTag("vi-VN")).format(amount) + " ₫";
    }
}
