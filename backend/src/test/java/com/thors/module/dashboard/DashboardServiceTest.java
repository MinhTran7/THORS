package com.thors.module.dashboard;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

/** Chạy SQL thật của bảng điều khiển trên H2 chế độ MySQL với dữ liệu mẫu trong dashboard-schema.sql. */
class DashboardServiceTest {

    private static final LocalDate FROM = LocalDate.of(2026, 11, 2);
    private static final LocalDate TO = LocalDate.of(2026, 11, 4);

    private JdbcTemplate db;
    private DashboardService service;

    private static Account account(int id, String role) {
        return new Account(id, role, "U" + id, "", "u" + id + "@example.com", null, null, null, "ACTIVE", null, null, null, 0, null);
    }

    @BeforeEach
    void setUp() {
        var dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:dash_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE;NON_KEYWORDS=USER", "sa", "");
        new ResourceDatabasePopulator(new ClassPathResource("dashboard-schema.sql")).execute(dataSource);
        db = new JdbcTemplate(dataSource);
        service = new DashboardService(db);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Map<String, Object> parent, String key) {
        return (Map<String, Object>) parent.get(key);
    }

    private static long amount(Object value) {
        return ((BigDecimal) value).longValueExact();
    }

    @Test
    void ownerSeesShopRevenueByChannelNetOfRefunds() {
        var result = service.summary(account(1, "OWNER"), FROM, TO);
        var sales = map(result, "sales");

        assertEquals("SHOP", result.get("scope"));
        // Đã thu: 200k (quầy) + 300k (web) + 600k (Facebook) ; hoàn 100k ; đơn chưa thu/hủy và ngoài khoảng bị loại
        assertEquals(1_100_000, amount(sales.get("grossRevenue")));
        assertEquals(100_000, amount(sales.get("refunded")));
        assertEquals(1_000_000, amount(sales.get("netRevenue")));
        assertEquals(5L, sales.get("ordersCreated"));
        assertEquals(1L, sales.get("ordersCancelled"));
        assertEquals(3L, sales.get("paidOrders"));

        var byChannel = map(sales, "byChannel");
        assertEquals(200_000, amount(map(byChannel, "IN_STORE").get("netRevenue")));
        assertEquals(300_000, amount(map(byChannel, "WEB").get("netRevenue")));
        // Đơn Online do nhân viên tạo = Facebook
        assertEquals(500_000, amount(map(byChannel, "FACEBOOK").get("netRevenue")));
        assertEquals(3L, map(byChannel, "WEB").get("ordersCreated"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void dailySeriesCoversEveryDay() {
        var daily = (List<Map<String, Object>>) service.summary(account(1, "OWNER"), FROM, TO).get("daily");

        assertEquals(3, daily.size());
        assertEquals("2026-11-02", daily.get(0).get("date"));
        assertEquals(200_000, amount(daily.get(0).get("total")));
        assertEquals(300_000, amount(daily.get(1).get("WEB")));
        assertEquals(500_000, amount(daily.get(2).get("FACEBOOK")));
        assertEquals(0, amount(daily.get(2).get("IN_STORE")));
    }

    @Test
    @SuppressWarnings("unchecked")
    void topProductsOnlyCountPaidOrders() {
        var top = (List<Map<String, Object>>) service.summary(account(1, "OWNER"), FROM, TO).get("topProducts");

        assertEquals("Áo khoác", top.get(0).get("productName"));
        assertEquals(3L, ((Number) top.get(0).get("quantity")).longValue()); // 1 web + 2 Facebook; đơn chưa thu bị loại
        assertEquals("Áo thun", top.get(1).get("productName"));
    }

    @Test
    void stockFollowsWarehouseFormula() {
        var stock = map(service.summary(account(1, "OWNER"), FROM, TO), "stock");

        assertTrue((Boolean) stock.get("thresholdSupported"));
        assertEquals(4L, stock.get("variants"));       // sản phẩm ngưng bán bị loại
        assertEquals(1L, stock.get("outOfStock"));     // #101
        assertEquals(1L, stock.get("lowStock"));       // #102: có thể bán 2 <= ngưỡng 3
        assertEquals(1L, stock.get("noThreshold"));    // #103
        assertEquals(20L + 0 + 2 + 2, stock.get("sellableUnits"));
    }

    @Test
    void ownerSeesPendingOrdersAndRealShopCounts() {
        var result = service.summary(account(1, "OWNER"), FROM, TO);
        var pending = map(result, "pending");
        var shop = map(result, "shop");

        assertEquals(1L, pending.get("pendingConfirmation"));
        assertEquals(1L, pending.get("awaitingPickup"));
        assertEquals(2L, shop.get("activeProducts"));
        assertEquals(1L, shop.get("activeCategories"));
        assertEquals(1L, shop.get("activeMembers"));
        assertEquals(2L, shop.get("onlineVariants"));
    }

    @Test
    void familyMemberOnlySeesOwnSales() {
        var result = service.summary(account(2, "FAMILY_MEMBER"), FROM, TO);
        var sales = map(result, "sales");

        assertEquals("MINE", result.get("scope"));
        assertEquals(200_000, amount(sales.get("netRevenue")));
        assertEquals(1L, sales.get("ordersCreated"));
        assertFalse(result.containsKey("pending"));
        assertFalse(result.containsKey("shop"));
    }

    @Test
    void rejectsInvalidRangeAndOtherRoles() {
        assertEquals("DATE_RANGE", assertThrows(ApiException.class,
                () -> service.summary(account(1, "OWNER"), TO, FROM)).code);
        assertEquals("DATE_RANGE", assertThrows(ApiException.class,
                () -> service.summary(account(1, "OWNER"), FROM.minusDays(400), TO)).code);
        assertEquals(403, assertThrows(ApiException.class,
                () -> service.summary(account(9, "CUSTOMER"), FROM, TO)).status);
    }

    @Test
    void worksBeforeInventoryMigration() {
        db.execute("ALTER TABLE product_detail DROP COLUMN min_stock_quantity");

        var stock = map(service.summary(account(1, "OWNER"), FROM, TO), "stock");

        assertFalse((Boolean) stock.get("thresholdSupported"));
        assertEquals(1L, stock.get("outOfStock"));
        assertNull(stock.get("lowStock"));
        @SuppressWarnings("unchecked")
        var alerts = (List<Map<String, Object>>) stock.get("alerts");
        assertEquals("Áo thun", alerts.get(0).get("productName"));
        assertEquals("OUT", alerts.get(0).get("state"));
    }
}
