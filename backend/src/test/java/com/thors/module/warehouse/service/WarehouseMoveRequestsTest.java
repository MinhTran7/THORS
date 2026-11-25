package com.thors.module.warehouse.service;

import static org.junit.jupiter.api.Assertions.*;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.warehouse.repository.WarehouseStore;
import com.thors.module.warehouse.dto.WarehouseRequests.Move;
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
        // database/migrations/2026-11-18_move_request_columns.sql: không bảng mới, chỉ thêm cột vào stock_adjustment
        db.execute("""
                ALTER TABLE stock_adjustment ADD (request_status VARCHAR(20), request_shelf_id INT, request_note VARCHAR(2000),
                  request_photo_keys VARCHAR(400), decided_by INT, decided_at TIMESTAMP)""");
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
        return db.queryForObject("SELECT COUNT(*) FROM stock_adjustment WHERE movement_type='MOVE' AND request_status IS NULL", Long.class);
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
        assertEquals("Tầng 2 bên phải", request.get("description"));
        assertEquals(PHOTO, request.get("photo_keys"), "thành viên gia đình gửi được ảnh vị trí");
        assertNull(request.get("decided_at"));
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
        var done = run(() -> requests.list(OWNER, "APPROVED")).get(0);
        assertEquals("Chủ cửa hàng", done.get("decider_name"));
        assertEquals(1L, db.queryForObject("SELECT COUNT(*) FROM product_location_image i JOIN product_location l"
                + " ON l.product_location_id=i.product_location_id WHERE l.shelf_level_id=?", Long.class, tierA2),
                "ảnh của thành viên gia đình được gắn vào vị trí khi xác nhận");
        assertNotNull(done.get("decided_at"));
        assertEquals("Tầng 2 bên phải", db.queryForObject(
                "SELECT description FROM product_location WHERE detail_id=1 AND shelf_level_id=?", String.class, tierA2));
        assertEquals(0L, db.queryForObject("SELECT COUNT(*) FROM stock_adjustment WHERE request_status IS NOT NULL"
                + " AND (quantity_change<>0 OR movement_type<>'MOVE')", Long.class), "dòng yêu cầu không làm đổi tồn");
        assertEquals(1L, db.queryForObject(
                "SELECT COUNT(*) FROM user_notification un JOIN notification n ON n.notification_id=un.notification_id"
                        + " WHERE un.user_id=2 AND n.type='WAREHOUSE_MOVE_APPROVED'", Long.class), "the requester is told");
    }

    @Test
    void rejectedOrCancelledRequestsChangeNothing() {
        var placed = run(() -> requests.submit(FAMILY, move(null, tierA1, 2, null, null)));
        assertEquals("Nhập lý do từ chối.", fails(() -> requests.end(OWNER, id(placed), "reject", " ")).getMessage());
        run(() -> requests.end(OWNER, id(placed), "reject", "Sai kệ"));
        var rejected = run(() -> requests.list(OWNER, "REJECTED")).get(0);
        assertEquals("Sai kệ", rejected.get("rejection_reason"));
        assertEquals("Chủ cửa hàng", rejected.get("decider_name"), "ghi người từ chối");
        assertNotNull(rejected.get("decided_at"), "ghi giờ từ chối");
        assertEquals("REJECTED", db.queryForObject("SELECT request_status FROM stock_adjustment WHERE adjustment_id=?", String.class, id(placed)));
        assertEquals("Yêu cầu này đã được xử lý.", fails(() -> requests.approve(OWNER, id(placed))).getMessage());
        assertEquals(4, at(tierA1));
        assertEquals(0, moves());

        var mine = run(() -> requests.submit(FAMILY, move(null, tierA1, 1, null, null)));
        assertEquals("WAREHOUSE_FORBIDDEN", fails(() -> requests.end(OTHER_FAMILY, id(mine), "cancel", null)).code);
        assertEquals("WAREHOUSE_FORBIDDEN", fails(() -> requests.end(FAMILY, id(mine), "reject", "x")).code);
        run(() -> requests.end(FAMILY, id(mine), "cancel", null));
        assertEquals("CANCELLED", db.queryForObject("SELECT request_status FROM stock_adjustment WHERE adjustment_id=?", String.class, id(mine)));
        assertEquals(4, at(tierA1));
    }

    @Test
    void requestsAreCheckedWhenSentAndCountPendingQuantities() {
        // 10 in stock, 4 on A1 → 6 not yet placed.
        run(() -> requests.submit(FAMILY, move(null, tierA1, 5, null, null)));
        assertTrue(fails(() -> requests.submit(FAMILY, move(null, tierA1, 2, null, null))).getMessage().contains("đang chờ duyệt"),
                "the 5 already requested are not offered twice");
        assertEquals("PENDING", run(() -> requests.submit(FAMILY, move(null, tierA2, 1, null, null))).get("status"),
                "description and photo are optional, even for a new place");
        assertTrue(fails(() -> requests.submit(FAMILY, move(placeA1, tierA1, 1, null, null))).getMessage().contains("khác nhau"));
        db.update("UPDATE shelf_level SET status='FULL' WHERE shelf_level_id=?", tierA2);
        assertTrue(fails(() -> requests.submit(FAMILY, move(placeA1, tierA2, 1, "x", List.of(PHOTO)))).getMessage().contains("còn chỗ"));
    }

    @Test
    void ownerMovesAtOnceAndRetriedRequestIsNotDuplicated() {
        run(() -> requests.submit(OWNER, move(null, tierA1, 2, null, null)));
        assertEquals(6, at(tierA1), "the owner's own move is saved immediately");
        assertEquals(0L, db.queryForObject("SELECT COUNT(*) FROM stock_adjustment WHERE request_status IS NOT NULL", Long.class));

        var same = move(null, tierA1, 1, null, null);
        var first = run(() -> requests.submit(FAMILY, same));
        var again = run(() -> requests.submit(FAMILY, same));
        assertEquals(id(first), id(again));
        assertEquals(1L, db.queryForObject("SELECT COUNT(*) FROM stock_adjustment WHERE request_status IS NOT NULL", Long.class));
    }

    @Test
    void approvalFailsCleanlyWhenShelvesChangedMeanwhile() {
        var request = run(() -> requests.submit(FAMILY, move(placeA1, tierA2, 4, "Tầng 2", List.of(PHOTO))));
        db.update("UPDATE product_location SET quantity=1 WHERE product_location_id=?", placeA1); // sold / moved meanwhile
        assertTrue(fails(() -> requests.approve(OWNER, id(request))).getMessage().contains("không đủ"));
        assertEquals("PENDING", db.queryForObject("SELECT request_status FROM stock_adjustment WHERE adjustment_id=?", String.class, id(request)),
                "nothing is saved; the owner can reject it");
        assertEquals(0, moves());
    }

    @Test
    void ownerMovesToANewPlaceWithoutDescriptionOrPhoto() {
        run(() -> requests.submit(OWNER, move(null, tierA2, 2, null, null)));
        assertEquals(2, at(tierA2));
        assertNull(db.queryForObject("SELECT description FROM product_location WHERE detail_id=1 AND shelf_level_id=?",
                String.class, tierA2));
    }

    @Test
    void tierNameReplacesRackCodeAndNumberWhenSet() {
        // database/migrations/2026-11-18_shelf_level_name.sql
        db.execute("ALTER TABLE shelf_level ADD COLUMN level_name VARCHAR(50)");
        var store = new WarehouseStore(db);
        var policy = new WarehousePolicy();
        var photos = new WarehousePhotos(photosDir.toString());
        var layout = new WarehouseLayout(store, policy, photos);
        var named = new WarehouseMoveRequests(store, policy, layout, photos);

        db.update("UPDATE shelf_level SET level_name='Góc cửa' WHERE shelf_level_id=?", tierA2);
        var request = run(() -> named.submit(FAMILY, move(placeA1, tierA2, 1, null, null)));
        assertEquals("A1", request.get("from_label"), "tầng chưa đặt tên: mã kệ + số tầng");
        assertEquals("Góc cửa", request.get("to_label"), "tầng đã đặt tên: hiện tên");

        db.update("UPDATE shelf_level SET level_name='  ' WHERE shelf_level_id=?", tierA2);
        assertEquals("A2", run(() -> named.list(OWNER, "PENDING")).get(0).get("to_label"), "tên trống = như cũ");
    }
}
