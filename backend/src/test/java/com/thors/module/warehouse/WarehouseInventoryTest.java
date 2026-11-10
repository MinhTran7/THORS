package com.thors.module.warehouse;

import static org.junit.jupiter.api.Assertions.*;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.warehouse.WarehouseRequests.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;
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

/**
 * Inventory read model, order holds, stock count, report and barcodes on the in-memory H2 copy of
 * the warehouse tables (warehouse-flow-schema.sql, incl. database/migrations/2026-11-06_inventory.sql).
 */
class WarehouseInventoryTest {
    private static final Account OWNER = account(1, "OWNER");
    private static final Account FAMILY = account(2, "FAMILY_MEMBER");

    private EmbeddedDatabase database;
    private JdbcTemplate db;
    private TransactionTemplate tx;
    private WarehouseStore store;
    private WarehouseDocuments docs;
    private WarehouseInventory inventory;
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
        db.execute("ALTER TABLE stock_receipt ADD CONSTRAINT ck_receipt_type CHECK (receipt_type IN ('PURCHASE_ORDER','RECEIPT','SUPPLIER_RETURN'))");
        db.execute("ALTER TABLE stock_receipt DROP CONSTRAINT ck_stock_receipt_1");
        db.execute("ALTER TABLE stock_receipt ADD CONSTRAINT ck_stock_receipt_1 CHECK (status IN"
                + " ('DRAFT','PENDING_CONFIRMATION','APPROVED','CONFIRMED','REJECTED','CANCELLED','CLOSED'))");
        store = new WarehouseStore(db);
        var policy = new WarehousePolicy();
        docs = new WarehouseDocuments(store, policy);
        inventory = new WarehouseInventory(store, policy, new WarehouseOrders(store, policy));
        counts = new WarehouseCounts(store, policy);
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

    private int stock(int detail) {
        return db.queryForObject("SELECT stock_quantity FROM product_detail WHERE detail_id=?", Integer.class, detail);
    }

    private int at(int location) {
        return db.queryForObject("SELECT quantity FROM product_location WHERE product_location_id=?", Integer.class, location);
    }

    private static int id(Map<String, Object> row, String key) {
        return ((Number) row.get(key)).intValue();
    }

    /** Confirmed PO of {@code ordered}, then a confirmed receipt of {@code received} at {@code price}. */
    private int receive(int detail, int ordered, int received, int price) {
        int po = id(run(() -> docs.create(OWNER, new Document("PURCHASE_ORDER", null, "NCC A", null,
                List.of(new Line(detail, ordered, BigDecimal.valueOf(price), null))))), "receipt_id");
        run(() -> docs.confirm(OWNER, po));
        int line = db.queryForObject("SELECT receipt_item_id FROM stock_receipt_item WHERE receipt_id=?", Integer.class, po);
        int rc = id(run(() -> docs.create(OWNER, new Document("RECEIPT", po, null, null,
                List.of(new Line(detail, received, BigDecimal.valueOf(price), line))))), "receipt_id");
        run(() -> docs.confirm(OWNER, rc));
        return po;
    }

    /** Puts {@code qty} of already-received unplaced stock on shelf {@code shelf} (as a MOVE would). */
    private int place(int detail, int shelf, int qty) {
        db.update("INSERT INTO product_location(detail_id,shelf_level_id,quantity) VALUES(?,?,?)", detail, shelf, qty);
        int loc = db.queryForObject("SELECT MAX(product_location_id) FROM product_location", Integer.class);
        db.update("INSERT INTO stock_adjustment(detail_id,quantity_change,reason,adjusted_by,movement_type,movement_quantity,destination_location_id,idempotency_key)"
                + " VALUES(?,0,'Xếp hàng',1,'MOVE',?,?,?)", detail, qty, loc, UUID.randomUUID().toString());
        return loc;
    }

