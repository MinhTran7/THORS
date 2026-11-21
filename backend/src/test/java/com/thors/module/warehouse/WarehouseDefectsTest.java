package com.thors.module.warehouse;

import static org.junit.jupiter.api.Assertions.*;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
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

/** Hàng lỗi từng chiếc: báo lỗi không đổi tồn; bán tránh chiếc lỗi; trả NCC / bỏ hẳn mới giảm tồn. */
class WarehouseDefectsTest {
    private static final Account OWNER = account(1, "OWNER");
    private static final Account FAMILY = account(2, "FAMILY_MEMBER");
    private static final String PHOTO = "0123456789abcdef0123456789abcdef.jpg";

    @TempDir Path photosDir;

    private EmbeddedDatabase database;
    private JdbcTemplate db;
    private TransactionTemplate tx;
    private WarehouseStore store;
    private WarehouseDefects defects;
    private WarehouseBarcodes barcodes;
    private WarehouseUnits units;

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
        store = new WarehouseStore(db);
        var policy = new WarehousePolicy();
        Files.writeString(photosDir.resolve(PHOTO), "jpg");
        defects = new WarehouseDefects(store, policy, new WarehousePhotos(photosDir.toString()));
        barcodes = new WarehouseBarcodes(store, policy);
        units = new WarehouseUnits(store, policy);
        db.update("INSERT INTO rack(rack_id,rack_code) VALUES(1,'A')");
        db.update("INSERT INTO shelf_level(shelf_level_id,rack_id,level_number) VALUES(1,1,1)");
        // 5 chiếc Áo thun Đen M: 2 chiếc ở A1, 3 chiếc chưa xếp (TH000001-0001..0005)
        db.update("UPDATE product_detail SET stock_quantity=5 WHERE detail_id=1");
        db.update("INSERT INTO product_location(detail_id,shelf_level_id,quantity) VALUES(1,1,2)");
        run(() -> store.units().sync(1));
    }

    @AfterEach
    void cleanup() {
        database.shutdown();
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

    private int stock() {
        return db.queryForObject("SELECT stock_quantity FROM product_detail WHERE detail_id=1", Integer.class);
    }

    private String status(String serial) {
        return db.queryForObject("SELECT status FROM product_unit WHERE serial_code=?", String.class, serial);
    }

    private String serialAt(int location) {
        return db.queryForObject(
                "SELECT MIN(serial_code) FROM product_unit WHERE status='IN_STOCK' AND product_location_id=?", String.class, location);
    }

    private int report(Account who, String serial, String... types) {
        var row = run(() -> defects.report(who, serial, List.of(types), "Rách ở vai", "SUPPLIER", List.of(PHOTO)));
        return ((Number) row.get("defect_id")).intValue();
    }

    @Test
    void reportingKeepsStockAndUpdatingReusesTheOpenDefect() {
        int id = report(FAMILY, "th000001-0001", "Rách");
        assertEquals(5, stock(), "báo lỗi không trừ tồn");
        assertEquals("IN_STOCK", status("TH000001-0001"));
        assertEquals(id, report(FAMILY, "TH000001-0001", "Rách", "Bung chỉ"), "chiếc đã có lỗi mở: cập nhật");
        var row = db.queryForMap("SELECT defect_types,defect_photos,defect_status FROM product_unit WHERE unit_id=?", id);
        assertEquals("Rách, Bung chỉ", row.get("defect_types"));
        assertEquals(PHOTO, row.get("defect_photos"));
        assertEquals(1, db.queryForObject("SELECT COUNT(*) FROM product_unit WHERE defect_status IS NOT NULL", Integer.class));
    }

    @Test
    void reportNeedsASerialAKnownTypeAndAPieceInStock() {
        assertTrue(fails(() -> defects.report(FAMILY, "TH000001", List.of("Rách"), null, "WAREHOUSE", null))
                .getMessage().contains("tem serial"));
        assertTrue(fails(() -> defects.report(FAMILY, "TH000001-0002", List.of("Thủng"), null, "WAREHOUSE", null))
                .getMessage().contains("chưa có trong danh sách"));
        assertEquals(404, fails(() -> defects.report(FAMILY, "TH000001-0099", List.of("Rách"), null, "WAREHOUSE", null)).status);
        db.update("UPDATE product_detail SET stock_quantity=4 WHERE detail_id=1"); // bán tại quầy (lấy hàng chưa xếp trước)
        run(() -> store.units().sync(1));
        String sold = db.queryForObject("SELECT serial_code FROM product_unit WHERE status='SOLD'", String.class);
        assertTrue(fails(() -> defects.report(FAMILY, sold, List.of("Rách"), null, "WAREHOUSE", null))
                .getMessage().contains("không còn trong kho"));
    }

    @Test
    void sellingLeavesTheDefectivePieceInStock() {
        String onShelf = serialAt(1);
        report(FAMILY, onShelf, "Rách");
        db.update("INSERT INTO orders(order_number) VALUES('DH001')");
        db.update("INSERT INTO order_item(order_id,detail_id,quantity,reserved_quantity) VALUES(1,1,1,1)");
        // Bán 1 chiếc lấy từ ô A1 (sau khi hết hàng chưa xếp): lấy chiếc lành trên A1, không lấy chiếc lỗi
        db.update("UPDATE product_detail SET stock_quantity=3 WHERE detail_id=1");
        run(() -> store.units().sync(1));
        run(() -> store.sell(1, 1, 1, 1, 1, "ORDER_OUT:item:1", "Xuất bán đơn DH001"));
        assertEquals("IN_STOCK", status(onShelf), "chiếc lỗi ở lại trong kho");
        assertEquals(onShelf, serialAt(1));
    }

    @Test
    void supplierReturnTakesTheDefectivePieceAndClosesItsDefect() {
        String newest = "TH000001-0005";
        int id = report(FAMILY, newest, "Rách");
        db.update("UPDATE product_detail SET stock_quantity=4 WHERE detail_id=1");
        run(() -> store.units().sync(1, new ProductUnits.Out(ProductUnits.RETURNED_SUPPLIER, null, null, "Trả NCC"), ProductUnits.EXTERNAL_IN));
        assertEquals("RETURNED_SUPPLIER", status(newest), "trả NCC lấy chiếc lỗi trước, dù là chiếc mới nhất");
        assertEquals("RETURNED", db.queryForObject("SELECT defect_status FROM product_unit WHERE unit_id=?", String.class, id));
    }

    @Test
    void fixDoesNotChangeStock() {
        int id = report(FAMILY, "TH000001-0002", "Ố bẩn");
        run(() -> defects.fix(FAMILY, id, "Giặt sạch"));
        assertEquals(5, stock());
        assertEquals("FIXED", db.queryForObject("SELECT defect_status FROM product_unit WHERE unit_id=?", String.class, id));
        assertTrue(fails(() -> defects.fix(FAMILY, id, null)).getMessage().contains("đã được xử lý"));
    }

    @Test
    void onlyTheOwnerDiscardsAndThatTakesExactlyThatPieceOffItsShelf() {
        String onShelf = serialAt(1);
        int id = report(FAMILY, onShelf, "Rách");
        assertEquals(403, fails(() -> defects.discard(FAMILY, id, "Rách nặng")).status);
        assertTrue(fails(() -> defects.discard(OWNER, id, " ")).getMessage().contains("lý do"));
        run(() -> defects.discard(OWNER, id, "Rách nặng"));
        assertEquals(4, stock());
        assertEquals(1, db.queryForObject("SELECT quantity FROM product_location WHERE detail_id=1", Integer.class));
        assertEquals("LOST", status(onShelf));
        assertEquals(-1, db.queryForObject(
                "SELECT quantity_change FROM stock_adjustment WHERE idempotency_key=?", Integer.class, "defect:" + id));
        assertEquals(4, db.queryForObject("SELECT COUNT(*) FROM product_unit WHERE status='IN_STOCK'", Integer.class));
    }

    @Test
    void discardKeepsStockHeldForOrders() {
        int id = report(FAMILY, "TH000001-0003", "Rách");
        db.update("INSERT INTO orders(order_number) VALUES('DH002')");
        db.update("INSERT INTO order_item(order_id,detail_id,quantity,reserved_quantity) VALUES(1,1,5,5)");
        assertTrue(fails(() -> defects.discard(OWNER, id, "Rách")).getMessage().contains("đang giữ"));
        assertEquals(5, stock());
    }

    @Test
    void lookupAndUnitListShowTheOpenDefect() {
        report(FAMILY, "TH000001-0004", "Bung chỉ");
        var unit = (Map<?, ?>) run(() -> barcodes.lookup(FAMILY, "TH000001-0004")).get("unit");
        assertEquals("Bung chỉ", unit.get("defect_types"));
        var listed = run(() -> units.list(FAMILY, List.of(1), null, false, true));
        assertEquals(1L, listed.get("defective"));
        assertEquals(1, ((List<?>) listed.get("units")).size());
    }

    @Test
    void ownerTypesNewDefectsThatThenBecomeChoicesFamilyPicksFromTheList() {
        assertTrue(run(() -> defects.types(FAMILY)).contains("Rách"));
        assertTrue(fails(() -> defects.report(FAMILY, "TH000001-0001", List.of("Thủng lỗ"), null, "WAREHOUSE", null))
                .getMessage().contains("chủ cửa hàng"));
        assertTrue(fails(() -> defects.report(OWNER, "TH000001-0001", List.of("A, B"), null, "WAREHOUSE", null))
                .getMessage().contains("dấu phẩy"));
        report(OWNER, "TH000001-0001", "  Thủng   lỗ ", "rách");
        assertEquals("Thủng lỗ, Rách", db.queryForObject(
                "SELECT defect_types FROM product_unit WHERE serial_code='TH000001-0001'", String.class), "khớp tên mẫu có sẵn");
        assertTrue(run(() -> defects.types(FAMILY)).contains("Thủng lỗ"), "lỗi tự gõ thành lựa chọn");
        report(FAMILY, "TH000001-0002", "thủng lỗ");
        var list = run(() -> defects.list(FAMILY, null, "th000001"));
        assertEquals(2, ((List<?>) list.get("items")).size());
    }
}
