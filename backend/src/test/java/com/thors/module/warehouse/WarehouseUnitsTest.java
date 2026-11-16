package com.thors.module.warehouse;

import static org.junit.jupiter.api.Assertions.*;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.warehouse.WarehouseRequests.*;
import java.math.BigDecimal;
import java.util.*;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;
import org.springframework.transaction.support.TransactionTemplate;

/** Serial từng chiếc (product_unit): luôn khớp tồn theo biến thể và theo ô kệ. */
class WarehouseUnitsTest {
    private static final Account OWNER = account(1, "OWNER");
    private static final Account FAMILY = account(2, "FAMILY_MEMBER");

    private EmbeddedDatabase database;
    private JdbcTemplate db;
    private TransactionTemplate tx;
    private WarehouseStore store;
    private WarehouseDocuments docs;
    private WarehouseUnits units;
    private WarehouseBarcodes barcodes;
    private WarehouseCounts counts;

    private static Account account(int id, String role) {
        return new Account(id, role, "U" + id, "", "u" + id + "@example.com", null, null, null, "ACTIVE", null, null, null, 0, null);
    }

    @BeforeEach
    void setup() {
        database = new EmbeddedDatabaseBuilder()
                .generateUniqueName(true)
                .setType(EmbeddedDatabaseType.H2)
                .addScript("classpath:/warehouse-flow-schema.sql")
                .build();
        db = new JdbcTemplate(database);
        tx = new TransactionTemplate(new DataSourceTransactionManager(database));
        store = new WarehouseStore(db);
        var policy = new WarehousePolicy();
        docs = new WarehouseDocuments(store, policy);
        units = new WarehouseUnits(store, policy);
        barcodes = new WarehouseBarcodes(store, policy);
        counts = new WarehouseCounts(store, policy);
        db.update("UPDATE product_detail SET barcode='TH' || LPAD(CAST(detail_id AS VARCHAR), 6, '0')");
        db.update("INSERT INTO rack(rack_id,rack_code) VALUES(1,'A')");
        db.update("INSERT INTO shelf_level(shelf_level_id,rack_id,level_number) VALUES(1,1,1),(2,1,2)");
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

    private static int id(Map<String, Object> row, String key) {
        return ((Number) row.get(key)).intValue();
    }

    private int stock(int detail) {
        return db.queryForObject("SELECT stock_quantity FROM product_detail WHERE detail_id=?", Integer.class, detail);
    }

    private int count(int detail, String status) {
        return db.queryForObject("SELECT COUNT(*) FROM product_unit WHERE detail_id=? AND status=?", Integer.class, detail, status);
    }

    private String status(String serial) {
        return db.queryForObject("SELECT status FROM product_unit WHERE serial_code=?", String.class, serial);
    }

    /** Số chiếc trong kho = tồn, và ở từng ô = số lượng của ô. */
    private void assertMatches(int detail) {
        assertEquals(stock(detail), count(detail, "IN_STOCK"), "serial trong kho = tồn");
        for (var l : db.queryForList("SELECT product_location_id,quantity FROM product_location WHERE detail_id=?", detail))
            assertEquals(
                    id(l, "quantity"),
                    db.queryForObject(
                            "SELECT COUNT(*) FROM product_unit WHERE status='IN_STOCK' AND product_location_id=?",
                            Integer.class,
                            l.get("product_location_id")),
                    "serial ở ô = số lượng ô");
    }

    /** Phiếu đặt + phiếu nhập {@code qty} đã duyệt, đang chờ kiểm hàng. Trả về [phiếu nhập, dòng phiếu nhập]. */
    private int[] waitingReceipt(int detail, int qty) {
        int po = id(run(() -> docs.create(OWNER, new Document("PURCHASE_ORDER", null, "NCC A", null,
                List.of(new Line(detail, qty, BigDecimal.valueOf(1000), null))))), "receipt_id");
        run(() -> docs.confirm(OWNER, po));
        int line = db.queryForObject("SELECT receipt_item_id FROM stock_receipt_item WHERE receipt_id=?", Integer.class, po);
        int rc = id(run(() -> docs.create(OWNER, new Document("RECEIPT", po, null, null,
                List.of(new Line(detail, qty, BigDecimal.valueOf(1000), line))))), "receipt_id");
        run(() -> docs.confirm(OWNER, rc));
        int item = db.queryForObject("SELECT receipt_item_id FROM stock_receipt_item WHERE receipt_id=?", Integer.class, rc);
        return new int[] {rc, item};
    }

    @SuppressWarnings("unchecked")
    private List<String> labels(int receipt) {
        var rows = (List<Map<String, Object>>) run(() -> units.receiptLabels(FAMILY, receipt, null, null)).get("units");
        return rows.stream().map(r -> (String) r.get("serial_code")).toList();
    }

    private Map<String, Object> scan(int receipt, String code) {
        return run(() -> docs.scan(FAMILY, receipt, new Scan(code, null, null, null)));
    }

    /** Nhận đủ {@code qty} bằng quét tem serial. Trả về các mã. */
    private List<String> receiveScanned(int detail, int qty) {
        var r = waitingReceipt(detail, qty);
        var codes = labels(r[0]);
        for (var c : codes) scan(r[0], c);
        run(() -> docs.receive(FAMILY, r[0], null));
        return codes;
    }

    @Test
    void receiptLabelsAreSerialsThatCountOncePerLabel() {
        var r = waitingReceipt(1, 5);
        var codes = labels(r[0]);
        assertEquals(List.of("TH000001-0001", "TH000001-0002", "TH000001-0003", "TH000001-0004", "TH000001-0005"), codes);
        assertEquals(codes, labels(r[0]), "in lại không sinh mã mới");
        assertEquals(0, stock(1), "in tem chưa làm tăng tồn");

        assertEquals(1, id(scan(r[0], "th000001-0002"), "scanned_quantity"));
        var dup = fails(() -> docs.scan(FAMILY, r[0], new Scan("TH000001-0002", null, null, null)));
        assertEquals("SCAN_DUPLICATE", dup.code);
        scan(r[0], "TH000001-0004");
        scan(r[0], "TH000001"); // tem mã biến thể cũ vẫn đếm được
        assertEquals(3, db.queryForObject("SELECT scanned_quantity FROM stock_receipt_item WHERE receipt_item_id=?", Integer.class, r[1]));

        // Thiếu 2 chiếc: chủ cửa hàng chốt kèm lý do
        run(() -> docs.receive(OWNER, r[0], "Giao thiếu 2"));
        assertEquals(3, stock(1));
        assertEquals("IN_STOCK", status("TH000001-0002"));
        assertEquals("IN_STOCK", status("TH000001-0004"));
        assertEquals(1, count(1, "IN_STOCK") - 2, "chiếc quét bằng mã biến thể lấy một tem chưa quét");
        assertEquals(2, count(1, "VOID"), "tem in thừa bị hủy");
        assertEquals(0, count(1, "PENDING"));
        assertMatches(1);
    }

    @Test
    void labelOfAnotherReceiptOrAlreadyInStockIsRefused() {
        var first = receiveScanned(1, 2);
        var r = waitingReceipt(1, 1);
        labels(r[0]);
        var e = fails(() -> docs.scan(FAMILY, r[0], new Scan(first.get(0), null, null, null)));
        assertEquals("SCAN_WRONG_UNIT", e.code);
        assertTrue(e.getMessage().contains("đang trong kho"));
    }

    @Test
    void lowerTypedCountUnmarksLatestScansSoTheyCanBeScannedAgain() {
        var r = waitingReceipt(1, 3);
        var codes = labels(r[0]);
        scan(r[0], codes.get(0));
        scan(r[0], codes.get(1));
        run(() -> docs.scan(FAMILY, r[0], new Scan(null, r[1], 1, null)));
        assertEquals(1, id(scan(r[0], codes.get(1)) , "scanned_quantity") - 1, "tem vừa bớt quét lại được");
    }

    @Test
    void cancelledReceiptVoidsItsLabels() {
        var r = waitingReceipt(1, 4);
        labels(r[0]);
        run(() -> docs.end(OWNER, r[0], "cancel", "Hàng không về"));
        assertEquals(4, count(1, "VOID"));
        assertEquals(0, count(1, "PENDING"));
    }

    @Test
    void saleTakesOldestUnitsAndMarksTheOrderLine() {
        receiveScanned(1, 5);
        db.update("INSERT INTO orders(order_number) VALUES('DH001')");
        db.update("INSERT INTO order_item(order_id,detail_id,quantity,reserved_quantity) VALUES(1,1,2,2)");
        run(() -> store.sell(1, 1, 2, 2, 1, "ORDER_OUT:item:1", "Xuất bán đơn DH001"));
        assertEquals("SOLD", status("TH000001-0001"));
        assertEquals("SOLD", status("TH000001-0002"));
        assertEquals("IN_STOCK", status("TH000001-0003"));
        assertEquals(1, db.queryForObject("SELECT out_order_item_id FROM product_unit WHERE serial_code='TH000001-0001'", Integer.class));
        assertMatches(1);
    }

    @Test
    void shelvingAndMovingFollowLocationQuantities() {
        receiveScanned(1, 5);
        db.update("INSERT INTO product_location(detail_id,shelf_level_id,quantity) VALUES(1,1,3)");
        run(() -> store.units().sync(1));
        assertMatches(1);
        db.update("INSERT INTO product_location(detail_id,shelf_level_id,quantity) VALUES(1,2,2)");
        db.update("UPDATE product_location SET quantity=1 WHERE product_location_id=1");
        run(() -> store.units().sync(1));
        assertMatches(1);
        assertEquals(5, count(1, "IN_STOCK"), "chuyển kệ không đổi tổng");
        assertEquals(0, count(1, "SOLD"));
    }

    @Test
    void stockChangedOutsideTheWarehouseIsReconciled() {
        receiveScanned(1, 4);
        // Bán tại quầy (module bán hàng trừ thẳng tồn)
        db.update("UPDATE product_detail SET stock_quantity=stock_quantity-1 WHERE detail_id=1");
        var found = run(() -> barcodes.lookup(FAMILY, "TH000001-0001"));
        var unit = (Map<?, ?>) found.get("unit");
        assertEquals("SOLD", unit.get("status"), "chiếc nhập sớm nhất được coi là đã bán");
        assertEquals(1, id((Map<String, Object>) found.get("variant"), "detail_id"));
        assertMatches(1);
        // Khách trả lại: chiếc vừa bán quay về kho
        db.update("UPDATE product_detail SET stock_quantity=stock_quantity+1 WHERE detail_id=1");
        run(() -> store.units().sync(1));
        assertEquals("IN_STOCK", status("TH000001-0001"));
        assertEquals(4, count(1, "IN_STOCK"));
    }

    @Test
    void countShortMarksUnitsLostAndCountOverRevivesThenCreates() {
        receiveScanned(1, 5);
        int id = id(run(() -> counts.create(OWNER, new Count(null, List.of(new CountLine(1, null, 3, "LOST", null)),
                UUID.randomUUID().toString()))), "count_id");
        run(() -> counts.confirm(OWNER, id));
        assertEquals(2, count(1, "LOST"));
        assertMatches(1);
        int more = id(run(() -> counts.create(OWNER, new Count(null, List.of(new CountLine(1, null, 6, "FOUND", null)),
                UUID.randomUUID().toString()))), "count_id");
        run(() -> counts.confirm(OWNER, more));
        assertEquals(0, count(1, "LOST"), "chiếc mất được tìm thấy");
        assertEquals("TH000001-0006", db.queryForObject("SELECT MAX(serial_code) FROM product_unit WHERE detail_id=1", String.class),
                "thiếu thì sinh mã mới, không dùng lại số cũ");
        assertMatches(1);
    }

    @Test
    void listSyncsAndReportsUnprinted() {
        receiveScanned(1, 3);
        @SuppressWarnings("unchecked")
        var rows = (List<Map<String, Object>>) run(() -> units.list(FAMILY, List.of(1), "IN_STOCK", false)).get("units");
        assertEquals(3, rows.size());
        assertNotNull(rows.get(0).get("in_receipt_id"));
        run(() -> units.printed(FAMILY, List.of(id(rows.get(0), "unit_id"))));
        assertEquals(2L, run(() -> units.list(FAMILY, List.of(1), null, false)).get("unprinted"));
    }

    @Test
    void variantCodeLookupStillWorksWithoutUnit() {
        var found = run(() -> barcodes.lookup(FAMILY, "TH000002"));
        assertNull(found.get("unit"));
        assertEquals(404, fails(() -> barcodes.lookup(FAMILY, "TH000002-0009")).status);
    }
}
