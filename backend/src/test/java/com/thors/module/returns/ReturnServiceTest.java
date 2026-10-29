package com.thors.module.returns;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.returns.dto.CreateReturnRequest;
import com.thors.module.returns.dto.ProcessReturnRequest;
import com.thors.module.returns.dto.ReturnRequestResponse;
import com.thors.module.returns.dto.ReturnableOrderResponse;
import com.thors.module.returns.repository.ReturnRepository;
import com.thors.module.returns.service.ReturnService;
import com.thors.security.SessionAccess;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReturnServiceTest {

    @Mock
    private ReturnRepository returnRepository;

    @Mock
    private SessionAccess sessionAccess;

    private ReturnService returnService;

    private Account mockOwner;
    private ReturnableOrderResponse mockOrder;

    @BeforeEach
    void setUp() {
        returnService = new ReturnService(returnRepository, sessionAccess);

        mockOwner = new Account(
                1,
                "OWNER",
                "Chủ Cửa Hàng",
                "hash",
                "owner@thors.vn",
                "0988888888",
                "Hà Nội",
                null,
                "ACTIVE",
                LocalDateTime.now(),
                LocalDateTime.now(),
                null,
                1L,
                null
        );

        mockOrder = new ReturnableOrderResponse();
        mockOrder.setOrderId(100);
        mockOrder.setOrderNumber("ORD-123456");
        mockOrder.setOrderStatus("COMPLETED");
        mockOrder.setPaymentStatus("PAID");
        mockOrder.setCustomerName("Nguyễn Văn A");
        mockOrder.setCustomerPhone("0912345678");
        mockOrder.setTotalAmount(new BigDecimal("500000"));

        ReturnableOrderResponse.OrderItemDetail item = new ReturnableOrderResponse.OrderItemDetail();
        item.setOrderItemId(201);
        item.setDetailId(50);
        item.setProductName("Áo Polo Nam");
        item.setSize("L");
        item.setColor("Đen");
        item.setQuantityPurchased(3);
        item.setQuantityReturnedSoFar(1);
        item.setQuantityReturnable(2);
        item.setUnitPrice(new BigDecimal("250000"));
        mockOrder.setItems(List.of(item));
    }

    @Test
    void getOrderByNumber_notFound_throwsException() {
        when(returnRepository.findOrderByNumber("NON-EXISTING")).thenReturn(Optional.empty());

        ApiException ex = assertThrows(ApiException.class, () -> returnService.getOrderByNumber("NON-EXISTING"));
        assertEquals(404, ex.status);
    }

    @Test
    void getOrderByNumber_notCompleted_throwsException() {
        mockOrder.setOrderStatus("PENDING_CONFIRMATION");
        when(returnRepository.findOrderByNumber("ORD-123456")).thenReturn(Optional.of(mockOrder));

        ApiException ex = assertThrows(ApiException.class, () -> returnService.getOrderByNumber("ORD-123456"));
        assertEquals(400, ex.status);
        assertEquals("ORDER_NOT_RETURNABLE", ex.code);
    }

    @Test
    void getOrderByNumber_success() {
        when(returnRepository.findOrderByNumber("ORD-123456")).thenReturn(Optional.of(mockOrder));

        ReturnableOrderResponse result = returnService.getOrderByNumber("ORD-123456");
        assertNotNull(result);
        assertEquals("ORD-123456", result.getOrderNumber());
        assertEquals(1, result.getItems().size());
        assertEquals(2, result.getItems().get(0).getQuantityReturnable());
    }

    @Test
    void createReturnRequest_quantityExceeded_throwsException() {
        when(sessionAccess.current()).thenReturn(mockOwner);
        when(returnRepository.findOrderByNumber("ORD-123456")).thenReturn(Optional.of(mockOrder));

        CreateReturnRequest request = new CreateReturnRequest();
        request.setOrderNumber("ORD-123456");
        request.setReason("Lỗi đường may");
        CreateReturnRequest.ItemRequest itemReq = new CreateReturnRequest.ItemRequest();
        itemReq.setOrderItemId(201);
        itemReq.setQuantityReturned(5); // Exceeds returnable of 2
        request.setItems(List.of(itemReq));

        ApiException ex = assertThrows(ApiException.class, () -> returnService.createReturnRequest(request));
        assertEquals(400, ex.status);
        assertEquals("QUANTITY_EXCEEDED", ex.code);
    }

    @Test
    void createReturnRequest_success() {
        when(sessionAccess.current()).thenReturn(mockOwner);
        when(returnRepository.findOrderByNumber("ORD-123456")).thenReturn(Optional.of(mockOrder));
        when(returnRepository.insertReturnRequest(anyInt(), any(), anyString(), anyString(), any(), anyInt(), anyString(), anyString(), anyString()))
                .thenReturn(1);

        ReturnRequestResponse mockResponse = new ReturnRequestResponse();
        mockResponse.setReturnRequestId(1);
        mockResponse.setStatus("PENDING");
        when(returnRepository.findReturnRequestById(1)).thenReturn(Optional.of(mockResponse));

        CreateReturnRequest request = new CreateReturnRequest();
        request.setOrderNumber("ORD-123456");
        request.setReason("Đổi size do mặc rộng");
        CreateReturnRequest.ItemRequest itemReq = new CreateReturnRequest.ItemRequest();
        itemReq.setOrderItemId(201);
        itemReq.setQuantityReturned(1);
        request.setItems(List.of(itemReq));

        ReturnRequestResponse result = returnService.createReturnRequest(request);
        assertNotNull(result);
        assertEquals(1, result.getReturnRequestId());
        verify(returnRepository, times(1)).insertReturnRequestItem(eq(1), eq(201), eq(1), anyString(), eq(0), eq(0), any());
    }

    @Test
    void processReturnRequest_complete_restocksStockAndAdjustsPayment() {
        when(sessionAccess.current()).thenReturn(mockOwner);

        ReturnRequestResponse existing = new ReturnRequestResponse();
        existing.setReturnRequestId(10);
        existing.setOrderId(100);
        existing.setOrderNumber("ORD-123456");
        existing.setStatus("PENDING");

        ReturnRequestResponse.ItemDetail item = new ReturnRequestResponse.ItemDetail();
        item.setReturnRequestItemId(501);
        item.setDetailId(50);
        item.setQuantityReturned(2);
        item.setQuantityReceived(0);
        item.setQuantityRestocked(0);
        item.setUnitPrice(new BigDecimal("250000"));
        item.setRefundAmount(new BigDecimal("500000"));
        existing.setItems(List.of(item));

        when(returnRepository.findReturnRequestById(10)).thenReturn(Optional.of(existing));

        ProcessReturnRequest processReq = new ProcessReturnRequest();
        processReq.setAction("COMPLETE");

        ProcessReturnRequest.ProcessItemRequest itemProc = new ProcessReturnRequest.ProcessItemRequest();
        itemProc.setReturnRequestItemId(501);
        itemProc.setQuantityReceived(2);
        itemProc.setQuantityRestocked(2);
        itemProc.setRefundAmount(new BigDecimal("500000"));
        processReq.setItems(List.of(itemProc));

        returnService.processReturnRequest(10, processReq);

        verify(returnRepository, times(1)).restockProductDetail(50, 2);
        verify(returnRepository, times(1)).insertStockAdjustmentRestock(eq(50), eq(2), eq(mockOwner.id()), anyString(), eq(501), anyString());
        verify(returnRepository, times(1)).updatePaymentRefund(100, new BigDecimal("500000"));
        verify(returnRepository, times(1)).updateReturnRequestStatus(eq(10), eq("COMPLETED"), eq(mockOwner.id()), any());
    }
}

