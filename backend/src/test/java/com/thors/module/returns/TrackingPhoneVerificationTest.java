package com.thors.module.returns;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.thors.common.ApiException;
import com.thors.module.returns.dto.ReturnableOrderResponse;
import com.thors.module.returns.repository.ReturnRepository;
import com.thors.module.returns.service.ReturnService;
import com.thors.security.SessionAccess;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Trang tra cứu đơn công khai: xác thực 4 số cuối SĐT và nút "Đã nhận được hàng". */
class TrackingPhoneVerificationTest {

    private static final String NUMBER = "ORD-20261108-FB5F22";

    private ReturnRepository repo;
    private ReturnService service;
    private ReturnableOrderResponse order;

    @BeforeEach
    void setUp() {
        repo = mock(ReturnRepository.class);
        service = new ReturnService(repo, mock(SessionAccess.class));
        order = new ReturnableOrderResponse();
        order.setOrderId(46);
        order.setOrderNumber(NUMBER);
        order.setOrderStatus("DELIVERED");
        order.setCustomerPhone("0566238971");
        order.setDeliveryAddress("Thành An Đông Lỗ, Xã Hiệp Hoà, Tỉnh Bắc Ninh");
        when(repo.findOrderByNumber(NUMBER)).thenReturn(Optional.of(order));
        when(repo.findOrderItemsWithReturnedStats(anyInt())).thenReturn(List.of());
    }

    @Test
    void lastFourDigitsOrFullNumberVerify() {
        assertTrue(service.trackOrder(NUMBER, "8971").isVerified());
        assertTrue(service.trackOrder(NUMBER, "0566 238 971").isVerified());
        assertTrue(service.trackOrder(NUMBER, "+84566238971").isVerified());
    }

    @Test
    void shortOrWrongInputDoesNotVerify() {
        assertFalse(service.trackOrder(NUMBER, "1").isVerified());    // trước đây 1 chữ số trùng số cuối là qua
        assertFalse(service.trackOrder(NUMBER, "971").isVerified());
        assertFalse(service.trackOrder(NUMBER, "1234").isVerified());
        assertFalse(service.trackOrder(NUMBER, "").isVerified());
    }

    @Test
    void orderWithoutPhoneNeverVerifies() {
        order.setCustomerPhone(null);
        assertFalse(service.trackOrder(NUMBER, "0000").isVerified()); // trước đây nhập gì cũng qua
    }

    @Test
    void verifiedCustomerCanConfirmReceived() {
        when(repo.markOrderReceived(46)).thenReturn(true);

        service.confirmReceived(NUMBER, "8971");

        verify(repo).markOrderReceived(46);
    }

    @Test
    void confirmReceivedRequiresPhone() {
        ApiException e = assertThrows(ApiException.class, () -> service.confirmReceived(NUMBER, "1"));

        assertEquals(403, e.status);
        verify(repo, never()).markOrderReceived(anyInt());
    }

    @Test
    void confirmReceivedOnlyForDeliveredOrders() {
        order.setOrderStatus("SHIPPING");

        ApiException e = assertThrows(ApiException.class, () -> service.confirmReceived(NUMBER, "8971"));

        assertEquals("ORDER_NOT_DELIVERED", e.code);
        verify(repo, never()).markOrderReceived(anyInt());
    }
}