    /** An online order line holding {@code qty} (what checkout writes). */
    private int hold(int detail, int qty) {
        db.update("INSERT INTO orders(order_number,order_type,order_status,stock_hold_created_at) VALUES(?,'Online','PENDING_CONFIRMATION',CURRENT_TIMESTAMP)",
                "ORD-" + UUID.randomUUID().toString().substring(0, 8));
        int order = db.queryForObject("SELECT MAX(order_id) FROM orders", Integer.class);
        db.update("INSERT INTO order_item(order_id,detail_id,quantity,reserved_quantity) VALUES(?,?,?,?)", order, detail, qty, qty);
        return db.queryForObject("SELECT MAX(order_item_id) FROM order_item", Integer.class);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> row(Account who, int detail) {
        var list = run(() -> inventory.list(who, null, null, null, null, null, null, null, null, 0, 100, true));
        return ((List<Map<String, Object>>) list.get("items")).stream()
                .filter(r -> id(r, "detail_id") == detail).findFirst().orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> metrics(Account who, String q) {
        return (Map<String, Object>) run(() -> inventory.list(who, q, null, null, null, null, null, null, null, 0, 1, false)).get("metrics");
    }

    @Test
    void totalEqualsPlacedPlusUnplacedAndHoldsReduceOnlySellable() {
        int po = receive(1, 100, 30, 50000);
        place(1, 1, 20);
        hold(1, 4);
        var r = row(OWNER, 1);
        assertEquals(30, r.get("stock_quantity"));
        assertEquals(20, r.get("assigned_quantity"));
        assertEquals(10, r.get("unassigned_quantity"));
        assertEquals(4, r.get("held_quantity"));
        assertEquals(26, r.get("available_quantity"), "placed is not the same as sellable");
        assertEquals(70L, r.get("incoming_quantity"), "remaining of the confirmed order, not added to stock");
        assertEquals(new BigDecimal("50000"), r.get("unit_cost"));
        assertEquals(new BigDecimal("1500000"), r.get("stock_value"));
        assertNull(row(FAMILY, 1).get("unit_cost"), "family never receives cost");
        assertFalse(row(FAMILY, 1).containsKey("stock_value"));
        var m = metrics(OWNER, null);
        assertEquals(30L, m.get("stock"));
        assertEquals(20L, m.get("assigned"));
        assertEquals(10L, m.get("unassigned"));
        assertEquals(1L, m.get("count_in"));
        assertEquals(5L, m.get("count_out"), "metrics cover every variant, not only the page of 1 row");
        assertFalse(metrics(FAMILY, null).containsKey("stock_value"));
        // Closing the order removes it from incoming.
        run(() -> docs.end(OWNER, po, "close", "NCC hết hàng"));
        assertEquals(0L, row(OWNER, 1).get("incoming_quantity"));
    }

    @Test
    void draftOrPendingOrdersAreNeverIncomingAndStockWithoutReceiptHasNoCost() {
        run(() -> docs.create(OWNER, new Document("PURCHASE_ORDER", null, "NCC A", null,
                List.of(new Line(2, 10, BigDecimal.valueOf(1000), null)))));
        db.update("UPDATE product_detail SET stock_quantity=5 WHERE detail_id=2");
        var r = row(OWNER, 2);
        assertEquals(0L, r.get("incoming_quantity"));
        assertNull(r.get("unit_cost"));
        assertNull(r.get("stock_value"), "no cost basis: not 0, not sale price");
        assertEquals(5L, r.get("unvalued_quantity"));
        assertEquals(5, r.get("ledger_gap"), "stock without any recorded movement is flagged");
    }

    @Test
    void searchFiltersSortAndPaginateOnTheBackend() {
        receive(1, 10, 10, 1000);
        receive(4, 10, 3, 1000);
        place(4, 2, 3);
        db.update("UPDATE product_detail SET barcode='TH000004' WHERE detail_id=4");
        assertEquals(1, run(() -> inventory.list(OWNER, "th000004", null, null, null, null, null, null, null, 0, 20, false)).get("total"));
        assertEquals(1, run(() -> inventory.list(OWNER, "SP00011", null, null, null, null, null, null, null, 0, 20, false)).get("total"));
        assertEquals(1, run(() -> inventory.list(OWNER, "ao so mi", null, null, null, null, null, null, null, 0, 20, false)).get("total"),
                "accent-insensitive name search");
        assertEquals(1, run(() -> inventory.list(OWNER, null, null, null, null, 2, null, null, null, 0, 20, false)).get("total"));
        assertEquals(1, run(() -> inventory.list(OWNER, null, null, null, null, null, "unassigned", null, null, 0, 20, false)).get("total"));
        assertEquals(2, run(() -> inventory.list(OWNER, null, null, null, 1, null, "in", null, null, 0, 20, false)).get("total"));
        @SuppressWarnings("unchecked")
        var sorted = (List<Map<String, Object>>) run(() -> inventory.list(OWNER, null, null, null, null, null, null, null, "stock_desc", 0, 2, false)).get("items");
        assertEquals(List.of(1, 4), sorted.stream().map(r -> id(r, "detail_id")).toList());
        assertEquals(6, run(() -> inventory.list(OWNER, null, null, null, null, null, null, null, null, 2, 2, false)).get("total"));
        assertEquals(400, fails(() -> inventory.list(OWNER, null, null, null, null, null, "bogus", null, null, 0, 20, false)).status);
    }

    @Test
    void thresholdDistinguishesNotSetFromZeroAndOnlyOwnerSetsIt() {
        receive(1, 10, 5, 1000);
        hold(1, 5);
        assertEquals("IN", row(OWNER, 1).get("stock_state"), "no threshold: never low");
        run(() -> inventory.threshold(OWNER, 1, 0));
        assertEquals(0, row(OWNER, 1).get("min_stock_quantity"));
        assertEquals("LOW", row(OWNER, 1).get("stock_state"), "threshold 0: low once nothing is sellable");
        run(() -> inventory.threshold(OWNER, 1, null));
        assertNull(row(OWNER, 1).get("min_stock_quantity"));
        assertEquals(403, fails(() -> inventory.threshold(FAMILY, 1, 3)).status);
    }

    @Test
    void saleTakesUnplacedFirstThenFullestLocationAndConsumesItsOwnHoldOnce() {
        receive(1, 20, 20, 1000);
        int small = place(1, 1, 4);
        int big = place(1, 2, 10); // unplaced 6
        int mine = hold(1, 15);
        run(() -> {
            store.lock();
            return store.sell(1, 1, 15, 15, mine, "ORDER_OUT:item:" + mine, "Xuất bán test");
        });
        db.update("UPDATE order_item SET reserved_quantity=0 WHERE order_item_id=?", mine);
        assertEquals(5, stock(1));
        assertEquals(4, at(small));
        assertEquals(1, at(big));
        assertEquals(-15, db.queryForObject("SELECT SUM(quantity_change) FROM stock_adjustment WHERE order_item_id=?", Integer.class, mine));
        var r = row(OWNER, 1);
        assertEquals(0, r.get("held_quantity"));
        assertEquals(5, (int) r.get("assigned_quantity") + (int) r.get("unassigned_quantity"));
        // A replay writing the same ledger key is refused by the unique idempotency key.
        db.update("UPDATE product_detail SET stock_quantity=6 WHERE detail_id=1"); // 1 unplaced again
        assertThrows(Exception.class, () -> run(() -> store.sell(1, 1, 1, 0, mine, "ORDER_OUT:item:" + mine, "lặp")));
        assertEquals(6, stock(1));
    }

    @Test
    void ordersCannotHoldOrSellBeyondSellableAndReturnsKeepHeldStock() {
        int po = receive(1, 10, 10, 1000);
        int other = hold(1, 8);
        assertTrue(fails(() -> {
            store.lock();
            store.sell(1, 1, 3, 0, other, "POS:x", "Bán tại quầy");
        }).getMessage().contains("đang giữ cho đơn khác 8"));
        assertEquals(10, stock(1));
        int rc = db.queryForObject("SELECT receipt_id FROM stock_receipt WHERE receipt_type='RECEIPT' AND source_receipt_id=?", Integer.class, po);
        int line = db.queryForObject("SELECT receipt_item_id FROM stock_receipt_item WHERE receipt_id=?", Integer.class, rc);
        int ret = id(run(() -> docs.create(OWNER, new Document("SUPPLIER_RETURN", rc, null, "Hàng lỗi",
                List.of(new Line(1, 3, BigDecimal.valueOf(1000), line))))), "receipt_id");
        int retLine = db.queryForObject("SELECT receipt_item_id FROM stock_receipt_item WHERE receipt_id=?", Integer.class, ret);
        var e = fails(() -> docs.confirm(OWNER, ret, null, List.of(new Pick(retLine, null, 3))));
        assertTrue(e.getMessage().contains("đang giữ cho đơn bán 8"), e.getMessage());
        assertEquals(10, stock(1));
    }

    @Test
    void concurrentSalesOfTheLastUnitsSellOnlyOnce() throws Exception {
        receive(1, 5, 5, 1000);
        var pool = Executors.newFixedThreadPool(2);
        var start = new CountDownLatch(1);
        var results = new ArrayList<Future<Boolean>>();
        for (int i = 0; i < 2; i++) {
            int n = i;
            results.add(pool.submit(() -> {
                start.await();
                try {
                    run(() -> {
                        store.lock();
                        db.update("INSERT INTO orders(order_number,order_type,order_status) VALUES(?,'In-Store','COMPLETED')", "POS-" + n);
                        int order = db.queryForObject("SELECT MAX(order_id) FROM orders", Integer.class);
                        db.update("INSERT INTO order_item(order_id,detail_id,quantity) VALUES(?,1,4)", order);
                        int item = db.queryForObject("SELECT MAX(order_item_id) FROM order_item", Integer.class);
                        return store.sell(1, 1, 4, 0, item, "POS:" + item, "Bán tại quầy");
                    });
                    return true;
                } catch (ApiException e) {
                    return false;
                }
            }));
        }
        start.countDown();
        int ok = 0;
        for (var f : results) if (f.get(30, TimeUnit.SECONDS)) ok++;
        pool.shutdown();
        assertEquals(1, ok);
        assertEquals(1, stock(1));
    }

    private Count count(String note, CountLine... lines) {
        return new Count(note, List.of(lines), UUID.randomUUID().toString());
    }

    @Test
    void familyCountsAndSubmitsOwnerConfirmsAndOnlyConfirmationChangesStock() {
        receive(1, 20, 20, 1000);
        int loc = place(1, 1, 12); // unplaced 8
        var draft = run(() -> counts.create(FAMILY, count("Kiểm kê tháng",
                new CountLine(1, loc, 10, "DAMAGED", "2 áo rách"),
                new CountLine(1, null, 8, null, null))));
        int id = id(draft, "count_id");
        assertEquals(20, stock(1), "draft never changes stock");
        assertEquals(403, fails(() -> counts.confirm(FAMILY, id)).status);
        run(() -> counts.submit(FAMILY, id));
        assertEquals(20, stock(1), "pending never changes stock");
        assertTrue(fails(() -> counts.submit(OWNER, id)).getMessage().contains("xác nhận trực tiếp"));
        run(() -> counts.confirm(OWNER, id));
        assertEquals(18, stock(1));
        assertEquals(10, at(loc));
        run(() -> counts.confirm(OWNER, id)); // repeated request
        assertEquals(18, stock(1), "applied once");
        @SuppressWarnings("unchecked")
        var card = (List<Map<String, Object>>) run(() -> inventory.history(OWNER, 1, "stock", null, null, null, 0, 20)).get("items");
        var adjustment = card.get(0);
        assertEquals("ADJUSTMENT", adjustment.get("movement_type"));
        assertEquals(-2, id(adjustment, "quantity_change"));
        assertEquals(18, id(adjustment, "balance_after"));
        assertEquals("STOCK_COUNT", adjustment.get("doc_kind"));
        assertEquals(id, id(adjustment, "doc_id"));
        assertEquals("A1", adjustment.get("source_label"));
    }

    @Test
    void twoOwnersConfirmingTheSameCountAtOnceApplyItOnce() throws Exception {
        receive(1, 20, 20, 1000);
        int id = id(run(() -> counts.create(FAMILY, count(null, new CountLine(1, null, 17, "LOST", null)))), "count_id");
        run(() -> counts.submit(FAMILY, id));
        var pool = Executors.newFixedThreadPool(2);
        var start = new CountDownLatch(1);
        var results = new ArrayList<Future<Object>>();
        for (int i = 0; i < 2; i++)
            results.add(pool.submit(() -> {
                start.await();
                return run(() -> counts.confirm(OWNER, id));
            }));
        start.countDown();
        for (var f : results) f.get(30, TimeUnit.SECONDS); // both succeed: the second sees CONFIRMED and does nothing
        pool.shutdown();
        assertEquals(17, stock(1));
        assertEquals(1, db.queryForObject("SELECT COUNT(*) FROM stock_adjustment WHERE idempotency_key LIKE ?", Integer.class, "count:" + id + ":%"));
    }

    @Test
    void ownerConfirmsDirectlyAndChangesAfterCountingBlockConfirmation() {
        receive(1, 20, 20, 1000);
        int id = id(run(() -> counts.create(OWNER, count(null, new CountLine(1, null, 22, "FOUND", null)))), "count_id");
        hold(1, 1);
        db.update("UPDATE product_detail SET stock_quantity=19 WHERE detail_id=1"); // a sale after counting
        var e = fails(() -> counts.confirm(OWNER, id));
        assertEquals("COUNT_STALE", e.code);
        assertTrue(e.getMessage().contains("lúc đếm 20, hiện 19"), e.getMessage());
        assertEquals(19, stock(1), "old count does not overwrite newer stock");
        run(() -> counts.edit(OWNER, id, count(null, new CountLine(1, null, 22, "FOUND", null))));
        run(() -> counts.confirm(OWNER, id));
        assertEquals(22, stock(1));
    }

    @Test
    void countDifferencesNeedAReasonAndMissingDocumentsMustUseTheOriginalFlow() {
        receive(1, 20, 20, 1000);
        assertTrue(fails(() -> counts.create(FAMILY, count(null, new CountLine(1, null, 15, null, null))))
                .getMessage().contains("cần chọn lý do"));
        int id = id(run(() -> counts.create(FAMILY, count(null, new CountLine(1, null, 15, "MISSING_DOCUMENT", "bán chưa ghi")))), "count_id");
        assertTrue(fails(() -> counts.confirm(OWNER, id)).getMessage().contains("chứng từ gốc"));
        assertEquals(20, stock(1));
        assertTrue(fails(() -> counts.create(FAMILY, count(null, new CountLine(1, null, 20, null, null), new CountLine(1, null, 20, null, null))))
                .getMessage().contains("một lần"));
        run(() -> counts.end(FAMILY, id, "cancel", "đếm lại"));
        assertTrue(fails(() -> counts.confirm(OWNER, id)).getMessage().contains("không còn chờ"));
    }

    @Test
    void reportBalancesOpeningIncreaseDecreaseClosingAndIgnoresMoves() {
        receive(1, 20, 20, 1000);
        place(1, 1, 5);
        int item = hold(1, 3);
        run(() -> {
            store.lock();
            return store.sell(1, 1, 3, 3, item, "ORDER_OUT:item:" + item, "Xuất bán");
        });
        var today = LocalDate.now(WarehouseStore.STORE_ZONE);
        var rep = run(() -> inventory.report(OWNER, today, today, null, null, true));
        @SuppressWarnings("unchecked")
        var rows = (List<Map<String, Object>>) rep.get("items");
        var r = rows.stream().filter(x -> id(x, "detail_id") == 1).findFirst().orElseThrow();
        assertEquals(0L, r.get("opening"));
        assertEquals(20L, r.get("increase"));
        assertEquals(3L, r.get("decrease"));
        assertEquals(17L, r.get("closing"));
        assertEquals(17, stock(1), "report matches stock at the same moment");
        assertEquals(20L, r.get("in_RECEIPT"));
        assertEquals(3L, r.get("out_ORDER_OUT"));
        assertEquals(new BigDecimal("17000"), r.get("closing_value"));
        var yesterday = run(() -> inventory.report(OWNER, today.minusDays(1), today.minusDays(1), null, null, false));
        @SuppressWarnings("unchecked")
        var before = ((List<Map<String, Object>>) yesterday.get("items")).stream().filter(x -> id(x, "detail_id") == 1).findFirst().orElseThrow();
        assertEquals(0L, before.get("closing"));
        var family = run(() -> inventory.report(FAMILY, today, today, null, null, true));
        assertEquals(false, family.get("cost_visible"));
        @SuppressWarnings("unchecked")
        var familyRow = ((List<Map<String, Object>>) family.get("items")).get(0);
        assertFalse(familyRow.containsKey("closing_value"));
        assertEquals(400, fails(() -> inventory.report(OWNER, today, today.minusDays(1), null, null, false)).status);
        @SuppressWarnings("unchecked")
        var moves = (List<Map<String, Object>>) run(() -> inventory.history(OWNER, 1, "move", null, null, null, 0, 20)).get("items");
        assertEquals(1, moves.size());
        assertEquals(0, id(moves.get(0), "quantity_change"));
    }

    @Test
    void variantDetailListsHoldsLocationsAndOpenOrders() {
        int po = receive(1, 30, 10, 1000);
        place(1, 2, 6);
        hold(1, 2);
        var d = run(() -> inventory.detail(OWNER, 1));
        assertEquals(1, ((List<?>) d.get("holds")).size());
        assertEquals(1, ((List<?>) d.get("location_rows")).size());
        @SuppressWarnings("unchecked")
        var incoming = (List<Map<String, Object>>) d.get("incoming");
        assertEquals(po, id(incoming.get(0), "order_id"));
        assertEquals(20L, ((Number) incoming.get(0).get("remaining")).longValue());
        assertEquals(404, fails(() -> inventory.detail(OWNER, 999)).status);
    }

    /** Ledger rows with explicit times so the replay order is the business order. */
    private void move(String at, int change, String type, Integer receiptItem, Integer orderItem, Integer returnItem) {
        db.update("INSERT INTO stock_adjustment(detail_id,quantity_change,reason,adjusted_at,adjusted_by,movement_type,movement_quantity,receipt_item_id,order_item_id,return_request_item_id)"
                + " VALUES(5,?,'test',?,1,?,?,?,?,?)", change, java.sql.Timestamp.valueOf(at), type, Math.abs(change), receiptItem, orderItem, returnItem);
        db.update("UPDATE product_detail SET stock_quantity=stock_quantity+? WHERE detail_id=5", change);
    }

    private int priceLine(int price) {
        db.update("INSERT INTO stock_receipt(receipt_type,created_by,status) VALUES('RECEIPT',1,'CONFIRMED')");
        int doc = db.queryForObject("SELECT MAX(receipt_id) FROM stock_receipt", Integer.class);
        db.update("INSERT INTO stock_receipt_item(receipt_id,detail_id,quantity,unit_price) VALUES(?,5,1,?)", doc, price);
        return db.queryForObject("SELECT MAX(receipt_item_id) FROM stock_receipt_item", Integer.class);
    }

    @Test
    void costIsAPerpetualMovingAverageOverTheLedgerNotAPeriodAverage() {
        int a = priceLine(100), b = priceLine(130);
        db.update("INSERT INTO orders(order_number) VALUES('X')");
        db.update("INSERT INTO order_item(order_id,detail_id,quantity) VALUES(1,5,5)");
        db.update("INSERT INTO return_request_item(return_request_id,order_item_id) VALUES(1,1)");
        move("2026-01-01 08:00:00", 10, "RECEIPT", a, null, null);          // 10 @100 = 1000
        move("2026-01-02 08:00:00", -5, "ORDER_OUT", null, 1, null);        // sold 5 @100, left 5 = 500
        move("2026-01-03 08:00:00", 10, "RECEIPT", b, null, null);          // +1300 -> 15 = 1800, avg 120
        move("2026-01-04 08:00:00", -2, "SUPPLIER_RETURN", b, null, null);  // back at 130 -> 13 = 1540
        move("2026-01-05 08:00:00", 1, "RESTOCK", null, null, 1);          // customer returns at sold cost 100 -> 14 = 1640
        move("2026-01-06 08:00:00", -4, "ADJUSTMENT", null, null, null);   // count loss at avg 117.14 -> 10 = 1171.43
        var r = row(OWNER, 5);
        assertEquals(10, r.get("stock_quantity"));
        assertEquals(new BigDecimal("1171"), r.get("stock_value"), "periodic average (10x100+10x130)/20 would give 1150");
        assertEquals(new BigDecimal("117"), r.get("unit_cost"));
        var rep = run(() -> inventory.report(OWNER, LocalDate.of(2026, 1, 3), LocalDate.of(2026, 1, 4), null, null, true));
        @SuppressWarnings("unchecked")
        var line = ((List<Map<String, Object>>) rep.get("items")).stream().filter(x -> id(x, "detail_id") == 5).findFirst().orElseThrow();
        assertEquals(5L, line.get("opening"));
        assertEquals(new BigDecimal("500"), line.get("opening_value"));
        assertEquals(13L, line.get("closing"));
        assertEquals(new BigDecimal("1540"), line.get("closing_value"));
        var now = run(() -> inventory.report(OWNER, LocalDate.of(2026, 1, 1), LocalDate.now(WarehouseStore.STORE_ZONE), null, null, true));
        @SuppressWarnings("unchecked")
        var today = ((List<Map<String, Object>>) now.get("items")).stream().filter(x -> id(x, "detail_id") == 5).findFirst().orElseThrow();
        assertEquals(r.get("stock_value"), today.get("closing_value"), "current value = report closing value");
    }

    @Test
    void stockWithoutRecordedOriginHasNoCostBasisUntilItIsGone() {
        int a = priceLine(100);
        db.update("UPDATE product_detail SET stock_quantity=3 WHERE detail_id=5"); // 3 units before any ledger
        move("2026-01-01 08:00:00", 10, "RECEIPT", a, null, null);
        var r = row(OWNER, 5);
        assertNull(r.get("stock_value"));
        assertNotNull(r.get("cost_note"));
        assertEquals(13L, r.get("unvalued_quantity"));
        move("2026-01-02 08:00:00", -13, "ADJUSTMENT", null, null, null);
        move("2026-01-03 08:00:00", 4, "RECEIPT", a, null, null);
        assertEquals(new BigDecimal("400"), row(OWNER, 5).get("stock_value"), "after the unknown stock left, the basis is clean again");
    }

    @Test
    void barcodesAreGeneratedOnlyForSelectedMissingVariantsAndStayUnique() {
        var barcodes = new WarehouseBarcodes(store, new WarehousePolicy());
        db.update("UPDATE product_detail SET barcode='TH000002' WHERE detail_id=1"); // someone typed this code
        db.update("UPDATE product_detail SET barcode='KEEP-3' WHERE detail_id=3");
        var result = run(() -> barcodes.generate(OWNER, List.of(2, 3)));
        assertEquals(1, result.get("generated"));
        assertEquals("TH000002-1", db.queryForObject("SELECT barcode FROM product_detail WHERE detail_id=2", String.class));
        assertEquals("KEEP-3", db.queryForObject("SELECT barcode FROM product_detail WHERE detail_id=3", String.class));
        assertNull(db.queryForObject("SELECT barcode FROM product_detail WHERE detail_id=4", String.class));
        assertEquals(403, fails(() -> barcodes.generate(FAMILY, null)).status);
    }
}
