package com.thors.module.order;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
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

    @Test
    void ownerCanConfirmOnlinePaidForDeliveredUnpaidOrder() {
        var owner = new Account(1, "OWNER", "Chủ shop", null, null, null, null, null, "ACTIVE", null, null, null, 0, null);
        var d = new com.thors.module.order.dto.OrderViews.Detail(
                10, "ORD-10", null, "DELIVERED", null, "ONLINE", "UNPAID", null, 10000,
                null, 0, null, 0, 0, 10000, "A", "0900000001", "Addr", null, null, null, null,
                null, null, java.util.List.of(), null, null, null);
        when(orders.find(10, true)).thenReturn(Optional.of(new OrderRepository.Found(1, "Online", d)));
        order("DELIVERED", "UNPAID");

        service.confirmOnlinePaid(owner, 10);

        verify(orders).markOnlinePaid(10);
    }

    @Test
    void nonOwnerCannotConfirmOnlinePaid() {
        var family = new Account(2, "FAMILY_MEMBER", "Lan", null, null, null, null, null, "ACTIVE", null, null, null, 0, null);
        ApiException e = assertThrows(ApiException.class, () -> service.confirmOnlinePaid(family, 10));
        assertEquals(403, e.status);
    }

    @Test
    void rejectPaidOrderSkipsIncompleteOrIntermediaryWalletPayerAccount() {
        var owner = new Account(1, "OWNER", "Chủ shop", null, null, null, null, null, "ACTIVE", null, null, null, 0, null);
        var d = new com.thors.module.order.dto.OrderViews.Detail(
                10, "ORD-10", null, "PENDING_CONFIRMATION", null, "ONLINE", "PAID", null, 10000,
                null, 0, null, 0, 0, 10000, "A", "0900000001", "Addr", null, null, null, null,
                null, null, java.util.List.of(), null, null, null);
        when(orders.find(10, true)).thenReturn(Optional.of(new OrderRepository.Found(5, "Online", d)));
        when(orders.transition(10, "PENDING_CONFIRMATION", "REJECTED", 1, "Hết hàng", null)).thenReturn(true);
        when(orders.markRefundPendingIfPaid(10)).thenReturn(1);
        // PayOS trả về tài khoản trung gian MoMo không có tên chủ tài khoản
        when(orders.payerAccount(10))
                .thenReturn(new com.thors.module.order.dto.OrderViews.BankAccount("970422", null, "2281072020614", null));

        service.changeStatus(owner, 10, "REJECTED", "Hết hàng", null, null, null, null, null);

        verify(orders, never()).saveRefundAccount(anyInt(), any());
    }

    @Test
    void markRefundedRequiresPersonalRefundAccountWithHolderName() {
        var owner = new Account(1, "OWNER", "Chủ shop", null, null, null, null, null, "ACTIVE", null, null, null, 0, null);
        var badRefund = new com.thors.module.order.dto.OrderViews.BankAccount("970422", null, "2281072020614", null);
        var d = new com.thors.module.order.dto.OrderViews.Detail(
                10, "ORD-10", null, "REJECTED", null, "ONLINE", "REFUND_PENDING", null, 10000,
                null, 0, null, 0, 0, 10000, "A", "0900000001", "Addr", null, null, null, null,
                null, null, java.util.List.of(), badRefund, null, null);
        when(orders.find(10, true)).thenReturn(Optional.of(new OrderRepository.Found(5, "Online", d)));

        ApiException e = assertThrows(ApiException.class, () -> service.markRefunded(owner, 10));
        assertEquals("REFUND_ACCOUNT_REQUIRED", e.code);
        verify(orders, never()).markRefunded(anyInt());
    }

    @Test
    void rejectPaidFacebookOrderPublishesMessengerEventAskingBankAccountWhenMissingName() {
        var events = mock(org.springframework.context.ApplicationEventPublisher.class);
        var svc = new OrderService(
                orders,
                notifications,
                mock(GhnShippingService.class),
                mock(WarehouseStore.class),
                mock(com.thors.module.order.service.OrderMailService.class),
                events);
        var owner = new Account(1, "OWNER", "Chủ shop", null, null, null, null, null, "ACTIVE", null, null, null, 0, null);
        var d = new com.thors.module.order.dto.OrderViews.Detail(
                10, "ORD-FB10", null, "PENDING_CONFIRMATION", null, "ONLINE", "PAID", null, 10000,
                null, 0, null, 0, 0, 10000, "A", "0900000001", "Addr", null, null, null, null,
                null, null, java.util.List.of(), null, null, null);
        when(orders.find(10, true)).thenReturn(Optional.of(new OrderRepository.Found(1, "Online", d)));
        when(orders.transition(10, "PENDING_CONFIRMATION", "REJECTED", 1, "Hết hàng", null)).thenReturn(true);
        when(orders.markRefundPendingIfPaid(10)).thenReturn(1);
        when(orders.payerAccount(10))
                .thenReturn(new com.thors.module.order.dto.OrderViews.BankAccount("970422", null, "2281072020614", null));
        when(orders.findFacebookPsid(10)).thenReturn("999888777");

        svc.changeStatus(owner, 10, "REJECTED", "Hết hàng", null, null, null, null, null);

        verify(events).publishEvent(new OrderService.FacebookOrderStatusEvent(
                10, "ORD-FB10", "999888777", "REJECTED", "Hết hàng", null, 10000, true, false));
    }
}
