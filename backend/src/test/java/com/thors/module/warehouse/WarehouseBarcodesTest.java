package com.thors.module.warehouse;

import static org.junit.jupiter.api.Assertions.*;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;
import org.springframework.transaction.support.TransactionTemplate;

class WarehouseBarcodesTest {
    private EmbeddedDatabase database;
    private JdbcTemplate db;
    private WarehouseBarcodes barcodes;
    private TransactionTemplate transaction;

    @BeforeEach
    void setup() {
        database = new EmbeddedDatabaseBuilder().generateUniqueName(true).setType(EmbeddedDatabaseType.H2).build();
        db = new JdbcTemplate(database);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(database));
        db.execute("CREATE TABLE `role`(role_id INT PRIMARY KEY,role_name VARCHAR(30))");
        db.execute("INSERT INTO `role` VALUES(1,'OWNER')");
        db.execute("CREATE TABLE product(product_id INT PRIMARY KEY,product_name VARCHAR(200))");
        db.execute("CREATE TABLE product_detail(detail_id INT PRIMARY KEY,product_id INT,barcode VARCHAR(32) UNIQUE,color VARCHAR(30),size VARCHAR(10),stock_quantity INT,status VARCHAR(20))");
        db.execute("CREATE TABLE product_image(image_id INT PRIMARY KEY,product_id INT,image_url VARCHAR(500),is_primary INT,deleted_at TIMESTAMP)");
        db.execute("CREATE TABLE rack(rack_id INT PRIMARY KEY,rack_code VARCHAR(20))");
        db.execute("CREATE TABLE shelf_level(shelf_level_id INT PRIMARY KEY,rack_id INT,level_number INT)");
        db.execute("CREATE TABLE product_location(product_location_id INT PRIMARY KEY,detail_id INT,shelf_level_id INT,quantity INT,description VARCHAR(255))");
        db.execute("CREATE TABLE audit_log(user_id INT,action_type VARCHAR(50),entity_affected VARCHAR(100),entity_id INT,new_value VARCHAR(500),actor_type VARCHAR(20))");
        db.execute("INSERT INTO product VALUES(10,'Áo kiểm thử')");
        barcodes = new WarehouseBarcodes(new WarehouseStore(db), new WarehousePolicy());
    }

    @AfterEach
    void cleanup() {
        database.shutdown();
    }

    private Account account(String role) {
        return new Account(1, role, "Test", "", "test@example.com", null, null, null, "ACTIVE", null, null, null, 0, null);
    }

    private void variant(int id, String code) {
        db.update("INSERT INTO product_detail VALUES(?,10,?,'Đen','M',20,'ACTIVE')", id, code);
    }

    private Map<String, Object> generate() {
        return transaction.execute(status -> barcodes.generate(account("OWNER")));
    }

    @Test
    void generatesMissingCodesAndPreservesExistingCodesAndStock() {
        variant(1, null);
        variant(2, "");
        variant(3, "EXISTING-3");
        assertEquals(2, generate().get("generated"));
        assertEquals("TH000001", db.queryForObject("SELECT barcode FROM product_detail WHERE detail_id=1", String.class));
        assertEquals("TH000002", db.queryForObject("SELECT barcode FROM product_detail WHERE detail_id=2", String.class));
        assertEquals("EXISTING-3", db.queryForObject("SELECT barcode FROM product_detail WHERE detail_id=3", String.class));
        assertEquals(60, db.queryForObject("SELECT SUM(stock_quantity) FROM product_detail", Integer.class));
    }

    @Test
    void generatingAgainKeepsPrintedCodesValid() {
        variant(1, null);
        generate();
        db.update("UPDATE product_detail SET color='Trắng' WHERE detail_id=1");
        assertEquals(0, generate().get("generated"));
        assertEquals("TH000001", db.queryForObject("SELECT barcode FROM product_detail WHERE detail_id=1", String.class));
        assertEquals(1, db.queryForObject("SELECT COUNT(*) FROM audit_log", Integer.class));
    }

    @Test
    void largeIdsAreNotTruncatedIntoDuplicateCodes() {
        variant(1, null);
        variant(1000001, null);
        assertEquals(2, generate().get("generated"));
        assertEquals("TH1000001", db.queryForObject("SELECT barcode FROM product_detail WHERE detail_id=1000001", String.class));
    }

    @Test
    void conflictingExistingCodeRollsBackTheWholeGeneration() {
        variant(1, null);
        variant(2, null);
        variant(3, "TH000002");
        ApiException error = assertThrows(ApiException.class, this::generate);
        assertEquals(409, error.status);
        assertNull(db.queryForObject("SELECT barcode FROM product_detail WHERE detail_id=1", String.class));
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM audit_log", Integer.class));
    }

    @Test
    void onlyOwnerCanGenerateCodes() {
        variant(1, null);
        for (String role : new String[] {"FAMILY_MEMBER", "CUSTOMER", "STAFF", "ADMIN"}) {
            assertEquals(403, assertThrows(ApiException.class, () -> barcodes.generate(account(role))).status);
        }
        assertNull(db.queryForObject("SELECT barcode FROM product_detail WHERE detail_id=1", String.class));
    }

    @Test
    void lookupReturnsTheMatchingVariantAndAllOccupiedLocationsWithoutChangingStock() {
        variant(1, "TH000001");
        db.execute("INSERT INTO rack VALUES(1,'A'),(2,'B')");
        db.execute("INSERT INTO shelf_level VALUES(1,1,1),(2,2,2),(3,1,3)");
        db.execute("INSERT INTO product_location VALUES(1,1,1,5,'Vị trí A'),(2,1,2,7,'Vị trí B'),(3,1,3,0,'Đã hết')");
        db.execute("INSERT INTO product_image VALUES(1,10,'https://example.com/image.jpg',1,NULL)");
        var found = barcodes.lookup(account("FAMILY_MEMBER"), " th000001 ");
        var item = (Map<?, ?>) found.get("variant");
        assertEquals(1, ((Number) item.get("detail_id")).intValue());
        assertEquals(8, ((Number) item.get("unassigned_quantity")).intValue());
        assertEquals(2, ((java.util.List<?>) found.get("locations")).size());
        assertEquals(20, db.queryForObject("SELECT stock_quantity FROM product_detail WHERE detail_id=1", Integer.class));
    }

    @Test
    void lookupReportsUnknownAndInvalidCodes() {
        assertEquals(404, assertThrows(ApiException.class, () -> barcodes.lookup(account("OWNER"), "TH999999")).status);
        assertEquals(400, assertThrows(ApiException.class, () -> barcodes.lookup(account("OWNER"), "' OR 1=1 --")).status);
        assertEquals(400, assertThrows(ApiException.class, () -> barcodes.lookup(account("OWNER"), " ")).status);
    }

    @Test
    void lookupKeepsExistingWarehouseAccessRules() {
        for (String role : new String[] {"CUSTOMER", "STAFF", "ADMIN"}) {
            assertEquals(403, assertThrows(ApiException.class, () -> barcodes.lookup(account(role), "TH000001")).status);
        }
    }
}
