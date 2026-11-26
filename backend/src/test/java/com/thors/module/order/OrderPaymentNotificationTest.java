package com.thors.module.order;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.thors.module.notification.service.NotificationPublisher;
import com.thors.module.notification.service.NotificationTypes;
import com.thors.module.order.delivery.GhnShippingService;
import com.thors.module.order.repository.OrderRepository;
import com.thors.module.order.repository.OrderRepository.Payable;
import com.thors.module.order.service.OrderService;
import com.thors.module.warehouse.repository.WarehouseStore;
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
                        mock(WarehouseStore.class),
                        mock(com.thors.module.order.service.OrderMailService.class),
                        mock(com.thors.module.sales.service.InStoreSaleCompleter.class));
        when(orders.isCustomerAccount(5)).thenReturn(true);
    }

    private void order(String status, String payment) {
        when(orders.findPayableForUpdate(10))
                .thenReturn(Optional.of(new Payable(10, 5, "ORD-10", "Online", status, payment)));
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
        // Người nhà xử lý đơn như chủ shop nên cũng được báo
        verify(notifications)
                .toRole(eq("FAMILY_MEMBER"), eq(NotificationTypes.ORDER_STATUS), eq("Có đơn hàng online mới"), anyString(),
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
        // Chỉ Owner bấm được "Đã hoàn tiền" nên người nhà không nhận
        verify(notifications, never())
                .toRole(eq("FAMILY_MEMBER"), anyString(), anyString(), anyString(), anyString(), anyInt());
    }

    @Test
    void facebookOrderDoesNotNotifyStaffAsCustomer() {
        // Đơn Facebook gắn tài khoản nhân viên (user 5 không phải khách hàng)
        when(orders.isCustomerAccount(5)).thenReturn(false);
        order("AWAITING_PAYMENT", "UNPAID");

        service.onOnlinePaymentPaid(10);

        verify(notifications, never()).toUser(anyInt(), anyString(), anyString(), anyString(), anyString(), anyInt());
        verify(notifications)
                .toRole(eq("OWNER"), anyString(), eq("Có đơn hàng online mới"), anyString(), anyString(), eq(10));
    }

    @Test
    void facebookOrderCreatedNotifiesOtherStoreMembersOnly() {
        when(orders.storeUserIds()).thenReturn(java.util.List.of(1, 2, 3));
        var creator =
                new com.thors.module.account.entity.Account(
                        2, "FAMILY_MEMBER", "Lan", null, null, null, null, null, "ACTIVE", null, null, null, 0, null);

        service.notifyFacebookOrderCreated(creator, 10, "ORD-10");

        verify(notifications)
                .toUsers(eq(java.util.List.of(1, 3)), eq(NotificationTypes.ORDER_STATUS), eq("Có đơn hàng Facebook mới"),
                        contains("Lan"), eq(NotificationTypes.ENTITY_ORDER), eq(10));
    }

    @Test
    void unknownOrderDoesNothing() {
        when(orders.findPayableForUpdate(10)).thenReturn(Optional.empty());

        service.onOnlinePaymentPaid(10);

        verify(orders, never()).markOnlinePaid(anyInt());
        verifyNoInteractions(notifications);
    }
}
