package com.thors.module.facebook;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.facebook.repository.FacebookOrderRepository;
import com.thors.module.facebook.repository.FacebookOrderRepository.NewOrder;
import com.thors.module.facebook.service.FacebookService;
import com.thors.module.order.delivery.GeoClient;
import com.thors.module.order.service.OrderService;
import com.thors.module.promotion.entity.Promotion;
import com.thors.module.promotion.repository.PromotionRepository;
import com.thors.module.promotion.service.PricingService;
import com.thors.security.SessionAccess;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class FacebookOrderPricingTest {

    private FacebookOrderRepository orders;
    private SessionAccess sessionAccess;
    private GeoClient geo;
    private OrderService orderService;
    private PromotionRepository promotionRepository;
    private FacebookService service;

    @BeforeEach
    void setUp() {
        orders = mock(FacebookOrderRepository.class);
        sessionAccess = mock(SessionAccess.class);
        geo = mock(GeoClient.class);
        orderService = mock(OrderService.class);
        promotionRepository = mock(PromotionRepository.class);

        Account owner = new Account(
                2, "OWNER", "Chủ shop", "hash", "owner@thors.shop",
                "0912345678", "Hà Nội", null, "ACTIVE",
                LocalDateTime.now(), LocalDateTime.now(), null, 1L, null);
        when(sessionAccess.current()).thenReturn(owner);
        when(geo.geocode(any())).thenReturn(Optional.empty());
        when(promotionRepository.findRunningProductPromotions(any())).thenReturn(List.of());
        when(promotionRepository.withProductIds(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(orders.heldQuantity(anyInt())).thenReturn(0);
        when(orders.insertOrder(any())).thenReturn(101);

        PricingService pricing = new PricingService(promotionRepository);
        service = new FacebookService(orders, sessionAccess, geo, orderService, null, pricing, promotionRepository);
    }

    private void stubVariant(int detailId, int productId, long price, int stock) {
        Map<String, Object> row = new HashMap<>();
        row.put("detail_id", detailId);
        row.put("product_id", productId);
        row.put("product_name", "Áo Thun THORS");
        row.put("size", "L");
        row.put("color", "Đen");
        row.put("price", BigDecimal.valueOf(price));
        row.put("stock_quantity", stock);
        row.put("variant_status", "ACTIVE");
        row.put("product_status", "ACTIVE");
        when(orders.lockVariant(detailId)).thenReturn(Optional.of(row));
    }

    @Test
    void createOrder_appliesProductDiscountOrderVoucherAndShippingFee() {
        stubVariant(10, 5, 200_000L, 10);

        LocalDateTime now = LocalDateTime.now();
        Promotion productPromo = new Promotion(
                1, Promotion.PRODUCT_DISCOUNT, "Giảm 10%", null,
                "PERCENT", BigDecimal.TEN, BigDecimal.ZERO,
                null, 0, "SPECIFIC", List.of(5),
                now.minusDays(1), now.plusDays(1), "ACTIVE", 2);
        when(promotionRepository.findRunningProductPromotions(any())).thenReturn(List.of(productPromo));
        when(promotionRepository.withProductIds(anyList())).thenReturn(List.of(productPromo));

        Promotion voucher = new Promotion(
                7, Promotion.ORDER_VOUCHER, "Giảm 30K đơn từ 300K", null,
                "FIXED", BigDecimal.valueOf(30_000), BigDecimal.valueOf(300_000),
                50, 5, "ALL", List.of(),
                now.minusDays(1), now.plusDays(1), "ACTIVE", 2);
        when(promotionRepository.lockById(7)).thenReturn(Optional.of(voucher));
        when(promotionRepository.countUsage(7)).thenReturn(5);

        Map<String, Object> req = new HashMap<>();
        req.put("psid", "psid_123456");
        req.put("customerName", "Nguyễn Văn A");
        req.put("customerPhone", "+84 912 345 678");
        req.put("customerAddress", "12 Nguyễn Trãi, Hà Nội");
        req.put("paymentMethod", "COD");
        req.put("promotionId", 7);
        req.put("shippingFee", 25_000);
        req.put("items", List.of(Map.of("detailId", 10, "quantity", 2)));

        Map<String, Object> res = service.createOrderFromFacebook(req);

        // 200.000 - 10% = 180.000 x 2 = 360.000; voucher -30.000; ship +25.000 => 355.000
        assertEquals(360_000L, res.get("itemsAmount"));
        assertEquals(30_000L, res.get("promotionDiscountAmount"));
        assertEquals("Giảm 30K đơn từ 300K", res.get("promotionName"));
        assertEquals(25_000L, res.get("shippingFee"));
        assertEquals(355_000L, res.get("totalAmount"));

        ArgumentCaptor<NewOrder> captor = ArgumentCaptor.forClass(NewOrder.class);
        verify(orders).insertOrder(captor.capture());
        NewOrder saved = captor.getValue();
        assertEquals(7, saved.promotionId());
        assertEquals("Giảm 30K đơn từ 300K", saved.promotionName());
        assertEquals(30_000L, saved.promotionDiscountAmount());
        assertEquals(25_000L, saved.shippingFee());
        assertEquals(360_000L, saved.itemsAmount());
        assertEquals(355_000L, saved.totalAmount());
        assertEquals("psid_123456", saved.facebookPsid());

        verify(orders).insertItem(eq(101), eq(10), eq("Áo Thun THORS"), eq("L"), eq("Đen"), eq(2), eq(180_000L));
        verify(orderService).notifyFacebookOrderCreated(any(Account.class), eq(101), any());
    }

    @Test
    void createOrder_rejectsNegativeShippingFee() {
        stubVariant(10, 5, 200_000L, 10);

        Map<String, Object> req = new HashMap<>();
        req.put("customerName", "Nguyễn Văn A");
        req.put("customerPhone", "0912345678");
        req.put("customerAddress", "12 Nguyễn Trãi, Hà Nội");
        req.put("shippingFee", -5_000);
        req.put("items", List.of(Map.of("detailId", 10, "quantity", 1)));

        ApiException ex = assertThrows(ApiException.class, () -> service.createOrderFromFacebook(req));
        assertEquals(400, ex.status);
        assertEquals("SHIPPING_FEE", ex.code);
    }

    @Test
    void createOrder_rejectsVoucherWhenBelowMinOrderValue() {
        stubVariant(10, 5, 150_000L, 10);

        LocalDateTime now = LocalDateTime.now();
        Promotion voucher = new Promotion(
                8, Promotion.ORDER_VOUCHER, "Giảm 50K đơn từ 500K", null,
                "FIXED", BigDecimal.valueOf(50_000), BigDecimal.valueOf(500_000),
                null, 0, "ALL", List.of(),
                now.minusDays(1), now.plusDays(1), "ACTIVE", 2);
        when(promotionRepository.lockById(8)).thenReturn(Optional.of(voucher));

        Map<String, Object> req = new HashMap<>();
        req.put("customerName", "Nguyễn Văn A");
        req.put("customerPhone", "0912345678");
        req.put("customerAddress", "12 Nguyễn Trãi, Hà Nội");
        req.put("promotionId", 8);
        req.put("items", List.of(Map.of("detailId", 10, "quantity", 2)));

        ApiException ex = assertThrows(ApiException.class, () -> service.createOrderFromFacebook(req));
        assertEquals(400, ex.status);
        assertEquals("PROMOTION_MIN_ORDER", ex.code);
    }
}
