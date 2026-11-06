package com.thors.module.warehouse;

import static org.junit.jupiter.api.Assertions.*;

import com.thors.module.account.entity.Account;
import com.thors.module.order.repository.OrderRepository;
import com.thors.module.warehouse.WarehouseRequests.*;
import java.math.BigDecimal;
import java.util.*;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;
import org.springframework.transaction.support.TransactionTemplate;

/** Thẻ kho tự ghi sau khi màn hình Facebook tạo đơn và trừ thẳng tồn (không sửa code Facebook). */
class FacebookOrderLedgerTest {
    private static final Account OWNER =
            new Account(1, "OWNER", "U1", "", "u1@example.com", null, null, null, "ACTIVE", null, null, null, 0, null);

    private EmbeddedDatabase database;
    private JdbcTemplate db;
    private TransactionTemplate tx;
    private WarehouseStore store;
    private WarehouseDocuments docs;
    private FacebookOrderLedger ledger;

    /**
     * Làm đúng như FacebookService.createOrderFromFacebook: kiểm tồn, tạo đơn + dòng hàng, rồi trừ thẳng
     * stock_quantity (có điều kiện đủ hàng, không báo lỗi nếu không trừ được), không ghi thẻ kho.
     */
    public static class FakeFacebookService {
        final JdbcTemplate jdbc;

        public FakeFacebookService(JdbcTemplate jdbc) {
            this.jdbc = jdbc;
        }

        public Map<String, Object> createOrderFromFacebook(Map<String, Object> req) {
            jdbc.update("INSERT INTO orders(order_number,order_type,order_status,created_by,user_id) VALUES(?,'Online','PENDING_CONFIRMATION',7,7)",
                    "ORD-20261106-FB" + UUID.randomUUID().toString().substring(0, 4).toUpperCase());
            int orderId = jdbc.queryForObject("SELECT MAX(order_id) FROM orders", Integer.class);
            @SuppressWarnings("unchecked")
            var items = (List<Map<String, Integer>>) req.get("items");
            for (var it : items) {
                jdbc.update("INSERT INTO order_item(order_id,detail_id,quantity) VALUES(?,?,?)", orderId, it.get("detailId"), it.get("quantity"));
                if (!Boolean.TRUE.equals(req.get("skipDeduct")))
                    jdbc.update("UPDATE product_detail SET stock_quantity = stock_quantity - ? WHERE detail_id = ? AND stock_quantity >= ?",
                            it.get("quantity"), it.get("detailId"), it.get("quantity"));
            }
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("orderId", orderId);
            result.put("status", "PENDING_CONFIRMATION");
            return result;
        }

        public String other() {
            return "khác";
        }
    }

    @BeforeEach
    void setup() {
        database = new EmbeddedDatabaseBuilder()
                .generateUniqueName(true)
                .setType(EmbeddedDatabaseType.H2)
                .addScript("classpath:/warehouse-flow-schema.sql")
                .build();
        db = new JdbcTemplate(database);
        var transactions = new DataSourceTransactionManager(database);
        tx = new TransactionTemplate(transactions);
        db.execute("ALTER TABLE stock_receipt ADD CONSTRAINT ck_receipt_type CHECK (receipt_type IN ('PURCHASE_ORDER','RECEIPT','SUPPLIER_RETURN'))");
        db.execute("ALTER TABLE orders ADD COLUMN created_by INT");
        db.execute("ALTER TABLE orders ADD COLUMN user_id INT");
        store = new WarehouseStore(db);
        docs = new WarehouseDocuments(store, new WarehousePolicy());
        ledger = new FacebookOrderLedger(store, transactions);
        db.update("INSERT INTO rack(rack_id,rack_code) VALUES(1,'A')");
        db.update("INSERT INTO shelf_level(shelf_level_id,rack_id,level_number) VALUES(1,1,1)");
    }

    @AfterEach
    void cleanup() {
        database.shutdown();
    }

    private <T> T run(Supplier<T> action) {
        return tx.execute(status -> action.get());
    }

    private static int id(Map<String, Object> row) {
        return ((Number) row.get("receipt_id")).intValue();
    }

    private void receive(int detail, int qty) {
        int po = id(run(() -> docs.create(OWNER, new Document("PURCHASE_ORDER", null, "NCC A", null,
                List.of(new Line(detail, qty, BigDecimal.valueOf(1000), null))))));
        run(() -> docs.confirm(OWNER, po));
        int line = db.queryForObject("SELECT receipt_item_id FROM stock_receipt_item WHERE receipt_id=?", Integer.class, po);
        int rc = id(run(() -> docs.create(OWNER, new Document("RECEIPT", po, null, null,
                List.of(new Line(detail, qty, BigDecimal.valueOf(1000), line))))));
        run(() -> docs.confirm(OWNER, rc));
    }

    private int place(int detail, int qty) {
        db.update("INSERT INTO product_location(detail_id,shelf_level_id,quantity) VALUES(?,1,?)", detail, qty);
        return db.queryForObject("SELECT MAX(product_location_id) FROM product_location", Integer.class);
    }

    private int stock(int detail) {
        return db.queryForObject("SELECT stock_quantity FROM product_detail WHERE detail_id=?", Integer.class, detail);
    }

    private int ledgerSum(int detail) {
        return db.queryForObject("SELECT COALESCE(SUM(quantity_change),0) FROM stock_adjustment WHERE detail_id=?", Integer.class, detail);
    }

