package com.thors.module.warehouse;

import static org.junit.jupiter.api.Assertions.*;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.product.repository.ProductImageRepository;
import com.thors.module.product.repository.ProductRepository;
import com.thors.module.product.service.ProductService;
import com.thors.module.warehouse.WarehouseRequests.*;
import java.math.BigDecimal;
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
 * Purchase order → receipt → supplier return flow on an in-memory H2 copy of the relevant tables.
 * CHECK constraints follow database/SQL_v1.sql unless a test explicitly opts into the proposed
 * SUPPLIER_RETURN values. Never touches a real database.
 */
class WarehouseOrderFlowTest {
    private static final Account OWNER = account(1, "OWNER");
    private static final Account FAMILY = account(2, "FAMILY_MEMBER");
    private static final Account STAFF = account(3, "STAFF");

    private EmbeddedDatabase database;
    private JdbcTemplate db;
    private TransactionTemplate tx;
    private WarehouseDocuments docs;
    private WarehouseOrders orders;
    private WarehouseCatalog catalog;
    private WarehouseSettlements settlements;

    private static Account account(int id, String role) {
        return new Account(id, role, "U" + id, "", "u" + id + "@example.com", null, null, null, "ACTIVE", null, null, null, 0, null);
    }

    private void schema(boolean allowSupplierReturn) {
        database = new EmbeddedDatabaseBuilder()
                .generateUniqueName(true)
                .setType(EmbeddedDatabaseType.H2)
                .addScript("classpath:/warehouse-flow-schema.sql")
                .build();
        db = new JdbcTemplate(database);
        tx = new TransactionTemplate(new DataSourceTransactionManager(database));
        String receiptTypes = allowSupplierReturn ? "'PURCHASE_ORDER','RECEIPT','SUPPLIER_RETURN'" : "'PURCHASE_ORDER','RECEIPT'";
        String movementTypes = allowSupplierReturn
                ? "'ADJUSTMENT','RECEIPT','ORDER_OUT','MOVE','RESTOCK','SUPPLIER_RETURN'"
                : "'ADJUSTMENT','RECEIPT','ORDER_OUT','MOVE','RESTOCK'";
        db.execute("ALTER TABLE stock_receipt ADD CONSTRAINT ck_receipt_type CHECK (receipt_type IN (" + receiptTypes + "))");
        db.execute("ALTER TABLE stock_adjustment ADD CONSTRAINT ck_stock_adjustment_1 CHECK (movement_type IN (" + movementTypes + "))");
        if (allowSupplierReturn) {
            // database/migrations/2026-11-04_supplier_return.sql: APPROVED = return approved, waiting for dispatch.
            db.execute("ALTER TABLE stock_receipt DROP CONSTRAINT ck_stock_receipt_1");
            db.execute("ALTER TABLE stock_receipt ADD CONSTRAINT ck_stock_receipt_1 CHECK (status IN"
                    + " ('DRAFT','PENDING_CONFIRMATION','APPROVED','CONFIRMED','REJECTED','CANCELLED','CLOSED'))");
        }
        var store = new WarehouseStore(db);
        var policy = new WarehousePolicy();
        docs = new WarehouseDocuments(store, policy);
        orders = new WarehouseOrders(store, policy);
        settlements = new WarehouseSettlements(store, policy);
        var productRepository = new ProductRepository(db);
        catalog = new WarehouseCatalog(store, policy,
                new ProductService(productRepository, db, null, new ProductImageRepository(db)), productRepository);
    }

