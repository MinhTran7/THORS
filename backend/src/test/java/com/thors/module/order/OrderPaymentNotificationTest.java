package com.thors.module.order;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.thors.module.notification.service.NotificationPublisher;
import com.thors.module.notification.service.NotificationTypes;
import com.thors.module.order.delivery.DeliveryService;
import com.thors.module.order.delivery.GhnShippingService;
import com.thors.module.order.repository.OrderRepository;
import com.thors.module.order.repository.OrderRepository.Payable;
import com.thors.module.order.service.OrderService;
import com.thors.module.warehouse.WarehouseStore;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Thông báo khi module thanh toán báo khách đã trả tiền online. */
class OrderPaymentNotificationTest {
    private OrderRepository orders;
    private NotificationPublisher notifications;
    private OrderService service;

    @BeforeEach
    void setUp() {
        orders = mock(OrderRepository.class);
        notifications = mock(NotificationPublisher.class);
        service =
                new OrderService(
                        orders,
                        notifications,
                        mock(GhnShippingService.class),
                        mock(DeliveryService.class),
                        mock(WarehouseStore.class));
    }

    private void order(String status, String payment) {
        when(orders.findPayableForUpdate(10))
                .thenReturn(Optional.of(new Payable(10, 5, "ORD-10", status, payment)));
    }

    @Test
    void paidWhileAwaitingPaymentNotifiesCustomerAndOwner() {
        order("AWAITING_PAYMENT", "UNPAID");

        service.onOnlinePaymentPaid(10);

        verify(orders).markOnlinePaid(10);
        verify(notifications)
                .toUser(eq(5), eq(NotificationTypes.ORDER_STATUS), eq("Thanh toán thành công"), anyString(),
                        eq(NotificationTypes.ENTITY_ORDER), eq(10));
        verify(notifications)
                .toRole(eq("OWNER"), eq(NotificationTypes.ORDER_STATUS), eq("Có đơn hàng online mới"), anyString(),
                        eq(NotificationTypes.ENTITY_ORDER), eq(10));
    }

    @Test
    void alreadyPaidDoesNothing() {
        order("PENDING_CONFIRMATION", "PAID");

        service.onOnlinePaymentPaid(10);

        verify(orders, never()).markOnlinePaid(anyInt());
        verifyNoInteractions(notifications);
    }

    @Test
    void paidAfterExpiryAsksOwnerToRefund() {
        order("EXPIRED", "UNPAID");

        service.onOnlinePaymentPaid(10);

        verify(orders).markOnlinePaid(10);
        verify(notifications)
                .toRole(eq("OWNER"), eq(NotificationTypes.ORDER_STATUS), eq("Cần hoàn tiền cho khách"), anyString(),
                        eq(NotificationTypes.ENTITY_ORDER), eq(10));
        verify(notifications, never())
                .toRole(anyString(), anyString(), eq("Có đơn hàng online mới"), anyString(), anyString(), anyInt());
    }

    @Test
    void unknownOrderDoesNothing() {
        when(orders.findPayableForUpdate(10)).thenReturn(Optional.empty());

        service.onOnlinePaymentPaid(10);

        verify(orders, never()).markOnlinePaid(anyInt());
        verifyNoInteractions(notifications);
    }
}