    private FakeFacebookService hooked() {
        var beans = new StaticListableBeanFactory();
        beans.addBean("ledger", ledger);
        var hook = new FacebookOrderLedgerHook(beans.getBeanProvider(FacebookOrderLedger.class), FakeFacebookService.class.getName());
        return (FakeFacebookService) hook.postProcessAfterInitialization(new FakeFacebookService(db), "facebookService");
    }

    private Map<String, Object> order(FakeFacebookService fb, int detail, int qty, boolean skipDeduct) {
        return fb.createOrderFromFacebook(Map.of("items", List.of(Map.of("detailId", detail, "quantity", qty)), "skipDeduct", skipDeduct));
    }

    @Test
    void facebookOrderGetsLedgerRowsUnplacedFirstWithoutChangingStockOrResult() {
        receive(1, 10);
        int loc = place(1, 7); // 3 chưa xếp
        var fb = hooked();
        var result = order(fb, 1, 5, false);
        int orderId = (Integer) result.get("orderId");

        assertEquals(Set.of("orderId", "status"), result.keySet(), "kết quả hàm Facebook giữ nguyên");
        assertEquals("khác", fb.other(), "các hàm khác của Facebook chạy bình thường");
        assertEquals(5, stock(1), "tồn chỉ bị trừ một lần (do code Facebook)");
        assertEquals(stock(1), ledgerSum(1), "thẻ kho khớp tồn");
        assertEquals(-3, db.queryForObject("SELECT quantity_change FROM stock_adjustment WHERE movement_type='ORDER_OUT' AND source_location_id IS NULL", Integer.class));
        assertEquals(-2, db.queryForObject("SELECT quantity_change FROM stock_adjustment WHERE movement_type='ORDER_OUT' AND source_location_id=?", Integer.class, loc));
        assertEquals(5, db.queryForObject("SELECT quantity FROM product_location WHERE product_location_id=?", Integer.class, loc));
        assertNotNull(db.queryForObject("SELECT stock_deducted_at FROM orders WHERE order_id=?", Object.class, orderId));
        assertTrue(new OrderRepository(db).unshippedLines(orderId).isEmpty(), "Owner xác nhận đơn sẽ không trừ lần hai");

        assertEquals(0, ledger.record(orderId), "gọi lại không ghi trùng");
        assertEquals(stock(1), ledgerSum(1));
    }

    @Test
    void lineNotDeductedByFacebookIsLeftForOwnerConfirmation() {
        receive(1, 10);
        int orderId = (Integer) order(hooked(), 1, 4, true).get("orderId");
        assertEquals(10, stock(1));
        assertEquals(10, ledgerSum(1));
        assertNull(db.queryForObject("SELECT stock_deducted_at FROM orders WHERE order_id=?", Object.class, orderId));
        assertEquals(1, new OrderRepository(db).unshippedLines(orderId).size(), "để bước xác nhận đơn trừ kho");
    }

    @Test
    void ledgerFailureNeverBreaksFacebookOrder() {
        receive(1, 10);
        var beans = new StaticListableBeanFactory();
        beans.addBean("ledger", new FacebookOrderLedger(store, new DataSourceTransactionManager(database)) {
            @Override
            public int record(int orderId) {
                throw new IllegalStateException("lỗi giả lập");
            }
        });
        var hook = new FacebookOrderLedgerHook(beans.getBeanProvider(FacebookOrderLedger.class), FakeFacebookService.class.getName());
        var fb = (FakeFacebookService) hook.postProcessAfterInitialization(new FakeFacebookService(db), "facebookService");
        var result = order(fb, 1, 2, false);
        assertNotNull(result.get("orderId"));
        assertEquals(8, stock(1), "đơn Facebook vẫn tạo và trừ tồn như cũ");
    }

    @Test
    void alreadyTransactionalBeanGetsLedgerOnlyAfterItsTransactionFinishes() {
        receive(1, 10);
        boolean[] inside = {false};
        boolean[] recordedInside = {true};
        // Giống proxy @Transactional mà Spring tạo cho FacebookService.
        var tx = new org.springframework.aop.framework.ProxyFactory(new FakeFacebookService(db));
        tx.setProxyTargetClass(true);
        tx.addAdvice((org.aopalliance.intercept.MethodInterceptor) call -> {
            inside[0] = true;
            try {
                return call.proceed();
            } finally {
                inside[0] = false;
            }
        });
        var beans = new StaticListableBeanFactory();
        beans.addBean("ledger", new FacebookOrderLedger(store, new DataSourceTransactionManager(database)) {
            @Override
            public int record(int orderId) {
                recordedInside[0] = inside[0];
                return super.record(orderId);
            }
        });
        var hook = new FacebookOrderLedgerHook(beans.getBeanProvider(FacebookOrderLedger.class), FakeFacebookService.class.getName());
        Object proxied = tx.getProxy();
        var fb = (FakeFacebookService) hook.postProcessAfterInitialization(proxied, "facebookService");
        assertSame(proxied, fb, "không bọc chồng proxy mới");
        order(fb, 1, 3, false);
        assertFalse(recordedInside[0], "thẻ kho ghi sau khi giao dịch của hàm Facebook kết thúc");
        assertEquals(7, stock(1));
        assertEquals(7, ledgerSum(1));
    }

    @Test
    void otherBeansAreNotWrapped() {
        var beans = new StaticListableBeanFactory();
        var hook = new FacebookOrderLedgerHook(beans.getBeanProvider(FacebookOrderLedger.class));
        var plain = new FakeFacebookService(db);
        assertSame(plain, hook.postProcessAfterInitialization(plain, "x"));
    }
}
