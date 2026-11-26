package com.thors.module.warehouse;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.thors.common.ApiErrors;
import com.thors.module.account.entity.Account;
import com.thors.module.product.repository.ProductImageRepository;
import com.thors.module.product.repository.ProductRepository;
import com.thors.module.product.service.ProductService;
import com.thors.module.warehouse.controller.WarehouseController;
import com.thors.module.warehouse.repository.WarehouseStore;
import com.thors.module.warehouse.service.*;
import com.thors.security.SessionAccess;
import java.nio.file.Files;
import java.util.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.SimpleDriverDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

/**
 * Integration test cho sheet "Warehouse" của Report-5.2_Integration Test. Mỗi test đi theo một nhánh
 * trong sequence diagram Kho (Owner): request HTTP → WarehouseController → service (@Transactional
 * thật) → WarehouseStore → DB H2 (cấu trúc bảng theo database/SQL_v3.sql và migrations), sau đó đọc
 * thẳng DB để kiểm tra dữ liệu đã ghi. Chỉ phần "ai đang đăng nhập" (SessionAccess) được giả lập.
 */
@SpringJUnitWebConfig(WarehouseFlowIntegrationTest.Config.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
@DisplayName("Warehouse Integration Test")
class WarehouseFlowIntegrationTest {

  static final Account OWNER = account(1, "OWNER");
  static final Account FAMILY = account(2, "FAMILY_MEMBER");
  static final Account STAFF = account(3, "STAFF");
  /** Người đang đăng nhập trong request kế tiếp. */
  static Account who = OWNER;

  static Account account(int id, String role) {
    return new Account(id, role, "U" + id, "", "u" + id + "@thors.vn", null, null, null, "ACTIVE", null, null, null, 0, null);
  }

  // @TestConfiguration: Spring Boot bỏ qua lớp này khi quét component, nên không lẫn vào @SpringBootTest khác.
  @TestConfiguration
  @EnableWebMvc
  @EnableTransactionManagement
  static class Config {
    @Bean
    DataSource dataSource() {
      // Tên cột chữ thường như MySQL (JSON trả về giống hệt môi trường thật).
      var db = new SimpleDriverDataSource(new org.h2.Driver(),
              "jdbc:h2:mem:wh" + UUID.randomUUID().toString().replace("-", "")
                      + ";DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1", "sa", "");
      new ResourceDatabasePopulator(new ClassPathResource("warehouse-flow-schema.sql")).execute(db);
      var jdbc = new JdbcTemplate(db);
      // Cột / bảng theo database/SQL_v3.sql và database/migrations (2026-11-15 → 2026-11-18)
      jdbc.execute("ALTER TABLE stock_receipt ADD CONSTRAINT ck_receipt_type CHECK (receipt_type IN ('PURCHASE_ORDER','RECEIPT','SUPPLIER_RETURN'))");
      jdbc.execute("ALTER TABLE rack ADD (zone VARCHAR(50), coordinate_x DECIMAL(8,2) NOT NULL DEFAULT 40, coordinate_y DECIMAL(8,2) NOT NULL DEFAULT 40, is_active TINYINT NOT NULL DEFAULT 1)");
      jdbc.execute("ALTER TABLE shelf_level ADD (status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE', is_active TINYINT NOT NULL DEFAULT 1, level_name VARCHAR(50))");
      jdbc.execute("""
              CREATE TABLE product_location_image (product_location_image_id INT AUTO_INCREMENT PRIMARY KEY, product_location_id INT NOT NULL,
                image_url VARCHAR(500) NOT NULL, cloud_public_id VARCHAR(255), deleted_at TIMESTAMP)""");
      jdbc.execute("""
              ALTER TABLE stock_adjustment ADD (request_status VARCHAR(20), request_shelf_id INT, request_note VARCHAR(2000),
                request_photo_keys VARCHAR(400), decided_by INT, decided_at TIMESTAMP)""");
      return db;
    }

    @Bean JdbcTemplate jdbc(DataSource ds) { return new JdbcTemplate(ds); }
    @Bean PlatformTransactionManager transactionManager(DataSource ds) { return new DataSourceTransactionManager(ds); }
    @Bean WarehouseStore store(JdbcTemplate db) { return new WarehouseStore(db); }
    @Bean WarehousePolicy policy() { return new WarehousePolicy(); }

    @Bean WarehousePhotos photos() throws Exception {
      return new WarehousePhotos(Files.createTempDirectory("wh-photos").toString());
    }

    @Bean WarehouseDocuments docs(WarehouseStore s, WarehousePolicy p) { return new WarehouseDocuments(s, p); }
    @Bean WarehouseOrders orders(WarehouseStore s, WarehousePolicy p) { return new WarehouseOrders(s, p); }
    @Bean WarehouseSettlements settlements(WarehouseStore s, WarehousePolicy p) { return new WarehouseSettlements(s, p); }
    @Bean WarehouseInventory inventory(WarehouseStore s, WarehousePolicy p, WarehouseOrders o) { return new WarehouseInventory(s, p, o); }
    @Bean WarehouseCounts counts(WarehouseStore s, WarehousePolicy p) { return new WarehouseCounts(s, p); }
    @Bean WarehouseBarcodes barcodes(WarehouseStore s, WarehousePolicy p) { return new WarehouseBarcodes(s, p); }
    @Bean WarehouseLayout layout(WarehouseStore s, WarehousePolicy p, WarehousePhotos ph) { return new WarehouseLayout(s, p, ph); }
    @Bean WarehouseDefects defects(WarehouseStore s, WarehousePolicy p, WarehousePhotos ph) { return new WarehouseDefects(s, p, ph); }

    @Bean WarehouseMoveRequests moveRequests(WarehouseStore s, WarehousePolicy p, WarehouseLayout l, WarehousePhotos ph) {
      return new WarehouseMoveRequests(s, p, l, ph);
    }

    @Bean WarehouseCatalog catalog(WarehouseStore s, WarehousePolicy p, JdbcTemplate db) {
      var products = new ProductRepository(db);
      return new WarehouseCatalog(s, p, new ProductService(products, db, null, new ProductImageRepository(db)), products);
    }

    @Bean SessionAccess sessions() {
      var sessions = mock(SessionAccess.class);
      when(sessions.current()).thenAnswer(i -> who);
      return sessions;
    }

    @Bean WarehouseController controller(SessionAccess sa, WarehouseDocuments d, WarehouseLayout l, WarehousePhotos ph,
            WarehousePolicy p, WarehouseBarcodes b, WarehouseOrders o, WarehouseCatalog c, WarehouseSettlements st,
            WarehouseInventory i, WarehouseCounts co, WarehouseMoveRequests m, WarehouseDefects de) {
      return new WarehouseController(sa, d, l, ph, p, b, o, c, st, i, co, m, de);
    }

    @Bean ApiErrors apiErrors() { return new ApiErrors(); }
  }

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate db;
  final ObjectMapper json = new ObjectMapper();
  MockMvc mvc;

  @BeforeEach
  void setup() {
    who = OWNER;
    mvc = MockMvcBuilders.webAppContextSetup(context).build();
    // Kệ A (tầng A1, A2) ở góc trái; Áo thun Đen M (detail 1, mã TH000001): tồn 10, 4 chiếc ở A1, 6 chưa xếp.
    db.update("INSERT INTO rack(rack_id,rack_code,coordinate_x,coordinate_y) VALUES(1,'A',40,40)");
    db.update("INSERT INTO shelf_level(shelf_level_id,rack_id,level_number) VALUES(1,1,1),(2,1,2)");
    db.update("UPDATE product_detail SET stock_quantity=10, barcode='TH000001' WHERE detail_id=1");
    db.update("INSERT INTO product_location(product_location_id,detail_id,shelf_level_id,quantity) VALUES(1,1,1,4)");
    db.execute("ALTER TABLE rack ALTER COLUMN rack_id RESTART WITH 100");
    db.execute("ALTER TABLE shelf_level ALTER COLUMN shelf_level_id RESTART WITH 100");
    db.execute("ALTER TABLE product_location ALTER COLUMN product_location_id RESTART WITH 100");
  }

  // ---------- helpers ----------

  MockHttpServletResponse call(MockHttpServletRequestBuilder request, Object body) throws Exception {
    if (body != null) request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
    return mvc.perform(request).andReturn().getResponse();
  }

  JsonNode ok(MockHttpServletRequestBuilder request, Object body) throws Exception {
    var r = call(request, body);
    assertEquals(200, r.getStatus(), r.getContentAsString());
    return json.readTree(r.getContentAsString());
  }

  JsonNode fails(int status, MockHttpServletRequestBuilder request, Object body) throws Exception {
    var r = call(request, body);
    assertEquals(status, r.getStatus(), r.getContentAsString());
    return json.readTree(r.getContentAsString());
  }

  int number(String sql, Object... args) {
    Number n = db.queryForObject(sql, Number.class, args);
    return n == null ? 0 : n.intValue();
  }

  int stock(int detail) {
    return number("SELECT stock_quantity FROM product_detail WHERE detail_id=?", detail);
  }

  int at(int location) {
    return number("SELECT quantity FROM product_location WHERE product_location_id=?", location);
  }

  int audits(String action) {
    return number("SELECT COUNT(*) FROM audit_log WHERE action_type=?", action);
  }

  static String key() {
    return UUID.randomUUID().toString();
  }

  static Map<String, Object> line(int detail, int qty, int price, Integer source) {
    var m = new HashMap<String, Object>();
    m.put("detailId", detail);
    m.put("quantity", qty);
    m.put("unitPrice", price);
    m.put("sourceItemId", source);
    return m;
  }

  static Map<String, Object> document(String type, Integer source, String supplier, List<Map<String, Object>> items) {
    var m = new HashMap<String, Object>();
    m.put("type", type);
    m.put("sourceId", source);
    m.put("manufacturer", supplier);
    m.put("items", items);
    return m;
  }

  int purchaseOrder(int qty) throws Exception {
    var po = ok(post("/api/warehouse/documents"), document("PURCHASE_ORDER", null, "Xưởng May A", List.of(line(1, qty, 80000, null))));
    int id = po.get("receipt_id").asInt();
    ok(post("/api/warehouse/documents/" + id + "/confirm"), null);
    return id;
  }

  int poLine(int po) {
    return number("SELECT receipt_item_id FROM stock_receipt_item WHERE receipt_id=?", po);
  }

  int receipt(int po, int qty) throws Exception {
    var r = ok(post("/api/warehouse/documents"), document("RECEIPT", po, "Xưởng May A", List.of(line(1, qty, 80000, poLine(po)))));
    return r.get("receipt_id").asInt();
  }

  static Map<String, Object> move(Integer from, Integer to, int qty, String requestKey) {
    var m = new HashMap<String, Object>();
    m.put("detailId", 1);
    m.put("fromLocationId", from);
    m.put("toShelfId", to);
    m.put("quantity", qty);
    m.put("requestKey", requestKey);
    return m;
  }

  static Map<String, Object> countLine(Integer location, int counted, String reason) {
    var m = new HashMap<String, Object>();
    m.put("detailId", 1);
    m.put("locationId", location);
    m.put("counted", counted);
    m.put("reason", reason);
    return m;
  }

  // ---------- Phần 1-2: tồn kho ----------

  @Nested
  @DisplayName("Xem tồn kho và đặt ngưỡng tối thiểu (Kho - Tồn kho 1.1-2.22)")
  class Inventory {
    @Test
    @DisplayName("IT-WH-01 - Owner xem tồn kho: số tổng / đã xếp / chưa xếp tính đúng từ DB")
    void it01() throws Exception {
      var page = ok(get("/api/warehouse/inventory").param("q", "Áo thun"), null);
      JsonNode row = null;
      for (var item : page.get("items")) if (item.get("detail_id").asInt() == 1) row = item;
      assertNotNull(row, page.toString());
      assertEquals(10, row.get("stock_quantity").asInt());
      assertEquals(4, row.get("assigned_quantity").asInt());
      assertEquals(6, row.get("unassigned_quantity").asInt());
    }

    @Test
    @DisplayName("IT-WH-02 - Owner đặt ngưỡng tối thiểu: lưu min_stock_quantity, ghi audit")
    void it02() throws Exception {
      ok(put("/api/warehouse/inventory/1/threshold"), Map.of("min", 12));
      assertEquals(12, number("SELECT min_stock_quantity FROM product_detail WHERE detail_id=1"));
      assertEquals(1, audits("INVENTORY_THRESHOLD"));
    }

    @Test
    @DisplayName("IT-WH-03 - Family Member đặt ngưỡng: 403, dữ liệu không đổi")
    void it03() throws Exception {
      who = FAMILY;
      fails(403, put("/api/warehouse/inventory/1/threshold"), Map.of("min", 12));
      assertEquals(0, number("SELECT COUNT(*) FROM product_detail WHERE detail_id=1 AND min_stock_quantity IS NOT NULL"));
    }

    @Test
    @DisplayName("IT-WH-04 - Staff (không thuộc kho) xem tồn kho: 403")
    void it04() throws Exception {
      who = STAFF;
      fails(403, get("/api/warehouse/inventory"), null);
    }
  }

  // ---------- Phiếu đặt hàng ----------

  @Nested
  @DisplayName("Phiếu đặt hàng (Kho - Đặt hàng 1.1-3.15)")
  class PurchaseOrder {
    @Test
    @DisplayName("IT-WH-05 - lập phiếu đặt: lưu DRAFT + dòng hàng + audit, tồn kho không đổi")
    void it05() throws Exception {
      var po = ok(post("/api/warehouse/documents"), document("PURCHASE_ORDER", null, "Xưởng May A", List.of(line(1, 20, 80000, null))));
      int id = po.get("receipt_id").asInt();
      assertEquals("DRAFT", db.queryForObject("SELECT status FROM stock_receipt WHERE receipt_id=?", String.class, id));
      assertEquals(20, number("SELECT quantity FROM stock_receipt_item WHERE receipt_id=?", id));
      assertEquals(1, audits("DOCUMENT_CREATE"));
      assertEquals(10, stock(1));
    }

    @Test
    @DisplayName("IT-WH-06 - phiếu đặt sai dữ liệu (số lượng 0, không có dòng): 400 VALIDATION, không ghi DB")
    void it06() throws Exception {
      fails(400, post("/api/warehouse/documents"), document("PURCHASE_ORDER", null, "Xưởng May A", List.of(line(1, 0, 80000, null))));
      fails(400, post("/api/warehouse/documents"), document("PURCHASE_ORDER", null, "Xưởng May A", List.of()));
      assertEquals(0, number("SELECT COUNT(*) FROM stock_receipt"));
    }

    @Test
    @DisplayName("IT-WH-07 - xác nhận phiếu đặt: CONFIRMED, bấm lần 2 không làm lại, tồn không đổi")
    void it07() throws Exception {
      int id = purchaseOrder(20);
      assertEquals("CONFIRMED", db.queryForObject("SELECT status FROM stock_receipt WHERE receipt_id=?", String.class, id));
      assertNotNull(db.queryForObject("SELECT confirmed_at FROM stock_receipt WHERE receipt_id=?", Object.class, id));
      ok(post("/api/warehouse/documents/" + id + "/confirm"), null);
      assertEquals(1, audits("DOCUMENT_CONFIRM"));
      assertEquals(10, stock(1));
    }

    @Test
    @DisplayName("IT-WH-08 - hủy phiếu đặt chưa nhận hàng: CANCELLED, lưu lý do")
    void it08() throws Exception {
      int id = purchaseOrder(20);
      ok(post("/api/warehouse/documents/" + id + "/cancel"), Map.of("reason", "Xưởng hết vải"));
      assertEquals("CANCELLED", db.queryForObject("SELECT status FROM stock_receipt WHERE receipt_id=?", String.class, id));
      assertEquals("Xưởng hết vải", db.queryForObject("SELECT rejection_reason FROM stock_receipt WHERE receipt_id=?", String.class, id));
    }
  }

  // ---------- Phiếu nhập + kiểm hàng ----------

  @Nested
  @DisplayName("Nhập hàng và kiểm hàng (Kho - Nhập hàng 1.1-4.x)")
  class Receipt {
    @Test
    @DisplayName("IT-WH-09 - phiếu nhập vượt số còn thiếu của phiếu đặt: 409, báo rõ số đặt / còn thiếu, không tạo phiếu")
    void it09() throws Exception {
      int po = purchaseOrder(20);
      var e = fails(409, post("/api/warehouse/documents"), document("RECEIPT", po, "Xưởng May A", List.of(line(1, 21, 80000, poLine(po)))));
      assertTrue(e.get("message").asText().contains("còn thiếu 20, lần này 21"));
      assertEquals(0, number("SELECT COUNT(*) FROM stock_receipt WHERE receipt_type='RECEIPT'"));
    }

    @Test
    @DisplayName("IT-WH-10 - xác nhận phiếu nhập: chuyển APPROVED (chờ kiểm hàng), tồn chưa tăng")
    void it10() throws Exception {
      int id = receipt(purchaseOrder(20), 20);
      ok(post("/api/warehouse/documents/" + id + "/confirm"), null);
      assertEquals("APPROVED", db.queryForObject("SELECT status FROM stock_receipt WHERE receipt_id=?", String.class, id));
      assertEquals(10, stock(1));
    }

    @Test
    @DisplayName("IT-WH-11 - số còn thiếu đã đổi do phiếu nhập khác: 409 WAREHOUSE_STALE")
    void it11() throws Exception {
      int po = purchaseOrder(20);
      int line = poLine(po);
      int id = receipt(po, 20);
      var body = Map.of("expectedRemaining", Map.of(String.valueOf(line), 15));
      var e = fails(409, post("/api/warehouse/documents/" + id + "/confirm"), body);
      assertEquals("WAREHOUSE_STALE", e.get("code").asText());
      assertEquals("DRAFT", db.queryForObject("SELECT status FROM stock_receipt WHERE receipt_id=?", String.class, id));
    }

    @Test
    @DisplayName("IT-WH-12 - quét mã không tồn tại khi kiểm hàng: 404 BARCODE_NOT_FOUND")
    void it12() throws Exception {
      int id = receipt(purchaseOrder(20), 20);
      ok(post("/api/warehouse/documents/" + id + "/confirm"), null);
      var e = fails(404, post("/api/warehouse/documents/" + id + "/scan"), Map.of("code", "TH999999"));
      assertEquals("BARCODE_NOT_FOUND", e.get("code").asText());
    }

    @Test
    @DisplayName("IT-WH-13 - quét đủ rồi chốt nhận: tồn tăng đúng số quét, ghi thẻ kho RECEIPT")
    void it13() throws Exception {
      int id = receipt(purchaseOrder(3), 3);
      ok(post("/api/warehouse/documents/" + id + "/confirm"), null);
      for (int i = 0; i < 3; i++) ok(post("/api/warehouse/documents/" + id + "/scan"), Map.of("code", "TH000001"));
      ok(post("/api/warehouse/documents/" + id + "/receive"), Map.of());
      assertEquals(13, stock(1));
      assertEquals("CONFIRMED", db.queryForObject("SELECT status FROM stock_receipt WHERE receipt_id=?", String.class, id));
      assertEquals(3, number("SELECT SUM(quantity_change) FROM stock_adjustment WHERE detail_id=1 AND movement_type='RECEIPT'"));
    }

    @Test
    @DisplayName("IT-WH-14 - chốt nhận khi chưa quét gì: 409, tồn không đổi")
    void it14() throws Exception {
      int id = receipt(purchaseOrder(3), 3);
      ok(post("/api/warehouse/documents/" + id + "/confirm"), null);
      assertEquals("WAREHOUSE_CONFLICT", fails(409, post("/api/warehouse/documents/" + id + "/receive"), Map.of()).get("code").asText());
      assertEquals(10, stock(1));
      assertEquals("APPROVED", db.queryForObject("SELECT status FROM stock_receipt WHERE receipt_id=?", String.class, id));
    }
  }

  // ---------- Kiểm kê ----------

  @Nested
  @DisplayName("Kiểm kê (Kho - Kiểm kê 1.1-3.11)")
  class Counts {
    @Test
    @DisplayName("IT-WH-15 - số đếm lệch mà không chọn lý do: 409, không tạo phiếu")
    void it15() throws Exception {
      var e = fails(409, post("/api/warehouse/counts"), Map.of("lines", List.of(countLine(1, 3, null))));
      assertTrue(e.get("message").asText().contains("cần chọn lý do"));
      assertEquals(0, number("SELECT COUNT(*) FROM stock_count"));
    }

    @Test
    @DisplayName("IT-WH-16 - lập và xác nhận kiểm kê: tồn theo số đếm, ghi ADJUSTMENT")
    void it16() throws Exception {
      var draft = ok(post("/api/warehouse/counts"), Map.of("lines", List.of(countLine(1, 3, "LOST"))));
      int id = draft.get("count_id").asInt();
      assertEquals(10, stock(1), "phiếu nháp chưa đổi tồn");
      ok(post("/api/warehouse/counts/" + id + "/confirm"), null);
      assertEquals(3, at(1));
      assertEquals(9, stock(1));
      assertEquals(-1, number("SELECT SUM(quantity_change) FROM stock_adjustment WHERE detail_id=1 AND movement_type='ADJUSTMENT'"));
      assertEquals("CONFIRMED", db.queryForObject("SELECT status FROM stock_count WHERE count_id=?", String.class, id));
    }

    @Test
    @DisplayName("IT-WH-17 - tồn đã đổi sau lúc đếm: 409 COUNT_STALE, không áp dụng")
    void it17() throws Exception {
      int id = ok(post("/api/warehouse/counts"), Map.of("lines", List.of(countLine(1, 3, "LOST")))).get("count_id").asInt();
      db.update("UPDATE product_location SET quantity=5 WHERE product_location_id=1");
      db.update("UPDATE product_detail SET stock_quantity=11 WHERE detail_id=1");
      var e = fails(409, post("/api/warehouse/counts/" + id + "/confirm"), null);
      assertEquals("COUNT_STALE", e.get("code").asText());
      assertEquals(5, at(1));
    }
  }

  // ---------- Sơ đồ kho ----------

  @Nested
  @DisplayName("Sơ đồ kho: kệ và tầng (Kho - Vị trí 1.1-3.11)")
  class Layout {
    @Test
    @DisplayName("IT-WH-18 - thêm kệ B hợp lệ: lưu rack + audit, sơ đồ trả về có kệ B")
    void it18() throws Exception {
      ok(post("/api/warehouse/racks"), Map.of("code", "B", "x", 600, "y", 40, "active", true));
      assertEquals(1, number("SELECT COUNT(*) FROM rack WHERE rack_code='B'"));
      assertEquals(1, audits("RACK_SAVE"));
      var snapshot = ok(get("/api/warehouse/snapshot"), null);
      assertTrue(snapshot.toString().contains("\"rack_code\":\"B\""));
    }

    @Test
    @DisplayName("IT-WH-19 - thêm kệ trùng mã (không phân biệt hoa thường): 409, không tạo kệ")
    void it19() throws Exception {
      var e = fails(409, post("/api/warehouse/racks"), Map.of("code", "a", "x", 600, "y", 40, "active", true));
      assertTrue(e.get("message").asText().contains("đã tồn tại"));
      assertEquals(1, number("SELECT COUNT(*) FROM rack"));
    }

    @Test
    @DisplayName("IT-WH-20 - đặt kệ chồng lên kệ A: 409 WAREHOUSE_CONFLICT")
    void it20() throws Exception {
      var e = fails(409, post("/api/warehouse/racks"), Map.of("code", "B", "x", 60, "y", 40, "active", true));
      assertEquals("WAREHOUSE_CONFLICT", e.get("code").asText());
      assertEquals(0, number("SELECT COUNT(*) FROM rack WHERE rack_code='B'"));
    }

    @Test
    @DisplayName("IT-WH-21 - ẩn kệ đang còn hàng: 409, kệ vẫn hoạt động")
    void it21() throws Exception {
      assertEquals("WAREHOUSE_CONFLICT", fails(409, put("/api/warehouse/racks/1"), Map.of("code", "A", "x", 40, "y", 40, "active", false)).get("code").asText());
      assertEquals(1, number("SELECT is_active FROM rack WHERE rack_id=1"));
    }
  }

  // ---------- Xếp / chuyển hàng ----------

  @Nested
  @DisplayName("Xếp, chuyển hàng và duyệt yêu cầu của Family (Kho - Chuyển kệ 1.1-2.20)")
  class Moves {
    @Test
    @DisplayName("IT-WH-22 - Owner xếp 2 chiếc chưa xếp lên A2: vị trí tăng, tổng tồn không đổi; gửi lại cùng request_key không chuyển lần 2")
    void it22() throws Exception {
      String k = key();
      ok(post("/api/warehouse/moves"), move(null, 2, 2, k));
      ok(post("/api/warehouse/moves"), move(null, 2, 2, k));
      assertEquals(2, number("SELECT quantity FROM product_location WHERE detail_id=1 AND shelf_level_id=2"));
      assertEquals(10, stock(1));
      assertEquals(1, number("SELECT COUNT(*) FROM stock_adjustment WHERE movement_type='MOVE'"));
    }

    @Test
    @DisplayName("IT-WH-23 - chuyển nhiều hơn số đang có ở vị trí nguồn: 409, không đổi")
    void it23() throws Exception {
      assertEquals("WAREHOUSE_CONFLICT", fails(409, post("/api/warehouse/moves"), move(1, 2, 5, key())).get("code").asText());
      assertEquals(4, at(1));
      assertEquals(0, number("SELECT COUNT(*) FROM stock_adjustment"));
    }

    @Test
    @DisplayName("IT-WH-24 - Family gửi yêu cầu xếp kệ → Owner xác nhận: hàng lên kệ, Family nhận thông báo")
    void it24() throws Exception {
      who = FAMILY;
      var request = ok(post("/api/warehouse/move-requests"), move(null, 2, 3, key()));
      int id = request.get("request_id").asInt();
      assertEquals("PENDING", db.queryForObject("SELECT request_status FROM stock_adjustment WHERE adjustment_id=?", String.class, id));
      assertEquals(0, number("SELECT COUNT(*) FROM product_location WHERE shelf_level_id=2"));

      who = OWNER;
      ok(post("/api/warehouse/move-requests/" + id + "/approve"), null);
      assertEquals("APPROVED", db.queryForObject("SELECT request_status FROM stock_adjustment WHERE adjustment_id=?", String.class, id));
      assertEquals(3, number("SELECT quantity FROM product_location WHERE detail_id=1 AND shelf_level_id=2"));
      assertEquals(1, number("SELECT COUNT(*) FROM user_notification WHERE user_id=2"));
    }

    @Test
    @DisplayName("IT-WH-25 - Owner từ chối yêu cầu xếp kệ: REJECTED, hàng không đổi")
    void it25() throws Exception {
      who = FAMILY;
      int id = ok(post("/api/warehouse/move-requests"), move(null, 2, 3, key())).get("request_id").asInt();
      who = OWNER;
      ok(post("/api/warehouse/move-requests/" + id + "/reject"), Map.of("reason", "Tầng 2 dành cho hàng mới"));
      assertEquals("REJECTED", db.queryForObject("SELECT request_status FROM stock_adjustment WHERE adjustment_id=?", String.class, id));
      assertEquals(0, number("SELECT COUNT(*) FROM product_location WHERE shelf_level_id=2"));
    }
  }

  // ---------- Hàng lỗi ----------

  @Nested
  @DisplayName("Hàng lỗi (Kho - Hàng lỗi 1.1-3.20)")
  class Defects {
    Map<String, Object> report(String code, int qty) {
      return Map.of("code", code, "quantity", qty, "types", List.of("Rách"), "source", "WAREHOUSE");
    }

    @Test
    @DisplayName("IT-WH-26 - báo 2 chiếc lỗi theo mã chung: ghi product_unit OPEN, tồn không đổi")
    void it26() throws Exception {
      ok(post("/api/warehouse/defects"), report("TH000001", 2));
      assertEquals(2, number("SELECT COUNT(*) FROM product_unit WHERE detail_id=1 AND defect_status='OPEN'"));
      assertEquals(10, stock(1));
      assertTrue(audits("DEFECT_REPORT") >= 1);
    }

    @Test
    @DisplayName("IT-WH-27 - báo lỗi với mã không tồn tại: 404; số lỗi vượt tồn: 409")
    void it27() throws Exception {
      assertEquals("BARCODE_NOT_FOUND", fails(404, post("/api/warehouse/defects"), report("TH999999", 1)).get("code").asText());
      assertEquals("WAREHOUSE_CONFLICT", fails(409, post("/api/warehouse/defects"), report("TH000001", 11)).get("code").asText());
      assertEquals(0, number("SELECT COUNT(*) FROM product_unit"));
    }

    @Test
    @DisplayName("IT-WH-28 - bỏ hẳn 1 chiếc lỗi: tồn giảm 1, ghi ADJUSTMENT, chiếc lỗi DISCARDED")
    void it28() throws Exception {
      ok(post("/api/warehouse/defects"), report("TH000001", 1));
      int unit = number("SELECT unit_id FROM product_unit WHERE detail_id=1");
      ok(post("/api/warehouse/defects/" + unit + "/discard"), Map.of("note", "Rách không sửa được"));
      assertEquals(9, stock(1));
      assertEquals("DISCARDED", db.queryForObject("SELECT defect_status FROM product_unit WHERE unit_id=?", String.class, unit));
      assertEquals(-1, number("SELECT SUM(quantity_change) FROM stock_adjustment WHERE detail_id=1 AND movement_type='ADJUSTMENT'"));
    }
  }

  // ---------- Mã vạch ----------

  @Nested
  @DisplayName("Mã vạch: tạo mã và tra cứu (Kho - Mã vạch 1.1-3.11)")
  class Barcodes {
    @Test
    @DisplayName("IT-WH-29 - tạo mã cho biến thể chưa có: lưu dạng TH + 6 số, ghi audit")
    void it29() throws Exception {
      ok(post("/api/warehouse/barcodes/generate"), Map.of("detailIds", List.of(2)));
      assertEquals("TH000002", db.queryForObject("SELECT barcode FROM product_detail WHERE detail_id=2", String.class));
      assertEquals(1, audits("BARCODE_GENERATE"));
      assertEquals("TH000001", db.queryForObject("SELECT barcode FROM product_detail WHERE detail_id=1", String.class));
    }

    @Test
    @DisplayName("IT-WH-30 - quét mã tra cứu: trả biến thể, tồn và vị trí trên kệ")
    void it30() throws Exception {
      var r = ok(get("/api/warehouse/barcodes/lookup").param("code", "TH000001"), null);
      assertTrue(r.toString().contains("\"detail_id\":1"), r.toString());
      assertTrue(r.toString().contains("\"stock_quantity\":10"), r.toString());
      assertTrue(r.toString().contains("\"tier_label\":\"A1\""), r.toString());
    }

    @Test
    @DisplayName("IT-WH-31 - mã sai định dạng: 400 INVALID_BARCODE; mã không có: 404 BARCODE_NOT_FOUND")
    void it31() throws Exception {
      assertEquals("INVALID_BARCODE", fails(400, get("/api/warehouse/barcodes/lookup").param("code", "TH 01#"), null).get("code").asText());
      assertEquals("BARCODE_NOT_FOUND", fails(404, get("/api/warehouse/barcodes/lookup").param("code", "TH999999"), null).get("code").asText());
    }
  }

}
