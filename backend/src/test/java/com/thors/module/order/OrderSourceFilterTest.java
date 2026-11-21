package com.thors.module.order;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.thors.module.order.repository.OrderRepository;
import com.thors.module.order.repository.OrderRepository.Slice;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * Lọc nguồn đơn trên danh sách đơn online: đơn gắn tài khoản CUSTOMER là đơn web, đơn gắn tài khoản
 * nhân viên (Social POS tạo hộ khách Facebook) là đơn Facebook.
 */
class OrderSourceFilterTest {

    private OrderRepository orders;

    @BeforeEach
    void setUp() {
        var dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:source_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE", "sa", "");
        JdbcTemplate db = new JdbcTemplate(dataSource);
        db.execute("CREATE TABLE `role` (role_id INT PRIMARY KEY, role_name VARCHAR(30))");
        db.execute("CREATE TABLE `user` (user_id INT PRIMARY KEY, role_id INT)");
        db.execute("""
                CREATE TABLE orders (order_id INT PRIMARY KEY, order_number VARCHAR(40), order_type VARCHAR(20),
                  user_id INT, order_date TIMESTAMP, order_status VARCHAR(30), preparation_status VARCHAR(30),
                  payment_method VARCHAR(20), payment_status VARCHAR(20), total_amount BIGINT,
                  delivery_name VARCHAR(100), delivery_phone VARCHAR(15), delivery_address VARCHAR(255),
                  shipping_carrier VARCHAR(20))""");
        db.execute("""
                CREATE TABLE order_item (order_item_id INT PRIMARY KEY, order_id INT, detail_id INT, quantity INT,
                  unit_price BIGINT, product_name_snapshot VARCHAR(100), size_snapshot VARCHAR(10),
                  color_snapshot VARCHAR(30))""");
        db.execute("CREATE TABLE product_detail (detail_id INT PRIMARY KEY, product_id INT)");
        db.execute("""
                CREATE TABLE product_image (image_id INT PRIMARY KEY, product_id INT, image_url VARCHAR(255),
                  is_primary BOOLEAN, deleted_at TIMESTAMP)""");

        db.update("INSERT INTO `role` VALUES (1, 'CUSTOMER'), (2, 'OWNER'), (3, 'STAFF')");
        db.update("INSERT INTO `user` VALUES (10, 1), (20, 2), (30, 3)");
        // 2 đơn web của khách, 2 đơn Facebook do chủ shop / nhân viên tạo, 1 đơn tại quầy không thuộc danh sách online
        db.update("""
                INSERT INTO orders (order_id, order_number, order_type, user_id, order_date, order_status, total_amount)
                VALUES (1, 'ORD-W1', 'Online', 10, NOW(), 'PENDING_CONFIRMATION', 100),
                       (2, 'ORD-W2', 'Online', 10, NOW(), 'COMPLETED', 100),
                       (3, 'ORD-FB1', 'Online', 20, NOW(), 'PENDING_CONFIRMATION', 100),
                       (4, 'ORD-FB2', 'Online', 30, NOW(), 'SHIPPING', 100),
                       (5, 'ORD-S1', 'In-Store', 30, NOW(), 'COMPLETED', 100)""");
        orders = new OrderRepository(db);
    }

    private Slice search(String source) {
        return orders.search(null, "Online", null, null, null, null, null, source, 0, 20);
    }

    @Test
    void noSourceFilterReturnsEveryOnlineOrder() {
        assertEquals(4, search(null).total());
    }

    @Test
    void webOnlyKeepsOrdersPlacedByCustomers() {
        Slice web = search("WEB");
        assertEquals(2, web.total());
        assertEquals(java.util.Set.of("ORD-W1", "ORD-W2"),
                web.items().stream().map(it -> it.orderNumber()).collect(java.util.stream.Collectors.toSet()));
    }

    @Test
    void facebookOnlyKeepsOrdersCreatedByStoreAccounts() {
        Slice fb = search("FACEBOOK");
        assertEquals(2, fb.total());
        assertEquals(java.util.Set.of("ORD-FB1", "ORD-FB2"),
                fb.items().stream().map(it -> it.orderNumber()).collect(java.util.stream.Collectors.toSet()));
    }

    @Test
    void sourceFilterCombinesWithStatusFilter() {
        assertEquals(1, orders.search(null, "Online", java.util.List.of("PENDING_CONFIRMATION"), null, null, null, null,
                "FACEBOOK", 0, 20).total());
    }
}
