package com.thors.module.warehouse;

import static org.junit.jupiter.api.Assertions.*;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.warehouse.WarehouseRequests.Move;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;
import org.springframework.transaction.support.TransactionTemplate;

/** Family shelving requests wait for the owner; on an in-memory H2 copy, never a real database. */
class WarehouseMoveRequestsTest {
    private static final Account OWNER = account(1, "OWNER");
    private static final Account FAMILY = account(2, "FAMILY_MEMBER");
    private static final Account OTHER_FAMILY = account(4, "FAMILY_MEMBER");
    private static final String PHOTO = "0123456789abcdef0123456789abcdef.jpg";

    @TempDir Path photosDir;
    private EmbeddedDatabase database;
    private JdbcTemplate db;
    private TransactionTemplate tx;
    private WarehouseMoveRequests requests;
    private int tierA1;
    private int tierA2;
    private int placeA1;

    private static Account account(int id, String role) {
        return new Account(id, role, "U" + id, "", "u" + id + "@example.com", null, null, null, "ACTIVE", null, null, null, 0, null);
    }

    @BeforeEach
    void setup() throws Exception {
        database = new EmbeddedDatabaseBuilder()
                .generateUniqueName(true)
                .setType(EmbeddedDatabaseType.H2)
                .addScript("classpath:/warehouse-flow-schema.sql")
                .build();
        db = new JdbcTemplate(database);
        tx = new TransactionTemplate(new DataSourceTransactionManager(database));
        db.execute("ALTER TABLE rack ADD COLUMN is_active TINYINT NOT NULL DEFAULT 1");
        db.execute("ALTER TABLE shelf_level ADD COLUMN is_active TINYINT NOT NULL DEFAULT 1");
        db.execute("ALTER TABLE shelf_level ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'");
        db.execute("""
                CREATE TABLE product_location_image (product_location_image_id INT AUTO_INCREMENT PRIMARY KEY, product_location_id INT NOT NULL,
                  image_url VARCHAR(500) NOT NULL, cloud_public_id VARCHAR(255), deleted_at TIMESTAMP)""");
        // database/migrations/2026-11-10_location_move_request.sql
        db.execute("""
                CREATE TABLE location_move_request (request_id INT AUTO_INCREMENT PRIMARY KEY, detail_id INT NOT NULL,
                  from_location_id INT, to_shelf_id INT, quantity INT NOT NULL, description VARCHAR(2000), photo_keys VARCHAR(400),
                  request_key VARCHAR(36) NOT NULL UNIQUE, status VARCHAR(20) NOT NULL DEFAULT 'PENDING', requested_by INT NOT NULL,
                  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, decided_by INT, decided_at TIMESTAMP,
                  rejection_reason VARCHAR(255),
                  CONSTRAINT ck_move_request_quantity CHECK (quantity > 0),
                  CONSTRAINT ck_move_request_status CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')))""");
        db.update("INSERT INTO `user` VALUES (4, 2, 'Người nhà 2', 'ACTIVE')");
        db.update("INSERT INTO rack(rack_id,rack_code) VALUES(1,'A')");
        tierA1 = insert("INSERT INTO shelf_level(rack_id,level_number) VALUES(1,1)");
        tierA2 = insert("INSERT INTO shelf_level(rack_id,level_number) VALUES(1,2)");
        db.update("UPDATE product_detail SET stock_quantity=10 WHERE detail_id=1");
        placeA1 = insert("INSERT INTO product_location(detail_id,shelf_level_id,quantity,description) VALUES(1," + tierA1 + ",4,'Góc trái')");
        db.update("INSERT INTO product_location_image(product_location_id,image_url) VALUES(?, 'x')", placeA1);
        Files.writeString(photosDir.resolve(PHOTO), "jpg");
        var store = new WarehouseStore(db);
        var policy = new WarehousePolicy();
        var photos = new WarehousePhotos(photosDir.toString());
        requests = new WarehouseMoveRequests(store, policy, new WarehouseLayout(store, policy, photos), photos);
    }

    @AfterEach
    void cleanup() {
        database.shutdown();
    }

    private int insert(String sql) {
        db.update(sql);
        return db.queryForObject("SELECT MAX(" + (sql.contains("shelf_level(") ? "shelf_level_id" : "product_location_id") + ") FROM "
                + (sql.contains("shelf_level(") ? "shelf_level" : "product_location"), Integer.class);
    }

    private <T> T run(Supplier<T> action) {
        return tx.execute(status -> action.get());
    }

    private ApiException fails(Runnable action) {
        return assertThrows(ApiException.class, () -> run(() -> {
            action.run();
            return null;
        }));
    }

    private int at(int tier) {
        return db.queryForObject("SELECT COALESCE(SUM(quantity),0) FROM product_location WHERE detail_id=1 AND shelf_level_id=?",
                Integer.class, tier);
    }

    private long moves() {
        return db.queryForObject("SELECT COUNT(*) FROM stock_adjustment WHERE movement_type='MOVE'", Long.class);
    }

    private static Move move(Integer from, Integer to, int qty, String description, List<String> photos) {
        return new Move(1, from, to, qty, description, photos, UUID.randomUUID().toString());
    }

    private static int id(Map<String, Object> row) {
        return ((Number) row.get("request_id")).intValue();
    }