    @BeforeEach
    void setup() {
        schema(false);
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

    private static int id(Map<String, Object> row) {
        return ((Number) row.get("receipt_id")).intValue();
    }

    private int order(String supplier, int... detailQtyPrice) {
        var lines = new ArrayList<Line>();
        for (int i = 0; i < detailQtyPrice.length; i += 3)
            lines.add(new Line(detailQtyPrice[i], detailQtyPrice[i + 1], BigDecimal.valueOf(detailQtyPrice[i + 2]), null));
        return id(run(() -> docs.create(OWNER, new Document("PURCHASE_ORDER", null, supplier, null, lines))));
    }

    private int confirmedOrder(String supplier, int... detailQtyPrice) {
        int po = order(supplier, detailQtyPrice);
        run(() -> docs.confirm(OWNER, po));
        return po;
    }

    private int line(int po, int detail) {
        return db.queryForObject("SELECT receipt_item_id FROM stock_receipt_item WHERE receipt_id=? AND detail_id=?", Integer.class, po, detail);
    }

    private int receipt(Account who, int po, int detail, int qty) {
        int src = line(po, detail);
        BigDecimal price = db.queryForObject("SELECT unit_price FROM stock_receipt_item WHERE receipt_item_id=?", BigDecimal.class, src);
        return id(run(() -> docs.create(who, new Document("RECEIPT", po, null, null, List.of(new Line(detail, qty, price, src))))));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> orderLine(int po, int detail) {
        var detailView = run(() -> orders.detail(OWNER, po));
        return ((List<Map<String, Object>>) detailView.get("items")).stream()
                .filter(i -> ((Number) i.get("detail_id")).intValue() == detail).findFirst().orElseThrow();
    }

    private long n(Map<String, Object> row, String key) {
        return ((Number) row.get(key)).longValue();
    }

    @Test
    void directOrderWithManyVariantsConfirmsWithoutTouchingStock() {
        int po = order("Công ty May A", 1, 10, 50000, 2, 20, 52000, 3, 5, 61000, 4, 7, 70000, 5, 9, 80000);
        assertEquals(5, db.queryForObject("SELECT COUNT(*) FROM stock_receipt_item WHERE receipt_id=?", Integer.class, po));
        run(() -> docs.confirm(OWNER, po));
        assertEquals(0, db.queryForObject("SELECT SUM(stock_quantity) FROM product_detail", Integer.class));
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM stock_adjustment", Integer.class));
        var view = run(() -> orders.detail(OWNER, po));
        assertEquals("NOT_RECEIVED", view.get("progress"));
        assertEquals(0, new BigDecimal("3055000").compareTo((BigDecimal) view.get("total_amount")));
        var dup = fails(() -> docs.create(OWNER, new Document("PURCHASE_ORDER", null, "A", null,
                List.of(new Line(1, 1, BigDecimal.ONE, null), new Line(1, 2, BigDecimal.ONE, null)))));
        assertTrue(dup.getMessage().contains("một dòng"));
    }

    @Test
    void receiveSixtyThenFortyOnlyConfirmedReceiptsChangeStock() {
        int po = confirmedOrder("A", 1, 100, 50000);
        int first = receipt(FAMILY, po, 1, 60);
        run(() -> docs.submit(FAMILY, first));
        assertEquals(0, stock(1), "draft/pending receipt must not change stock");
        assertEquals(100, n(orderLine(po, 1), "remaining_quantity"));
        assertEquals(60, n(orderLine(po, 1), "pending_receipt_quantity"));
        run(() -> docs.confirm(OWNER, first));
        assertEquals(60, stock(1));
        assertEquals("PARTIAL", run(() -> orders.detail(OWNER, po)).get("progress"));
        assertEquals(40, n(orderLine(po, 1), "remaining_quantity"));
        int second = receipt(OWNER, po, 1, 40);
        assertEquals(60, stock(1));
        run(() -> docs.confirm(OWNER, second));
        assertEquals(100, stock(1));
        var line = orderLine(po, 1);
        assertEquals(100, n(line, "ordered_quantity"), "ordered quantity is never rewritten");
        assertEquals(0, n(line, "remaining_quantity"));
        assertEquals(0, n(line, "over_quantity"));
        assertEquals("RECEIVED", run(() -> orders.detail(OWNER, po)).get("progress"));
        var blocked = fails(() -> receipt(OWNER, po, 1, 1));
        assertTrue(blocked.getMessage().contains("nhận đủ"));
        assertEquals(2, ((List<?>) run(() -> orders.detail(OWNER, po)).get("related")).size());
    }

    @Test
    void receiveSixtyAndTwentyFiveThenCloseShortfallKeepsHistory() {
        int po = confirmedOrder("A", 1, 100, 50000);
        run(() -> docs.confirm(OWNER, receipt(OWNER, po, 1, 60)));
        run(() -> docs.confirm(OWNER, receipt(OWNER, po, 1, 25)));
        int draft = receipt(OWNER, po, 1, 5);
        assertTrue(fails(() -> docs.end(OWNER, po, "close", "NCC hết hàng")).getMessage().contains("nháp"));
        run(() -> docs.end(OWNER, draft, "cancel", "Không giao"));
        run(() -> docs.end(OWNER, po, "close", "NCC hết hàng"));
        var view = run(() -> orders.detail(OWNER, po));
        assertEquals("CLOSED", view.get("status"));
        assertEquals("CLOSED_SHORT", view.get("progress"));
        assertEquals(15L, n(view, "closed_short_quantity"));
        assertEquals(0L, n(view, "remaining_quantity"));
        assertEquals(85L, n(view, "fulfilled_quantity"));
        assertEquals(85, stock(1));
        assertEquals(3, ((List<?>) view.get("related")).size(), "confirmed and cancelled receipts stay visible");
        assertTrue(fails(() -> receipt(OWNER, po, 1, 1)).getMessage().contains("đóng"));
    }

    @Test
    void overDeliveryIsBlockedWithFullNumbersAndNoStockChange() {
        int po = confirmedOrder("A", 1, 100, 50000);
        run(() -> docs.confirm(OWNER, receipt(OWNER, po, 1, 60)));
        for (var who : List.of(FAMILY, OWNER)) {
            var e = fails(() -> receipt(who, po, 1, 50));
            assertTrue(e.getMessage().contains("đặt 100, đã nhập 60, còn thiếu 40, lần này 50, vượt 10"), e.getMessage());
        }
        assertEquals(60, stock(1));
    }

    @Test
    void substituteVariantAndChangedPriceAreRejected() {
        int po = confirmedOrder("A", 1, 10, 50000);
        int src = line(po, 1);
        var substitute = fails(() -> docs.create(OWNER, new Document("RECEIPT", po, null, null,
                List.of(new Line(2, 10, BigDecimal.valueOf(50000), src)))));
        assertTrue(substitute.getMessage().contains("thay thế"));
        var price = fails(() -> docs.create(OWNER, new Document("RECEIPT", po, null, null,
                List.of(new Line(1, 10, BigDecimal.valueOf(45000), src)))));
        assertTrue(price.getMessage().contains("giá đặt"));
        assertEquals(0, stock(1));
        assertEquals(0, stock(2));
        assertEquals(0, new BigDecimal("50000").compareTo(
                db.queryForObject("SELECT unit_price FROM stock_receipt_item WHERE receipt_item_id=?", BigDecimal.class, src)));
    }

    @Test
    void ownerConfirmsDraftsDirectlyWhileFamilyOnlySubmits() {
        int po = order("A", 1, 100, 50000);
        var draft = run(() -> orders.detail(OWNER, po));
        assertEquals("DRAFT", draft.get("status"));
        assertEquals("NOT_APPLICABLE", draft.get("progress"), "a draft order has no receiving obligation yet");
        run(() -> docs.confirm(OWNER, po)); // DRAFT -> CONFIRMED, no PENDING step required
        var confirmed = run(() -> orders.detail(OWNER, po));
        assertEquals("CONFIRMED", confirmed.get("status"));
        assertEquals("NOT_RECEIVED", confirmed.get("progress"));
        assertEquals(100L, n(confirmed, "remaining_quantity"), "after confirmation the whole ordered quantity is missing");

        int ownerDraft = receipt(OWNER, po, 1, 30);
        run(() -> docs.confirm(OWNER, ownerDraft)); // owner's draft receipt confirmed without submit
        assertEquals(30, stock(1));

        int familyDraft = receipt(FAMILY, po, 1, 20);
        assertEquals("WAREHOUSE_FORBIDDEN", fails(() -> docs.confirm(FAMILY, familyDraft)).code);
        run(() -> docs.submit(FAMILY, familyDraft));
        assertEquals("PENDING_CONFIRMATION",
                db.queryForObject("SELECT status FROM stock_receipt WHERE receipt_id=?", String.class, familyDraft));
        assertEquals("WAREHOUSE_FORBIDDEN", fails(() -> docs.confirm(FAMILY, familyDraft)).code);
        assertEquals(30, stock(1), "family can never increase stock");
        assertEquals("WAREHOUSE_FORBIDDEN", fails(() -> docs.submit(FAMILY, order("A", 2, 1, 1000))).code,
                "family still cannot handle purchase orders");
        run(() -> docs.confirm(OWNER, familyDraft));
        assertEquals(50, stock(1));
    }

    @Test
    void doubleConfirmAndRetryIncreaseStockOnce() {
        int po = confirmedOrder("A", 1, 10, 50000);
        int r = receipt(OWNER, po, 1, 10);
        run(() -> docs.confirm(OWNER, r));
        run(() -> docs.confirm(OWNER, r));
        run(() -> docs.confirm(OWNER, r, Map.of(line(po, 1), 10)));
        assertEquals(10, stock(1));
        assertEquals(1, db.queryForObject("SELECT COUNT(*) FROM stock_adjustment", Integer.class));
    }

    @Test
    void secondReceiptIsRecheckedAndStaleApprovalIsRefused() {
        int po = confirmedOrder("A", 1, 100, 50000);
        int a = receipt(OWNER, po, 1, 60);
        int b = receipt(FAMILY, po, 1, 60);
        int c = receipt(FAMILY, po, 1, 30);
        int src = line(po, 1);
        run(() -> docs.confirm(OWNER, a, Map.of(src, 100)));
        var over = fails(() -> docs.confirm(OWNER, b));
        assertTrue(over.getMessage().contains("vượt 20"), over.getMessage());
        var stale = fails(() -> docs.confirm(OWNER, c, Map.of(src, 100)));
        assertEquals("WAREHOUSE_STALE", stale.code);
        assertTrue(stale.getMessage().contains("hiện tại 40"));
        assertEquals(60, stock(1));
        run(() -> docs.confirm(OWNER, c, Map.of(src, 40)));
        assertEquals(90, stock(1));
    }

    @Test
    void concurrentConfirmationsOfTwoReceiptsCannotOverReceive() throws Exception {
        int po = confirmedOrder("A", 1, 100, 50000);
        int a = receipt(OWNER, po, 1, 60);
        int b = receipt(OWNER, po, 1, 60);
        var pool = Executors.newFixedThreadPool(2);
        var start = new CountDownLatch(1);
        var results = new ArrayList<Future<Boolean>>();
        for (int r : List.of(a, b))
            results.add(pool.submit(() -> {
                start.await();
                try {
                    run(() -> docs.confirm(OWNER, r));
                    return true;
                } catch (ApiException e) {
                    return false;
                }
            }));
        start.countDown();
        int ok = 0;
        for (var f : results) if (f.get(30, TimeUnit.SECONDS)) ok++;
        pool.shutdown();
        assertEquals(1, ok);
        assertEquals(60, stock(1));
    }

    @Test
    void confirmedOrderCanBeCancelledOnlyBeforeAnyReceipt() {
        int empty = confirmedOrder("A", 1, 10, 50000);
        run(() -> docs.end(OWNER, empty, "cancel", "Đổi kế hoạch"));
        assertEquals("CANCELLED", db.queryForObject("SELECT status FROM stock_receipt WHERE receipt_id=?", String.class, empty));
        assertTrue(fails(() -> receipt(OWNER, empty, 1, 1)).getMessage().contains("hủy"));

        int withDraft = confirmedOrder("A", 1, 10, 50000);
        int draft = receipt(FAMILY, withDraft, 1, 5);
        assertTrue(fails(() -> docs.end(OWNER, withDraft, "cancel", "x")).getMessage().contains("nháp"));
        run(() -> docs.confirm(OWNER, draft));
        assertTrue(fails(() -> docs.end(OWNER, withDraft, "cancel", "x")).getMessage().contains("nhập thực tế"));
        assertEquals(5, stock(1));
        assertTrue(fails(() -> docs.end(FAMILY, withDraft, "cancel", "x")).code.equals("WAREHOUSE_FORBIDDEN"));
    }

    @Test
    void copyCreatesDraftWithLinesButNoHistory() {
        int po = confirmedOrder("A", 1, 10, 50000, 2, 4, 30000);
        run(() -> docs.confirm(OWNER, receipt(OWNER, po, 1, 10)));
        int copy = id(run(() -> docs.copy(OWNER, po)));
        var view = run(() -> orders.detail(OWNER, copy));
        assertEquals("DRAFT", view.get("status"));
        assertEquals("A", view.get("manufacturer_name"));
        assertEquals(14L, n(view, "ordered_quantity"));
        assertEquals(0L, n(view, "received_quantity"));
        assertTrue(((List<?>) view.get("related")).isEmpty());
        assertNull(db.queryForObject("SELECT confirmed_by FROM stock_receipt WHERE receipt_id=?", Integer.class, copy));
        assertEquals("WAREHOUSE_FORBIDDEN", fails(() -> docs.copy(FAMILY, po)).code);
    }

    @Test
    void permissionsAreEnforcedInBackend() {
        assertEquals("WAREHOUSE_FORBIDDEN", fails(() -> docs.create(FAMILY,
                new Document("PURCHASE_ORDER", null, "A", null, List.of(new Line(1, 1, BigDecimal.ONE, null))))).code);
        assertEquals("WAREHOUSE_FORBIDDEN", fails(() -> orders.list(STAFF, null, null, null, null, 0, 20)).code);
        int po = confirmedOrder("A", 1, 10, 50000);
        int mine = receipt(FAMILY, po, 1, 4);
        run(() -> docs.submit(FAMILY, mine));
        assertEquals("WAREHOUSE_FORBIDDEN", fails(() -> docs.confirm(FAMILY, mine)).code);
        assertEquals(0, stock(1));
        int owners = receipt(OWNER, po, 1, 2);
        assertEquals("WAREHOUSE_FORBIDDEN", fails(() -> docs.submit(FAMILY, owners)).code);
        assertEquals("WAREHOUSE_FORBIDDEN", fails(() -> catalog.createProduct(FAMILY,
                new QuickProduct(1, "Áo mới", null, List.of(new QuickVariant("Đen", "M", BigDecimal.TEN)), false))).code);
    }

    @Test
    @SuppressWarnings("unchecked")
    void supplierHistoryCountsOnlyConfirmedOrdersAndOpenObligations() {
        int confirmedA = confirmedOrder("Công ty May A", 1, 100, 50000);
        order("Công ty May A", 2, 10, 1000);                          // draft: not history
        int cancelled = order("Công ty May A", 3, 10, 1000);
        run(() -> docs.end(OWNER, cancelled, "cancel", "x"));          // cancelled: not history
        confirmedOrder("Xưởng B", 1, 50, 48000);                       // other supplier still open
        int closed = confirmedOrder("Xưởng B", 4, 30, 1000);
        run(() -> docs.end(OWNER, closed, "close", "ngừng"));          // closed: no open obligation
        run(() -> docs.confirm(OWNER, receipt(OWNER, confirmedA, 1, 30)));

        var history = run(() -> orders.variants(OWNER, "  công ty  may a ", "history", null, null, null, 0, 10));
        var items = (List<Map<String, Object>>) history.get("items");
        assertEquals(1, items.size());
        var v1 = items.get(0);
        assertEquals(1, ((Number) v1.get("detail_id")).intValue());
        assertEquals(70L, n(v1, "on_order_supplier"));
        assertEquals(50L, n(v1, "on_order_other"));
        assertEquals(30, ((Number) v1.get("stock_quantity")).intValue(), "store-wide stock, not per supplier");
        assertEquals(0, new BigDecimal("50000").compareTo((BigDecimal) v1.get("last_order_price")));

        var forB = (List<Map<String, Object>>) run(() -> orders.variants(OWNER, "Xưởng B", "all", null, null, null, 0, 50)).get("items");
        var v4 = forB.stream().filter(v -> ((Number) v.get("detail_id")).intValue() == 4).findFirst().orElseThrow();
        assertEquals(0L, n(v4, "on_order_supplier"));
        assertEquals(Boolean.TRUE, v4.get("ordered_from_supplier"));

        var fresh = run(() -> orders.variants(OWNER, "Nhà cung cấp mới", "history", null, null, null, 0, 10));
        assertEquals(0, fresh.get("total"));
        assertEquals(false, fresh.get("supplier_has_history"));
        var all = run(() -> orders.variants(OWNER, "Nhà cung cấp mới", "all", null, null, null, 0, 2));
        assertEquals(6, all.get("total"));
        assertEquals(2, ((List<?>) all.get("items")).size());
        var byCategory = run(() -> orders.variants(OWNER, "Nhà cung cấp mới", "all", "quan", 2, null, 0, 10));
        assertEquals(2, byCategory.get("total"));
        assertNotEquals(
                WarehouseOrders.supplierKey("An Phát"), WarehouseOrders.supplierKey("Ân Phát"),
                "accents distinguish suppliers");
    }

    @Test
    @SuppressWarnings("unchecked")
    void orderListIsFilteredAndPagedOnBackend() {
        for (int i = 0; i < 25; i++) order(i % 2 == 0 ? "A" : "B", 1, 1, 1000);
        int po = confirmedOrder("A", 1, 10, 1000);
        run(() -> docs.confirm(OWNER, receipt(OWNER, po, 1, 4)));
        var page = run(() -> orders.list(OWNER, null, null, null, null, 1, 10));
        assertEquals(26, page.get("total"));
        assertEquals(10, ((List<?>) page.get("items")).size());
        var partial = run(() -> orders.list(OWNER, null, null, "PARTIAL", null, 0, 10));
        assertEquals(1, partial.get("total"));
        var row = ((List<Map<String, Object>>) partial.get("items")).get(0);
        assertEquals("CONFIRMED", row.get("status"));
        assertEquals(6L, n(row, "remaining_quantity"));
        assertEquals(12, run(() -> orders.list(OWNER, null, "DRAFT", null, "b", 0, 50)).get("total"));
        assertEquals(1, run(() -> orders.list(OWNER, "PD" + String.format("%05d", po), null, null, null, 0, 50)).get("total"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void quickCreateMakesZeroStockOfflineVariantsAndAvoidsDuplicates() {
        var created = run(() -> catalog.createProduct(OWNER, new QuickProduct(1, "Áo khoác gió", "",
                List.of(new QuickVariant("Đen", "M", BigDecimal.valueOf(350000)), new QuickVariant("Đen", "L", BigDecimal.valueOf(350000))),
                false)));
        int product = ((Number) created.get("product_id")).intValue();
        var variants = (List<Map<String, Object>>) created.get("variants");
        assertEquals(2, variants.size());
        for (var v : variants) {
            assertEquals(0, ((Number) v.get("stock_quantity")).intValue());
            assertEquals(0, ((Number) v.get("online_sales_enabled")).intValue());
        }
        var retry = fails(() -> catalog.createProduct(OWNER, new QuickProduct(1, " áo   KHOÁC gió ", "",
                List.of(new QuickVariant("Đen", "M", BigDecimal.ONE)), false)));
        assertEquals("SIMILAR_PRODUCT", retry.code);
        assertEquals(1, db.queryForObject("SELECT COUNT(*) FROM product WHERE product_name LIKE 'Áo khoác%'", Integer.class));

        var add = run(() -> catalog.addVariants(OWNER, product, new QuickVariants(
                List.of(new QuickVariant("Đen", "M", BigDecimal.ONE), new QuickVariant("Xám", "M", BigDecimal.valueOf(360000))))));
        var rows = (List<Map<String, Object>>) add.get("variants");
        assertEquals(Boolean.TRUE, rows.get(0).get("already_existed"));
        assertEquals(Boolean.FALSE, rows.get(1).get("already_existed"));
        run(() -> catalog.addVariants(OWNER, product, new QuickVariants(List.of(new QuickVariant("xám", "m", BigDecimal.ONE)))));
        assertEquals(3, db.queryForObject("SELECT COUNT(*) FROM product_detail WHERE product_id=?", Integer.class, product));
        assertEquals(0, new BigDecimal("350000").compareTo(
                db.queryForObject("SELECT price FROM product_detail WHERE product_id=? AND color='Đen' AND size='M'", BigDecimal.class, product)),
                "sale price is not overwritten by a retry");

        int newDetail = ((Number) rows.get(1).get("detail_id")).intValue();
        int po = confirmedOrder("A", newDetail, 12, 200000);
        assertEquals(0, stock(newDetail), "creating catalog or confirming the order does not add stock");
        assertEquals(0, new BigDecimal("360000").compareTo(
                db.queryForObject("SELECT price FROM product_detail WHERE detail_id=?", BigDecimal.class, newDetail)));
        run(() -> docs.confirm(OWNER, receipt(OWNER, po, newDetail, 12)));
        assertEquals(12, stock(newDetail));
        assertEquals(0, new BigDecimal("360000").compareTo(
                db.queryForObject("SELECT price FROM product_detail WHERE detail_id=?", BigDecimal.class, newDetail)),
                "receipt never rewrites the catalogue sale price");
    }

    @Test
    @SuppressWarnings("unchecked")
    void quickCreatedVariantsKeepSalePriceInCatalogAndPurchasePriceOnOrderLine() {
        var created = run(() -> catalog.createProduct(OWNER, new QuickProduct(1, "Áo len Nâu", "",
                List.of(new QuickVariant("Nâu kem", "L", BigDecimal.valueOf(120000)),
                        new QuickVariant("Nâu kem", "XL", BigDecimal.valueOf(130000))), false)));
        var v = (List<Map<String, Object>>) created.get("variants");
        int l = ((Number) v.get(0).get("detail_id")).intValue(), xl = ((Number) v.get(1).get("detail_id")).intValue();
        int po = order("A", l, 10, 80000, xl, 5, 90000);
        var view = run(() -> orders.detail(OWNER, po));
        assertEquals(0, new BigDecimal("1250000").compareTo((BigDecimal) view.get("total_amount")));
        assertEquals(15L, n(view, "ordered_quantity"));
        assertEquals(0, new BigDecimal("80000").compareTo((BigDecimal) orderLine(po, l).get("unit_price")));
        run(() -> docs.confirm(OWNER, po));
        for (int[] d : new int[][] {{l, 120000}, {xl, 130000}}) {
            assertEquals(0, stock(d[0]), "creating catalogue / confirming the order does not add stock");
            assertEquals(0, db.queryForObject("SELECT online_sales_enabled FROM product_detail WHERE detail_id=?", Integer.class, d[0]));
            assertEquals(0, BigDecimal.valueOf(d[1]).compareTo(
                    db.queryForObject("SELECT price FROM product_detail WHERE detail_id=?", BigDecimal.class, d[0])),
                    "catalogue keeps the expected sale price, never the purchase price");
        }

        db.update("UPDATE product_detail SET stock_quantity=7 WHERE detail_id=1");
        run(() -> catalog.addVariants(OWNER, 10, new QuickVariants(List.of(new QuickVariant("Nâu kem", "S", BigDecimal.valueOf(99000))))));
        assertEquals(7, stock(1));
        assertEquals(0, new BigDecimal("150000").compareTo(
                db.queryForObject("SELECT price FROM product_detail WHERE detail_id=1", BigDecimal.class)),
                "existing variants keep their sale price");
    }

    @Test
    void requestValidationRequiresSalePriceAndRejectsNegative() {
        // Same Bean Validation the controller runs with @Valid.
        try (var factory = jakarta.validation.Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            var empty = new QuickProduct(1, "Áo Hooldy Nâu kem", null, List.of(new QuickVariant("Be", "L", null)), false);
            assertFalse(validator.validate(empty).isEmpty(), "sale price is required");
            var negative = new QuickProduct(1, "Áo", null, List.of(new QuickVariant("Be", "L", BigDecimal.valueOf(-1))), false);
            assertFalse(validator.validate(negative).isEmpty());
            var ok = new QuickProduct(1, "Áo", null, List.of(new QuickVariant("Be", "L", BigDecimal.valueOf(120000))), false);
            assertTrue(validator.validate(ok).isEmpty(), validator.validate(ok).toString());
        }
    }

    @Test
    void quickCreateWithoutSalePriceIsRefusedAndCreatesNothing() {
        var e = fails(() -> catalog.createProduct(OWNER, new QuickProduct(1, "Áo len", "",
                List.of(new QuickVariant("Nâu kem", "L", null)), false)));
        assertEquals("CATALOG_INVALID", e.code);
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM product WHERE product_name='Áo len'", Integer.class));
        var add = fails(() -> catalog.addVariants(OWNER, 10, new QuickVariants(List.of(new QuickVariant("Nâu kem", "S", null)))));
        assertEquals("CATALOG_INVALID", add.code);
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM product_detail WHERE product_id=10 AND color='Nâu kem' AND size='S'", Integer.class));
    }

    @Test
    @SuppressWarnings("unchecked")
    void quickCreateNormalisesWhitespaceAndKeepsDifferentColours() {
        assertEquals("CATALOG_INVALID", fails(() -> catalog.createProduct(OWNER, new QuickProduct(1, "Áo len", "",
                List.of(new QuickVariant("Nâu kem", "L", BigDecimal.ONE), new QuickVariant(" nâu   KEM ", "l", BigDecimal.ONE)), false))).code);
        var created = run(() -> catalog.createProduct(OWNER, new QuickProduct(1, "Áo len", "",
                List.of(new QuickVariant("  Nâu   kem ", "L", BigDecimal.valueOf(110000)), new QuickVariant("Nâu", "L", BigDecimal.valueOf(120000))), false)));
        var v = (List<Map<String, Object>>) created.get("variants");
        int first = ((Number) v.get(0).get("detail_id")).intValue();
        assertEquals("Nâu kem", db.queryForObject("SELECT color FROM product_detail WHERE detail_id=?", String.class, first),
                "whitespace is normalised; 'Nâu' and 'Nâu kem' stay different colours");
        assertEquals(0, stock(first));
    }

    @Test
    void supplierReturnIsRejectedByDumpConstraint() {
        int po = confirmedOrder("A", 1, 10, 50000);
        int r = receipt(OWNER, po, 1, 10);
        run(() -> docs.confirm(OWNER, r));
        int src = line(r, 1);
        assertThrows(Exception.class, () -> run(() -> docs.create(OWNER,
                new Document("SUPPLIER_RETURN", r, null, "Lỗi may", List.of(new Line(1, 2, BigDecimal.valueOf(50000), src))))));
        assertEquals(10, stock(1));
    }

    // ---- Supplier return (needs the migration; run on schema(true)) ----

    /** Confirmed receipt of {@code qty} units of variant 1; returns the receipt id. */
    private int receivedStock(int qty) {
        database.shutdown();
        schema(true);
        int po = confirmedOrder("A", 1, qty, 50000);
        int r = receipt(OWNER, po, 1, qty);
        run(() -> docs.confirm(OWNER, r));
        return r;
    }

    private int returnDoc(Account who, int receipt, int qty, String reason) {
        return id(run(() -> docs.create(who, new Document("SUPPLIER_RETURN", receipt, null, reason,
                List.of(new Line(1, qty, BigDecimal.valueOf(50000), line(receipt, 1)))))));
    }

    private int returnLine(int ret) {
        return db.queryForObject("SELECT receipt_item_id FROM stock_receipt_item WHERE receipt_id=?", Integer.class, ret);
    }

    /** Places {@code qty} units of variant 1 on rack A, level {@code level}; returns product_location_id. */
    private int place(int level, int qty) {
        db.update("MERGE INTO rack(rack_id,rack_code) KEY(rack_id) VALUES(1,'A')");
        db.update("INSERT INTO shelf_level(rack_id,level_number) VALUES(1,?)", level);
        int tier = db.queryForObject("SELECT MAX(shelf_level_id) FROM shelf_level", Integer.class);
        db.update("INSERT INTO product_location(detail_id,shelf_level_id,quantity) VALUES(1,?,?)", tier, qty);
        return db.queryForObject("SELECT MAX(product_location_id) FROM product_location", Integer.class);
    }

    private int at(int location) {
        return db.queryForObject("SELECT quantity FROM product_location WHERE product_location_id=?", Integer.class, location);
    }

    private String status(int doc) {
        return db.queryForObject("SELECT status FROM stock_receipt WHERE receipt_id=?", String.class, doc);
    }

    private Map<String, Object> dispatch(int ret, Pick... picks) {
        return run(() -> docs.confirm(OWNER, ret, null, List.of(picks)));
    }

    @Test
    void ownerApprovesDirectlyAndOnlyDispatchReducesStockOnce() {
        int r = receivedStock(10);
        int shelf = place(1, 6); // 6 on A1, 4 not yet placed
        int ret = returnDoc(OWNER, r, 5, "Lỗi may");
        assertEquals(10, stock(1), "a draft does not touch stock");
        run(() -> docs.approve(OWNER, ret)); // owner: no submit step
        assertEquals("APPROVED", status(ret));
        assertEquals(10, stock(1), "approval does not touch stock");
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM stock_adjustment WHERE movement_type='SUPPLIER_RETURN'", Integer.class));
        int item = returnLine(ret);
        dispatch(ret, new Pick(item, shelf, 2), new Pick(item, null, 3));
        dispatch(ret, new Pick(item, shelf, 2), new Pick(item, null, 3)); // retry/double click
        assertEquals("CONFIRMED", status(ret));
        assertEquals(5, stock(1));
        assertEquals(4, at(shelf), "only the chosen location is reduced");
        assertEquals(2, db.queryForObject("SELECT COUNT(*) FROM stock_adjustment WHERE movement_type='SUPPLIER_RETURN'", Integer.class));
        assertEquals(1, ((Number) db.queryForObject("SELECT confirmed_by FROM stock_receipt WHERE receipt_id=?", Integer.class, ret)).intValue());
        @SuppressWarnings("unchecked")
        var movements = (List<Map<String, Object>>) run(() -> docs.history(OWNER, ret)).get("movements");
        assertEquals(2, movements.size(), "stock history is linked to the return lines");
        assertTrue(fails(() -> docs.edit(OWNER, ret, new Document("SUPPLIER_RETURN", r, null, "x",
                List.of(new Line(1, 1, BigDecimal.valueOf(50000), line(r, 1)))))).getMessage().contains("nháp"));
        assertTrue(fails(() -> docs.end(OWNER, ret, "cancel", "x")).getMessage().contains("đã xử lý"));
        assertEquals(5, stock(1));
    }

    @Test
    void ownerCanApproveAndDispatchInOneStepUsingTheSamePath() {
        int r = receivedStock(10);
        int ret = returnDoc(OWNER, r, 4, "Sai màu");
        dispatch(ret, new Pick(returnLine(ret), null, 4));
        assertEquals("CONFIRMED", status(ret));
        assertEquals(6, stock(1));
        assertEquals(1, db.queryForObject("SELECT COUNT(*) FROM audit_log WHERE entity_id=? AND action_type='DOCUMENT_APPROVE'", Integer.class, ret));
        assertEquals(1, db.queryForObject("SELECT COUNT(*) FROM audit_log WHERE entity_id=? AND action_type='DOCUMENT_DISPATCH'", Integer.class, ret));
    }

    @Test
    void familyDraftsAndSubmitsButCannotApproveOrDispatch() {
        int r = receivedStock(10);
        int ret = returnDoc(FAMILY, r, 3, "");
        assertTrue(fails(() -> docs.submit(FAMILY, ret)).getMessage().contains("lý do"), "reason required before submit");
        run(() -> docs.edit(FAMILY, ret, new Document("SUPPLIER_RETURN", r, null, "Hàng lỗi",
                List.of(new Line(1, 3, BigDecimal.valueOf(50000), line(r, 1))))));
        run(() -> docs.submit(FAMILY, ret));
        assertEquals("PENDING_CONFIRMATION", status(ret));
        assertEquals("WAREHOUSE_FORBIDDEN", fails(() -> docs.approve(FAMILY, ret)).code);
        assertEquals("WAREHOUSE_FORBIDDEN", fails(() -> docs.confirm(FAMILY, ret, null, List.of(new Pick(returnLine(ret), null, 3)))).code);
        int other = returnDoc(OWNER, r, 1, "x");
        assertEquals("WAREHOUSE_FORBIDDEN", fails(() -> docs.submit(FAMILY, other)).code, "only own drafts");
        assertEquals("WAREHOUSE_FORBIDDEN", fails(() -> docs.create(STAFF, new Document("SUPPLIER_RETURN", r, null, "x",
                List.of(new Line(1, 1, BigDecimal.valueOf(50000), line(r, 1)))))).code);
        assertEquals(10, stock(1));
        run(() -> docs.approve(OWNER, ret));
        dispatch(ret, new Pick(returnLine(ret), null, 3));
        assertEquals(7, stock(1));
    }

    @Test
    void partialAndRepeatedReturnsNeverExceedReceived() {
        int r = receivedStock(10);
        int po = db.queryForObject("SELECT source_receipt_id FROM stock_receipt WHERE receipt_id=?", Integer.class, r);
        int first = returnDoc(OWNER, r, 4, "Lỗi may");
        int second = returnDoc(OWNER, r, 6, "Lỗi may");
        int third = returnDoc(OWNER, r, 1, "Lỗi may");
        dispatch(first, new Pick(returnLine(first), null, 4));
        assertTrue(fails(() -> returnDoc(OWNER, r, 7, "x")).getMessage().contains("còn được trả 6"));
        // Approval reserves nothing: only dispatched returns reduce what is still returnable.
        run(() -> docs.approve(OWNER, second));
        run(() -> docs.approve(OWNER, third));
        assertEquals("APPROVED", status(third));
        dispatch(second, new Pick(returnLine(second), null, 6));
        assertEquals(0, stock(1));
        // Over-return is stopped at dispatch, against what was already dispatched.
        var over = fails(() -> docs.confirm(OWNER, third, null, List.of(new Pick(returnLine(third), null, 1))));
        assertTrue(over.getMessage().contains("còn được trả 0"), over.getMessage());
        assertEquals("APPROVED", status(third));
        assertEquals(0, stock(1));
        assertEquals(10L, n(orderLine(po, 1), "returned_quantity"));
        assertEquals(0L, n(orderLine(po, 1), "remaining_quantity"),
                "current behaviour: a return does not reopen the order obligation");
    }

    @Test
    void dispatchChecksStockAndChosenLocations() {
        int r = receivedStock(10);
        int a1 = place(1, 3);
        int a2 = place(2, 5); // 2 unplaced
        int ret = returnDoc(OWNER, r, 6, "Lỗi");
        int item = returnLine(ret);
        assertTrue(fails(() -> dispatch(ret)).getMessage().contains("vị trí"), "picks are mandatory");
        assertTrue(fails(() -> dispatch(ret, new Pick(item, a1, 3), new Pick(item, null, 2))).getMessage().contains("phân bổ"));
        assertTrue(fails(() -> dispatch(ret, new Pick(item, a1, 4), new Pick(item, a2, 2))).getMessage().contains("A1 chỉ còn 3"));
        assertTrue(fails(() -> dispatch(ret, new Pick(item, null, 3), new Pick(item, a2, 3))).getMessage().contains("chưa xếp vị trí chỉ còn 2"));
        assertEquals(10, stock(1));
        assertEquals("DRAFT", status(ret), "a failed dispatch rolls back the inline approval too");
        dispatch(ret, new Pick(item, a2, 5), new Pick(item, null, 1));
        assertEquals(3, at(a1));
        assertEquals(0, at(a2));
        assertEquals(4, stock(1));

        // Stock left the shop through another path: the return is refused, nothing goes negative.
        int late = returnDoc(OWNER, r, 4, "Lỗi");
        db.update("UPDATE product_detail SET stock_quantity=1 WHERE detail_id=1");
        db.update("UPDATE product_location SET quantity=0");
        assertTrue(fails(() -> dispatch(late, new Pick(returnLine(late), null, 4))).getMessage().contains("không đủ"));
        assertEquals(1, stock(1));
    }

    @Test
    void approvedReturnCanBeCancelledWithoutStockChange() {
        int r = receivedStock(10);
        int ret = returnDoc(OWNER, r, 10, "Lỗi");
        run(() -> docs.approve(OWNER, ret));
        run(() -> docs.end(OWNER, ret, "cancel", "NCC không nhận"));
        assertEquals("CANCELLED", status(ret));
        assertEquals(10, stock(1));
        returnDoc(OWNER, r, 10, "Lỗi"); // the reservation is released
    }

    @Test
    void concurrentDispatchOfTwoReturnsCannotOverReturn() throws Exception {
        int r = receivedStock(10);
        int a = returnDoc(OWNER, r, 7, "Lỗi");
        int b = returnDoc(OWNER, r, 7, "Lỗi");
        var pool = Executors.newFixedThreadPool(2);
        var start = new CountDownLatch(1);
        var results = new ArrayList<Future<Boolean>>();
        for (int ret : List.of(a, b))
            results.add(pool.submit(() -> {
                start.await();
                try {
                    dispatch(ret, new Pick(returnLine(ret), null, 7));
                    return true;
                } catch (ApiException e) {
                    return false;
                }
            }));
        start.countDown();
        int ok = 0;
        for (var f : results) if (f.get(30, TimeUnit.SECONDS)) ok++;
        pool.shutdown();
        assertEquals(1, ok);
        assertEquals(3, stock(1));
        assertTrue(stock(1) >= 0);
    }

    // ---- Settlement of dispatched supplier returns (refund / debt offset / credit / exchange) ----

    private int dispatchedReturn(int receipt, int qty) {
        int ret = returnDoc(OWNER, receipt, qty, "Lỗi may");
        dispatch(ret, new Pick(returnLine(ret), null, qty));
        return ret;
    }

    private Map<String, Object> doc(int id) {
        return run(() -> docs.list(OWNER)).stream().filter(d -> id(d) == id).findFirst().orElseThrow();
    }

    private static String key() {
        return UUID.randomUUID().toString();
    }

    private Map<String, Object> settle(String type, Integer ret, Integer target, BigDecimal amount, String method) {
        return run(() -> settlements.record(OWNER, new Settlement(type, ret, target, null, null, amount, method, null, null, key())));
    }

    private BigDecimal credit() {
        return (BigDecimal) run(() -> settlements.credits(OWNER)).get(0).get("credit_balance");
    }

    @Test
    void refundCanBeReceivedSeveralTimesButNeverAboveTheReturnValue() {
        int r = receivedStock(10);
        int pending = returnDoc(OWNER, r, 1, "x");
        run(() -> docs.approve(OWNER, pending));
        assertTrue(fails(() -> settle("REFUND", pending, null, BigDecimal.valueOf(1000), "CASH")).getMessage().contains("đã xuất trả"),
                "approved but not dispatched: no money yet");
        int ret = dispatchedReturn(r, 5); // 5 x 50.000 = 250.000
        assertEquals("UNSETTLED", doc(ret).get("settlement_status"), "dispatched does not mean refunded");
        assertEquals("NOT_APPLICABLE", doc(pending).get("settlement_status"));
        String retry = key();
        run(() -> settlements.record(OWNER, new Settlement("REFUND", ret, null, null, null, BigDecimal.valueOf(100000), "CASH", "Lần 1", null, retry)));
        run(() -> settlements.record(OWNER, new Settlement("REFUND", ret, null, null, null, BigDecimal.valueOf(100000), "CASH", "Lần 1", null, retry)));
        settle("REFUND", ret, null, BigDecimal.valueOf(100000), "BANK_TRANSFER");
        assertEquals("PARTIAL", doc(ret).get("settlement_status"));
        assertEquals(0, new BigDecimal("50000").compareTo((BigDecimal) doc(ret).get("unsettled_amount")));
        var over = fails(() -> settle("REFUND", ret, null, BigDecimal.valueOf(60000), "CASH"));
        assertTrue(over.getMessage().contains("còn 50.000"), over.getMessage());
        assertTrue(fails(() -> settle("REFUND", ret, null, BigDecimal.valueOf(1000), null)).getMessage().contains("hình thức"));
        assertEquals("WAREHOUSE_FORBIDDEN", fails(() -> settlements.record(FAMILY,
                new Settlement("REFUND", ret, null, null, null, BigDecimal.ONE, "CASH", null, null, key()))).code);
        settle("REFUND", ret, null, BigDecimal.valueOf(50000), "CASH");
        assertEquals("SETTLED", doc(ret).get("settlement_status"));
        assertEquals(0, new BigDecimal("250000").compareTo((BigDecimal) doc(ret).get("refund_amount")));
        assertEquals(5, stock(1), "money settlement never touches stock");
    }

    @Test
    void debtOffsetAndHeldCreditStayWithinReceiptAndCreditBalance() {
        int r = receivedStock(10); // supplier A, receipt worth 500.000
        int po2 = confirmedOrder("  a ", 2, 4, 30000); // same supplier, other spelling
        int r2 = receipt(OWNER, po2, 2, 4); // worth 120.000
        run(() -> docs.confirm(OWNER, r2));
        int poB = confirmedOrder("B", 3, 2, 10000);
        int rB = receipt(OWNER, poB, 3, 2);
        run(() -> docs.confirm(OWNER, rB));
        int ret = dispatchedReturn(r, 4); // 200.000
        assertTrue(fails(() -> settle("DEBT_OFFSET", ret, rB, BigDecimal.valueOf(10000), null)).getMessage().contains("cùng nhà cung cấp"));
        settle("DEBT_OFFSET", ret, r, BigDecimal.valueOf(50000), null);
        assertEquals(0, new BigDecimal("50000").compareTo((BigDecimal) doc(r).get("offset_amount")));
        settle("CREDIT_HOLD", ret, null, BigDecimal.valueOf(150000), null);
        assertEquals("SETTLED", doc(ret).get("settlement_status"));
        assertEquals(0, new BigDecimal("150000").compareTo(credit()));
        var tooMuch = fails(() -> settle("CREDIT_USE", null, r2, BigDecimal.valueOf(130000), null));
        assertTrue(tooMuch.getMessage().contains("PN" + String.format("%05d", r2)), tooMuch.getMessage()); // receipt worth 120.000
        var use = settle("CREDIT_USE", null, r2, BigDecimal.valueOf(100000), null);
        assertEquals(0, new BigDecimal("50000").compareTo(credit()));
        assertTrue(fails(() -> settle("CREDIT_USE", null, r2, BigDecimal.valueOf(60000), null)).getMessage().contains("chỉ còn 50.000"));
        int hold = db.queryForObject("SELECT settlement_id FROM supplier_settlement WHERE settlement_type='CREDIT_HOLD'", Integer.class);
        assertTrue(fails(() -> settlements.voidEntry(OWNER, hold, "Ghi nhầm")).getMessage().contains("đã được dùng"));
        run(() -> settlements.voidEntry(OWNER, ((Number) use.get("settlement_id")).intValue(), "Ghi nhầm"));
        assertEquals(0, new BigDecimal("150000").compareTo(credit()));
        run(() -> settlements.voidEntry(OWNER, hold, "Ghi nhầm"));
        assertEquals(0, BigDecimal.ZERO.compareTo(credit()));
        assertEquals("PARTIAL", doc(ret).get("settlement_status"), "voided entries no longer count");
        assertEquals(2, ((List<?>) run(() -> settlements.forDocument(OWNER, ret)).get("entries")).size(),
                "entries stay visible after voiding");
    }

    @Test
    void exchangeGoodsEnterStockOnlyThroughAConfirmedReceiptFromTheReturn() {
        int r = receivedStock(10);
        int ret = dispatchedReturn(r, 4);
        assertEquals(6, stock(1));
        int item = returnLine(ret);
        String retry = key();
        run(() -> settlements.record(OWNER, new Settlement("EXCHANGE", ret, null, item, 3, null, null, "NCC giao bù", null, retry)));
        run(() -> settlements.record(OWNER, new Settlement("EXCHANGE", ret, null, item, 3, null, null, "NCC giao bù", null, retry)));
        assertEquals(6, stock(1), "agreeing an exchange does not touch stock");
        assertEquals(0, new BigDecimal("150000").compareTo((BigDecimal) doc(ret).get("exchange_amount")));
        assertTrue(fails(() -> settlements.record(OWNER, new Settlement("EXCHANGE", ret, null, item, 2, null, null, null, null, key())))
                .getMessage().contains("còn đổi được 1"));

        // Replacement arrives: a normal receipt whose source is the return, drafted by Family, confirmed by Owner.
        var over = fails(() -> docs.create(FAMILY, new Document("RECEIPT", ret, null, null,
                List.of(new Line(1, 4, BigDecimal.valueOf(50000), item)))));
        assertTrue(over.getMessage().contains("còn chờ 3"), over.getMessage());
        int exReceipt = id(run(() -> docs.create(FAMILY, new Document("RECEIPT", ret, null, null,
                List.of(new Line(1, 2, BigDecimal.valueOf(50000), item))))));
        assertEquals("A", db.queryForObject("SELECT manufacturer_name FROM stock_receipt WHERE receipt_id=?", String.class, exReceipt));
        assertEquals(6, stock(1), "draft exchange receipt does not touch stock");
        run(() -> docs.confirm(OWNER, exReceipt));
        run(() -> docs.confirm(OWNER, exReceipt));
        assertEquals(8, stock(1), "replacement counted once through the receipt flow");
        assertEquals(1, db.queryForObject("SELECT COUNT(*) FROM stock_adjustment WHERE movement_type='RECEIPT' AND receipt_item_id IN"
                + " (SELECT receipt_item_id FROM stock_receipt_item WHERE receipt_id=?)", Integer.class, exReceipt));
        assertNull(doc(exReceipt).get("debt_amount"), "exchange receipt creates no new purchase debt");
        assertTrue(fails(() -> settle("PAYMENT", null, exReceipt, BigDecimal.ONE, "CASH")).getMessage().contains("hàng đổi"));

        int ex = db.queryForObject("SELECT settlement_id FROM supplier_settlement WHERE settlement_type='EXCHANGE'", Integer.class);
        assertTrue(fails(() -> settlements.voidEntry(OWNER, ex, "NCC không giao")).getMessage().contains("Đã nhận 2"));
        settle("REFUND", ret, null, BigDecimal.valueOf(50000), "CASH");
        assertEquals("SETTLED", doc(ret).get("settlement_status"));
    }

    @Test
    void purchaseDebtCountsPaymentsAndOffsetsOnceAndOldReceiptsStayUndeclared() {
        int r = receivedStock(10); // confirmed now: tracked from 0, worth 500.000
        assertEquals(0, new BigDecimal("500000").compareTo((BigDecimal) doc(r).get("debt_amount")));
        settle("PAYMENT", null, r, BigDecimal.valueOf(200000), "CASH");
        settle("PAYMENT", null, r, BigDecimal.valueOf(100000), "BANK_TRANSFER");
        assertEquals(0, new BigDecimal("200000").compareTo((BigDecimal) doc(r).get("debt_amount")));
        assertTrue(fails(() -> settle("PAYMENT", null, r, BigDecimal.valueOf(200001), "CASH")).getMessage().contains("còn nợ 200.000"));
        assertTrue(fails(() -> settle("PAYMENT", null, r, BigDecimal.ONE, null)).getMessage().contains("hình thức"));
        int ret = dispatchedReturn(r, 2); // 100.000 returned
        assertEquals(0, new BigDecimal("200000").compareTo((BigDecimal) doc(r).get("debt_amount")),
                "a return alone does not change the debt: the shop chooses how it is settled");
        settle("DEBT_OFFSET", ret, r, BigDecimal.valueOf(100000), null);
        assertEquals(0, new BigDecimal("100000").compareTo((BigDecimal) doc(r).get("debt_amount")));
        assertEquals("SETTLED", doc(ret).get("settlement_status"));
        assertTrue(fails(() -> settle("REFUND", ret, null, BigDecimal.ONE, "CASH")).getMessage().contains("còn 0"),
                "the same returned value cannot also be refunded");
        var supplier = run(() -> settlements.credits(OWNER)).get(0);
        assertEquals(0, new BigDecimal("300000").compareTo((BigDecimal) supplier.get("payment_amount")));
        assertEquals(0, new BigDecimal("100000").compareTo((BigDecimal) supplier.get("debt_amount")));

        // A receipt confirmed before payment tracking: debt unknown, nothing can be recorded until declared.
        int po2 = confirmedOrder("A", 2, 4, 30000);
        int old = receipt(OWNER, po2, 2, 4);
        run(() -> docs.confirm(OWNER, old));
        db.update("UPDATE stock_receipt SET paid_before_tracking=NULL WHERE receipt_id=?", old);
        assertNull(doc(old).get("debt_amount"));
        assertEquals(1, run(() -> settlements.credits(OWNER)).get(0).get("undeclared_receipts"));
        assertTrue(fails(() -> settle("PAYMENT", null, old, BigDecimal.ONE, "CASH")).getMessage().contains("chưa khai báo"));
        assertTrue(fails(() -> settlements.declareBasis(OWNER, old, BigDecimal.valueOf(120001))).getMessage().contains("tối đa 120.000"));
        assertEquals("WAREHOUSE_FORBIDDEN", fails(() -> settlements.declareBasis(FAMILY, old, BigDecimal.ZERO)).code);
        run(() -> settlements.declareBasis(OWNER, old, BigDecimal.valueOf(20000)));
        assertEquals(0, new BigDecimal("100000").compareTo((BigDecimal) doc(old).get("debt_amount")));
        settle("PAYMENT", null, old, BigDecimal.valueOf(100000), "CASH");
        assertEquals(0, BigDecimal.ZERO.compareTo((BigDecimal) doc(old).get("debt_amount")));
        assertTrue(fails(() -> settlements.declareBasis(OWNER, old, BigDecimal.valueOf(30000))).getMessage().contains("tối đa 20.000"));
        assertEquals(3, ((List<?>) run(() -> settlements.forDocument(OWNER, r)).get("entries")).size(),
                "receipt shows its two payments and the offset from the return");
    }
}
