package com.thors.module.warehouse.service;

import com.thors.module.warehouse.repository.WarehouseStore;

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

/**
 * Hàng lỗi theo mã chung của biến thể: báo N chiếc lỗi không đổi tồn; số lỗi không vượt tồn; trả NCC
 * đóng lỗi trước; bỏ hẳn mới giảm tồn.
 */
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
        db.update("INSERT INTO rack(rack_id,rack_code) VALUES(1,'A')");
        db.update("INSERT INTO shelf_level(shelf_level_id,rack_id,level_number) VALUES(1,1,1)");
        // 5 chiếc Áo thun Đen M, mã chung TH000001: 2 chiếc ở A1, 3 chiếc chưa xếp
        db.update("UPDATE product_detail SET stock_quantity=5,barcode='TH000001' WHERE detail_id=1");
        db.update("INSERT INTO product_location(detail_id,shelf_level_id,quantity) VALUES(1,1,2)");
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

    private int open() {
        return db.queryForObject("SELECT COUNT(*) FROM product_unit WHERE defect_status='OPEN'", Integer.class);
    }

    private String defectStatus(int id) {
        return db.queryForObject("SELECT defect_status FROM product_unit WHERE unit_id=?", String.class, id);
    }

    /** Báo {@code qty} chiếc lỗi; trả về id các dòng lỗi vừa tạo. */
    private List<Integer> report(Account who, String code, int qty, String... types) {
        var result = run(() -> defects.report(who, code, qty, List.of(types), "Rách ở vai", "SUPPLIER", List.of(PHOTO)));
        var ids = new ArrayList<Integer>();
        for (var item : (List<?>) result.get("items")) ids.add(((Number) ((Map<?, ?>) item).get("defect_id")).intValue());
        return ids;
    }

    @Test
    void reportingByTheSharedCodeAddsOneRowPerPieceAndKeepsStock() {
        var ids = report(FAMILY, "th000001", 2, "Rách", "Bung chỉ");
        assertEquals(2, ids.size());
        assertEquals(5, stock(), "báo lỗi không trừ tồn");
        assertEquals(2, open());
        var row = db.queryForMap("SELECT defect_types,defect_photos,status FROM product_unit WHERE unit_id=?", ids.get(0));
        assertEquals("Rách, Bung chỉ", row.get("defect_types"));
        assertEquals(PHOTO, row.get("defect_photos"));
        assertEquals("IN_STOCK", row.get("status"));
    }

    @Test
    void reportNeedsAKnownCodeAKnownTypeAndPiecesNotAlreadyDefective() {
        assertEquals(404, fails(() -> defects.report(FAMILY, "TH999999", 1, List.of("Rách"), null, "WAREHOUSE", null)).status);
        assertTrue(fails(() -> defects.report(FAMILY, "TH000001", 1, List.of("Thủng"), null, "WAREHOUSE", null))
                .getMessage().contains("chưa có trong danh sách"));
        assertTrue(fails(() -> defects.report(FAMILY, "TH000001", 0, List.of("Rách"), null, "WAREHOUSE", null))
                .getMessage().contains("từ 1"));
        report(FAMILY, "TH000001", 4, "Rách");
        assertTrue(fails(() -> defects.report(FAMILY, "TH000001", 2, List.of("Rách"), null, "WAREHOUSE", null))
                .getMessage().contains("tối đa 1"), "tồn 5, đã lỗi 4: chỉ báo thêm được 1");
    }

    @Test
    void sellingClosesDefectsOnlyWhenStockDropsBelowThem() {
        report(FAMILY, "TH000001", 2, "Rách");
        db.update("INSERT INTO orders(order_number) VALUES('DH001')");
        db.update("INSERT INTO order_item(order_id,detail_id,quantity,reserved_quantity) VALUES(1,1,3,3)");
        run(() -> store.sell(1, 1, 3, 3, 1, "ORDER_OUT:item:1", "Xuất bán đơn DH001"));
        assertEquals(2, stock());
        assertEquals(2, open(), "bán chiếc lành: lỗi giữ nguyên");
        db.update("UPDATE order_item SET reserved_quantity=0");
        db.update("INSERT INTO order_item(order_id,detail_id,quantity,reserved_quantity) VALUES(1,1,1,1)");
        run(() -> store.sell(1, 1, 1, 1, 2, "ORDER_OUT:item:2", "Xuất bán đơn DH001"));
        assertEquals(1, open(), "tồn còn 1 thì chỉ còn tối đa 1 chiếc lỗi");
        assertEquals(1, db.queryForObject("SELECT COUNT(*) FROM product_unit WHERE defect_status='SOLD'", Integer.class));
    }

    @Test
    void supplierReturnClosesTheOldestOpenDefectsFirst() {
        int first = report(FAMILY, "TH000001", 1, "Rách").get(0);
        int second = report(FAMILY, "TH000001", 1, "Ố bẩn").get(0);
        run(() -> store.units().closeDefects(1, 1, "RETURNED", "Trả NCC"));
        assertEquals("RETURNED", defectStatus(first));
        assertEquals("OPEN", defectStatus(second));
        assertEquals("RETURNED_SUPPLIER",
                db.queryForObject("SELECT status FROM product_unit WHERE unit_id=?", String.class, first));
    }

    @Test
    void fixDoesNotChangeStock() {
        int id = report(FAMILY, "TH000001", 1, "Ố bẩn").get(0);
        run(() -> defects.fix(FAMILY, id, "Giặt sạch"));
        assertEquals(5, stock());
        assertEquals("FIXED", defectStatus(id));
        assertTrue(fails(() -> defects.fix(FAMILY, id, null)).getMessage().contains("đã được xử lý"));
    }

    @Test
    void onlyTheOwnerDiscardsAndThatTakesOnePieceFromUnplacedStockFirst() {
        int id = report(FAMILY, "TH000001", 1, "Rách").get(0);
        assertEquals(403, fails(() -> defects.discard(FAMILY, id, "Rách nặng")).status);
        assertTrue(fails(() -> defects.discard(OWNER, id, " ")).getMessage().contains("lý do"));
        run(() -> defects.discard(OWNER, id, "Rách nặng"));
        assertEquals(4, stock());
        assertEquals(2, db.queryForObject("SELECT quantity FROM product_location WHERE detail_id=1", Integer.class),
                "còn hàng chưa xếp nên không đụng ô kệ");
        assertEquals("DISCARDED", defectStatus(id));
        assertEquals(-1, db.queryForObject(
                "SELECT quantity_change FROM stock_adjustment WHERE idempotency_key=?", Integer.class, "defect:" + id));
    }

    @Test
    void discardTakesFromTheShelfWhenNothingIsUnplaced() {
        db.update("UPDATE product_detail SET stock_quantity=2 WHERE detail_id=1"); // cả 2 chiếc đều ở A1
        int id = report(FAMILY, "TH000001", 1, "Rách").get(0);
        run(() -> defects.discard(OWNER, id, "Rách nặng"));
        assertEquals(1, stock());
        assertEquals(1, db.queryForObject("SELECT quantity FROM product_location WHERE detail_id=1", Integer.class));
    }

    @Test
    void discardKeepsStockHeldForOrders() {
        int id = report(FAMILY, "TH000001", 1, "Rách").get(0);
        db.update("INSERT INTO orders(order_number) VALUES('DH002')");
        db.update("INSERT INTO order_item(order_id,detail_id,quantity,reserved_quantity) VALUES(1,1,5,5)");
        assertTrue(fails(() -> defects.discard(OWNER, id, "Rách")).getMessage().contains("đang giữ"));
        assertEquals(5, stock());
    }

    @Test
    void lookupShowsHowManyPiecesAreDefective() {
        report(FAMILY, "TH000001", 2, "Bung chỉ");
        var variant = (Map<?, ?>) run(() -> barcodes.lookup(FAMILY, "TH000001")).get("variant");
        assertEquals(2, ((Number) variant.get("defective_quantity")).intValue());
    }

    @Test
    void ownerTypesNewDefectsThatThenBecomeChoicesFamilyPicksFromTheList() {
        assertTrue(run(() -> defects.types(FAMILY)).contains("Rách"));
        assertTrue(fails(() -> defects.report(FAMILY, "TH000001", 1, List.of("Thủng lỗ"), null, "WAREHOUSE", null))
                .getMessage().contains("chủ cửa hàng"));
        assertTrue(fails(() -> defects.report(OWNER, "TH000001", 1, List.of("A, B"), null, "WAREHOUSE", null))
                .getMessage().contains("dấu phẩy"));
        int id = report(OWNER, "TH000001", 1, "  Thủng   lỗ ", "rách").get(0);
        assertEquals("Thủng lỗ, Rách", db.queryForObject(
                "SELECT defect_types FROM product_unit WHERE unit_id=?", String.class, id), "khớp tên mẫu có sẵn");
        assertTrue(run(() -> defects.types(FAMILY)).contains("Thủng lỗ"), "lỗi tự gõ thành lựa chọn");
        report(FAMILY, "TH000001", 1, "thủng lỗ");
        var list = run(() -> defects.list(FAMILY, null, "th000001"));
        assertEquals(2, ((List<?>) list.get("items")).size());
    }
}