    @Test
    void familyMoveWaitsUntilOwnerConfirms() {
        var request = run(() -> requests.submit(FAMILY, move(placeA1, tierA2, 3, "Tầng 2 bên phải", List.of(PHOTO))));
        assertEquals("PENDING", request.get("status"));
        assertEquals(4, at(tierA1), "nothing moves while the request waits");
        assertEquals(0, at(tierA2));
        assertEquals(0, moves());
        assertEquals(1L, db.queryForObject(
                "SELECT COUNT(*) FROM user_notification un JOIN notification n ON n.notification_id=un.notification_id"
                        + " WHERE un.user_id=1 AND n.type='WAREHOUSE_MOVE_PENDING'", Long.class), "the owner is told");
        assertEquals("WAREHOUSE_FORBIDDEN", fails(() -> requests.approve(FAMILY, id(request))).code);

        run(() -> requests.approve(OWNER, id(request)));
        assertEquals(1, at(tierA1));
        assertEquals(3, at(tierA2));
        assertEquals(1, moves());
        assertEquals(10, db.queryForObject("SELECT stock_quantity FROM product_detail WHERE detail_id=1", Integer.class),
                "moving never changes total stock");
        run(() -> requests.approve(OWNER, id(request)));
        assertEquals(1, moves(), "a repeated approval moves goods once");
        assertEquals(1L, db.queryForObject(
                "SELECT COUNT(*) FROM user_notification un JOIN notification n ON n.notification_id=un.notification_id"
                        + " WHERE un.user_id=2 AND n.type='WAREHOUSE_MOVE_APPROVED'", Long.class), "the requester is told");
    }

    @Test
    void rejectedOrCancelledRequestsChangeNothing() {
        var placed = run(() -> requests.submit(FAMILY, move(null, tierA1, 2, null, null)));
        assertEquals("Nhập lý do từ chối.", fails(() -> requests.end(OWNER, id(placed), "reject", " ")).getMessage());
        run(() -> requests.end(OWNER, id(placed), "reject", "Sai kệ"));
        assertEquals("REJECTED", db.queryForObject("SELECT status FROM location_move_request WHERE request_id=?", String.class, id(placed)));
        assertEquals("Yêu cầu này đã được xử lý.", fails(() -> requests.approve(OWNER, id(placed))).getMessage());
        assertEquals(4, at(tierA1));
        assertEquals(0, moves());

        var mine = run(() -> requests.submit(FAMILY, move(null, tierA1, 1, null, null)));
        assertEquals("WAREHOUSE_FORBIDDEN", fails(() -> requests.end(OTHER_FAMILY, id(mine), "cancel", null)).code);
        assertEquals("WAREHOUSE_FORBIDDEN", fails(() -> requests.end(FAMILY, id(mine), "reject", "x")).code);
        run(() -> requests.end(FAMILY, id(mine), "cancel", null));
        assertEquals("CANCELLED", db.queryForObject("SELECT status FROM location_move_request WHERE request_id=?", String.class, id(mine)));
        assertEquals(4, at(tierA1));
    }

    @Test
    void requestsAreCheckedWhenSentAndCountPendingQuantities() {
        // 10 in stock, 4 on A1 → 6 not yet placed.
        run(() -> requests.submit(FAMILY, move(null, tierA1, 5, null, null)));
        assertTrue(fails(() -> requests.submit(FAMILY, move(null, tierA1, 2, null, null))).getMessage().contains("đang chờ duyệt"),
                "the 5 already requested are not offered twice");
        assertTrue(fails(() -> requests.submit(FAMILY, move(null, tierA2, 1, null, null))).getMessage().contains("mô tả và ảnh"),
                "a new place needs a description and a photo");
        assertTrue(fails(() -> requests.submit(FAMILY, move(placeA1, tierA1, 1, null, null))).getMessage().contains("khác nhau"));
        db.update("UPDATE shelf_level SET status='FULL' WHERE shelf_level_id=?", tierA2);
        assertTrue(fails(() -> requests.submit(FAMILY, move(placeA1, tierA2, 1, "x", List.of(PHOTO)))).getMessage().contains("còn chỗ"));
    }

    @Test
    void ownerMovesAtOnceAndRetriedRequestIsNotDuplicated() {
        run(() -> requests.submit(OWNER, move(null, tierA1, 2, null, null)));
        assertEquals(6, at(tierA1), "the owner's own move is saved immediately");
        assertEquals(0L, db.queryForObject("SELECT COUNT(*) FROM location_move_request", Long.class));

        var same = move(null, tierA1, 1, null, null);
        var first = run(() -> requests.submit(FAMILY, same));
        var again = run(() -> requests.submit(FAMILY, same));
        assertEquals(id(first), id(again));
        assertEquals(1L, db.queryForObject("SELECT COUNT(*) FROM location_move_request", Long.class));
    }

    @Test
    void approvalFailsCleanlyWhenShelvesChangedMeanwhile() {
        var request = run(() -> requests.submit(FAMILY, move(placeA1, tierA2, 4, "Tầng 2", List.of(PHOTO))));
        db.update("UPDATE product_location SET quantity=1 WHERE product_location_id=?", placeA1); // sold / moved meanwhile
        assertTrue(fails(() -> requests.approve(OWNER, id(request))).getMessage().contains("không đủ"));
        assertEquals("PENDING", db.queryForObject("SELECT status FROM location_move_request WHERE request_id=?", String.class, id(request)),
                "nothing is saved; the owner can reject it");
        assertEquals(0, moves());
    }
}
