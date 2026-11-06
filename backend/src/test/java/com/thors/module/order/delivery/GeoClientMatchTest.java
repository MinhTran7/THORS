package com.thors.module.order.delivery;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.thors.module.order.delivery.GeoClient.Precision;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** So khớp chữ giữa địa chỉ khách nhập và địa chỉ dịch vụ bản đồ trả về. */
class GeoClientMatchTest {
    private static final String OSM_AN_DONG =
            "Hội Làm vườn và Trang trại Thành phố Hồ Chí Minh, 1091, Đường Trần Hưng Đạo, Khu phố 7,"
                    + " Phường An Đông, Thành phố Hồ Chí Minh, 72721, Việt Nam";

    @Test
    @DisplayName("Thiếu chữ \"Lỗ\" trong kết quả thì không khớp (Nominatim bỏ bớt chữ khi tìm)")
    void missingWordIsRejected() {
        assertFalse(GeoClient.matches("Thành An Đông Lỗ", OSM_AN_DONG));
    }

    @Test
    @DisplayName("\"Lỗ\" là tên riêng, khác với từ chung \"Lô\"")
    void toneMarksDistinguishWords() {
        assertFalse(GeoClient.matches("Lỗ Khê", "Lô 5, Khê Hạ, Hà Nội"));
        assertTrue(GeoClient.matches("Lô 5 Khê Hạ", "5, Khê Hạ, Hà Nội"));
    }

    @Test
    @DisplayName("Khớp đủ chữ, bỏ qua số nhà và từ chung như \"Đường\", \"Phường\", \"TP\"")
    void realAddressMatches() {
        assertTrue(GeoClient.matches("1091 Đường Trần Hưng Đạo, P. An Đông, TP.HCM", OSM_AN_DONG));
    }

    @Test
    @DisplayName("Gõ không dấu vẫn khớp với kết quả có dấu")
    void plainTextMatches() {
        assertTrue(GeoClient.matches("tran hung dao, an dong", OSM_AN_DONG));
        assertFalse(GeoClient.matches("tran hung dao, an dong khe", OSM_AN_DONG));
        // Giới hạn: gõ không dấu thì "lo" không phân biệt được với từ chung "lô", nên được bỏ qua
        assertTrue(GeoClient.matches("an dong lo", OSM_AN_DONG));
    }

    @Test
    @DisplayName("Hai kiểu đặt dấu (Hoà / Hòa) được coi là một")
    void toneMarkPositionIgnored() {
        assertTrue(GeoClient.matches("Thanh Hoà", "Thanh Hòa, Việt Nam"));
    }

    @Test
    @DisplayName("Tách địa chỉ \"chi tiết, Phường/Xã, Tỉnh\" từ phải sang trái; chi tiết được chứa dấu phẩy")
    void parseParts() {
        var p = GeoClient.Parts.parse("Ngõ 5, 12 Trần Hưng Đạo, Phường An Đông, Thành phố Hồ Chí Minh").orElseThrow();
        assertEquals("Ngõ 5, 12 Trần Hưng Đạo", p.detail());
        assertEquals("Phường An Đông", p.ward());
        assertEquals("Thành phố Hồ Chí Minh", p.province());
        // Không theo định dạng (thiếu phường/tỉnh): không tách
        assertTrue(GeoClient.Parts.parse("Thành An Đông Lỗ").isEmpty());
        assertTrue(GeoClient.Parts.parse("123 Đường Test, Hà Nội").isEmpty());
    }

    @Test
    @DisplayName("Kết quả phải nằm đúng Phường/Xã và Tỉnh khách đã chọn")
    void inArea() {
        var anDong = GeoClient.Parts.parse("1091 Trần Hưng Đạo, Phường An Đông, Thành phố Hồ Chí Minh").orElseThrow();
        assertTrue(GeoClient.inArea(anDong, OSM_AN_DONG));
        var wrongWard = GeoClient.Parts.parse("1091 Trần Hưng Đạo, Phường Bến Thành, Thành phố Hồ Chí Minh").orElseThrow();
        assertFalse(GeoClient.inArea(wrongWard, OSM_AN_DONG));
        var wrongProvince = GeoClient.Parts.parse("1091 Trần Hưng Đạo, Phường An Đông, Thành phố Hà Nội").orElseThrow();
        assertFalse(GeoClient.inArea(wrongProvince, OSM_AN_DONG));
        // Phường chỉ có số: so cả cụm "phường 7", không khớp nhầm với "Khu phố 7"
        var numbered = GeoClient.Parts.parse("1 Trần Hưng Đạo, Phường 7, Thành phố Hồ Chí Minh").orElseThrow();
        assertFalse(GeoClient.inArea(numbered, OSM_AN_DONG));
    }

    @Test
    @DisplayName("Số nhà: bỏ chữ \"Số\" khi tìm, và kết quả phải có đúng các số đó (không tính mã bưu chính)")
    void houseNumber() {
        assertEquals("1 Phố Xốm", GeoClient.streetQuery("Số 1, Phố Xốm"));
        assertEquals("186 đường 72", GeoClient.streetQuery("Số nhà 186, đường 72"));
        String daiNam = "Trường Đại học Đại Nam, 1, Phố Xốm, Phường Phú Lương, Hà Nội, 12120, Việt Nam";
        assertTrue(GeoClient.houseNumberMatches("Số 1, Phố Xốm", daiNam));
        assertFalse(GeoClient.houseNumberMatches("Số 2, Phố Xốm", daiNam));
        assertFalse(GeoClient.houseNumberMatches("Số 12, Phố Xốm", "Phố Xốm, Phường Phú Lương, Hà Nội, 12120, Việt Nam"));
    }

    @Test
    @DisplayName("Đường đánh số: nhận ra số hiệu và mã đường cần thử trên bản đồ")
    void numberedRoads() {
        assertEquals("72", GeoClient.roadNumber("Số 186, đường 72").orElseThrow());
        assertEquals(java.util.List.of("ĐT.72", "QL.72"), GeoClient.roadCodes("Số 186, đường 72", "72"));
        assertEquals(java.util.List.of("ĐT.72"), GeoClient.roadCodes("Tỉnh lộ 72", "72"));
        assertEquals(java.util.List.of("QL.6"), GeoClient.roadCodes("Km 15, QL6", "6"));
        assertEquals("21B", GeoClient.roadNumber("Quốc lộ 21b").orElseThrow());
        // Không phải đường đánh số
        assertTrue(GeoClient.roadNumber("Số 1, Phố Xốm").isEmpty());
        assertTrue(GeoClient.roadNumber("12 Đường Trần Hưng Đạo").isEmpty());
    }

    @Test
    @DisplayName("Goong: khớp tên đường là STREET, chỉ khớp phường là AREA, chỉ khớp tỉnh là null")
    void goongPrecision() {
        assertEquals(Precision.STREET, GeoClient.goongPrecision("1091 Trần Hưng Đạo, An Đông, Hồ Chí Minh", OSM_AN_DONG));
        assertEquals(Precision.AREA, GeoClient.goongPrecision("5 Đường Bịa Đặt, An Đông, Hồ Chí Minh", OSM_AN_DONG));
        assertNull(GeoClient.goongPrecision("123 Đường Test, Hồ Chí Minh", OSM_AN_DONG));
    }
}
