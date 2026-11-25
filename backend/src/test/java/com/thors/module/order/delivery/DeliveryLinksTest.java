package com.thors.module.order.delivery;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class DeliveryLinksTest {

    @Test
    @DisplayName("Bỏ tỉnh giả của môi trường thử nghiệm GHN, giữ tỉnh thật")
    void testProvincesAreHidden() {
        assertTrue(GhnClient.isTestProvince("Hà Nội 02"));
        assertTrue(GhnClient.isTestProvince("Test - Alert - Tỉnh - 001"));
        assertTrue(GhnClient.isTestProvince("Ngoc test"));
        assertFalse(GhnClient.isTestProvince("Hà Nội"));
        assertFalse(GhnClient.isTestProvince("Hồ Chí Minh"));
        assertFalse(GhnClient.isTestProvince("Bà Rịa - Vũng Tàu"));
    }

    @Test
    @DisplayName("Tên theo địa giới mới của GHN khớp tên trong địa chỉ khách (bỏ tiền tố, bỏ dấu)")
    void newAddressNamesMatch() {
        var hcm = new GhnClient.Area("1000001", "Hồ Chí Minh", java.util.List.of());
        assertTrue(hcm.matches("Thành phố Hồ Chí Minh"));
        assertTrue(hcm.matches("TP Ho Chi Minh"));
        assertFalse(hcm.matches("Hà Nội"));
        var ward = new GhnClient.Area("1003646", "Phường Vũng Tàu", java.util.List.of());
        assertTrue(ward.matches("Phường Vũng Tàu"));
        assertTrue(ward.matches("Vũng Tàu"));
        // "Phường 1" và "Xã 1" là hai nơi khác nhau
        assertFalse(new GhnClient.Area("1", "Phường 1", java.util.List.of()).matches("Xã 1"));
    }

    @Test
    @DisplayName("Danh mục mới: chỉ lấy mục đang hoạt động, bỏ mục test")
    void readsNewCatalog() throws Exception {
        var data =
                new com.fasterxml.jackson.databind.ObjectMapper()
                        .readTree(
                                "[{\"_id\":1000001,\"name\":\"Hồ Chí Minh\",\"extension_names\":[\"TP.HCM\"],\"status\":1},"
                                        + "{\"_id\":1000002,\"name\":\"Cũ\",\"status\":2},"
                                        + "{\"_id\":1000003,\"name\":\"Test - Alert - Tỉnh - 001\",\"status\":1}]");
        var areas = GhnClient.areas(data);
        assertEquals(1, areas.size());
        assertEquals("1000001", areas.get(0).id());
        assertTrue(areas.get(0).matches("TP.HCM"));
    }

    @Test
    @DisplayName("Xem đường đi: Google Maps từ tọa độ cửa hàng tới địa chỉ dạng chữ")
    void mapUrlUsesAddressText() {
        var service = new DeliveryService(mock(DeliveryRepository.class), 20.9, 105.7, "GHN");
        assertEquals(
                "https://www.google.com/maps/dir/?api=1&origin=20.9,105.7"
                        + "&destination=12+L%C3%AA+L%E1%BB%A3i%2C+Ph%C6%B0%E1%BB%9Dng+An+B%C3%ACnh%2C+C%E1%BA%A7n+Th%C6%A1"
                        + "&travelmode=driving",
                service.mapUrl(" 12 Lê Lợi, Phường An Bình, Cần Thơ "));
        assertNull(service.mapUrl("  "));
    }
}
