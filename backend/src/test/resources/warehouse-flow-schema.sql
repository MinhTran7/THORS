-- In-memory fixture for WarehouseOrderFlowTest. Columns/constraints follow database/SQL_v1.sql
-- for the tables touched by the purchase order flow. receipt_type / movement_type CHECKs are added
-- by the test so it can run both the dump rules and the proposed SUPPLIER_RETURN rules.
CREATE TABLE `role` (role_id INT PRIMARY KEY, role_name VARCHAR(50) NOT NULL);
CREATE TABLE `user` (
  user_id INT PRIMARY KEY, role_id INT NOT NULL, full_name VARCHAR(100) NOT NULL,
  account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE');
CREATE TABLE category (
  category_id INT AUTO_INCREMENT PRIMARY KEY, category_name VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255), status VARCHAR(20) NOT NULL);
CREATE TABLE product (
  product_id INT AUTO_INCREMENT PRIMARY KEY, category_id INT NOT NULL, product_name VARCHAR(200) NOT NULL,
  description CLOB, status VARCHAR(20) NOT NULL);
CREATE TABLE product_detail (
  detail_id INT AUTO_INCREMENT PRIMARY KEY, product_id INT NOT NULL, size VARCHAR(10) NOT NULL,
  color VARCHAR(30) NOT NULL, price DECIMAL(12,0) NOT NULL, stock_quantity INT NOT NULL DEFAULT 0, min_stock_quantity INT,
  barcode VARCHAR(32) UNIQUE,
  online_sales_enabled TINYINT NOT NULL DEFAULT 0, status VARCHAR(20) NOT NULL,
  CONSTRAINT uq_product_detail_1 UNIQUE (product_id, size, color),
  CONSTRAINT ck_product_detail_2 CHECK (stock_quantity >= 0));
CREATE TABLE product_image (
  image_id INT AUTO_INCREMENT PRIMARY KEY, product_id INT NOT NULL, image_url VARCHAR(500) NOT NULL,
  is_primary TINYINT NOT NULL DEFAULT 0, cloud_public_id VARCHAR(255), deleted_at TIMESTAMP);
CREATE TABLE product_location (
  product_location_id INT AUTO_INCREMENT PRIMARY KEY, detail_id INT NOT NULL, shelf_level_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 0, description CLOB, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_product_location_1 CHECK (quantity >= 0));
CREATE TABLE stock_receipt (
  receipt_id INT AUTO_INCREMENT PRIMARY KEY, receipt_type VARCHAR(20) NOT NULL, source_receipt_id INT,
  manufacturer_name VARCHAR(200), created_by INT NOT NULL, receipt_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note VARCHAR(255), status VARCHAR(30) NOT NULL DEFAULT 'DRAFT', confirmed_by INT, confirmed_at TIMESTAMP,
  rejection_reason VARCHAR(255), closed_at TIMESTAMP, close_reason VARCHAR(255), paid_before_tracking DECIMAL(12,0),
  CONSTRAINT fk_receipt_source FOREIGN KEY (source_receipt_id) REFERENCES stock_receipt (receipt_id),
  CONSTRAINT ck_stock_receipt_1 CHECK (status IN ('DRAFT','PENDING_CONFIRMATION','CONFIRMED','REJECTED','CANCELLED','CLOSED')));
CREATE TABLE stock_receipt_item (
  receipt_item_id INT AUTO_INCREMENT PRIMARY KEY, receipt_id INT NOT NULL, detail_id INT NOT NULL,
  source_receipt_item_id INT, quantity INT NOT NULL, unit_price DECIMAL(12,0) NOT NULL,
  CONSTRAINT fk_receipt_item_source FOREIGN KEY (source_receipt_item_id) REFERENCES stock_receipt_item (receipt_item_id),
  CONSTRAINT fk_stock_receipt_item_receipt_id FOREIGN KEY (receipt_id) REFERENCES stock_receipt (receipt_id),
  CONSTRAINT fk_stock_receipt_item_detail_id FOREIGN KEY (detail_id) REFERENCES product_detail (detail_id),
  CONSTRAINT ck_receipt_item_price CHECK (unit_price >= 0),
  CONSTRAINT ck_stock_receipt_item_1 CHECK (quantity > 0));
CREATE TABLE stock_adjustment (
  adjustment_id INT AUTO_INCREMENT PRIMARY KEY, detail_id INT NOT NULL, quantity_change INT NOT NULL,
  reason VARCHAR(255) NOT NULL, adjusted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, adjusted_by INT NOT NULL,
  movement_type VARCHAR(30) NOT NULL DEFAULT 'ADJUSTMENT', movement_quantity INT, source_location_id INT,
  destination_location_id INT, order_item_id INT, receipt_item_id INT, return_request_item_id INT,
  original_out_adjustment_id INT, idempotency_key VARCHAR(100),
  CONSTRAINT uq_stock_adjustment_1 UNIQUE (idempotency_key),
  CONSTRAINT ck_stock_adjustment_4 CHECK (movement_type NOT IN ('RECEIPT','RESTOCK') OR quantity_change > 0));
CREATE TABLE notification (
  notification_id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(200) NOT NULL, message CLOB NOT NULL,
  type VARCHAR(30) NOT NULL, related_entity_type VARCHAR(50), related_entity_id INT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE user_notification (
  user_notification_id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, notification_id INT NOT NULL,
  is_read TINYINT NOT NULL DEFAULT 0);
CREATE TABLE audit_log (
  log_id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, action_type VARCHAR(50), entity_affected VARCHAR(100),
  entity_id INT, new_value VARCHAR(500), actor_type VARCHAR(20),
  performed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE supplier_settlement (
  settlement_id INT AUTO_INCREMENT PRIMARY KEY, settlement_type VARCHAR(20) NOT NULL, supplier_name VARCHAR(200) NOT NULL,
  return_id INT, return_item_id INT, target_receipt_id INT, quantity INT, amount DECIMAL(12,0) NOT NULL,
  payment_method VARCHAR(20), transaction_date DATE NOT NULL, note VARCHAR(255), created_by INT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  voided_by INT, voided_at TIMESTAMP, void_reason VARCHAR(255), request_key VARCHAR(36) NOT NULL,
  CONSTRAINT uq_supplier_settlement_1 UNIQUE (request_key),
  CONSTRAINT ck_supplier_settlement_1 CHECK (settlement_type IN ('PAYMENT','REFUND','DEBT_OFFSET','CREDIT_HOLD','CREDIT_USE','EXCHANGE')),
  CONSTRAINT ck_supplier_settlement_2 CHECK (amount > 0),
  CONSTRAINT ck_supplier_settlement_4 CHECK (
       (settlement_type = 'PAYMENT' AND return_id IS NULL AND target_receipt_id IS NOT NULL AND payment_method IS NOT NULL)
    OR (settlement_type = 'REFUND' AND return_id IS NOT NULL AND payment_method IS NOT NULL AND target_receipt_id IS NULL)
    OR (settlement_type = 'DEBT_OFFSET' AND return_id IS NOT NULL AND target_receipt_id IS NOT NULL)
    OR (settlement_type = 'CREDIT_HOLD' AND return_id IS NOT NULL AND target_receipt_id IS NULL)
    OR (settlement_type = 'CREDIT_USE' AND return_id IS NULL AND target_receipt_id IS NOT NULL)
    OR (settlement_type = 'EXCHANGE' AND return_id IS NOT NULL AND return_item_id IS NOT NULL AND quantity IS NOT NULL AND quantity > 0
        AND target_receipt_id IS NULL)));
CREATE TABLE rack (rack_id INT AUTO_INCREMENT PRIMARY KEY, rack_code VARCHAR(20) NOT NULL);
CREATE TABLE shelf_level (
  shelf_level_id INT AUTO_INCREMENT PRIMARY KEY, rack_id INT NOT NULL, level_number INT NOT NULL);

-- Minimal sales tables so cart/checkout/shop queries can be checked for unset sale prices.
CREATE TABLE orders (order_id INT AUTO_INCREMENT PRIMARY KEY, stock_hold_status VARCHAR(20) DEFAULT 'NONE',
  order_number VARCHAR(30), order_type VARCHAR(20) DEFAULT 'Online', order_status VARCHAR(30) DEFAULT 'PENDING_CONFIRMATION',
  order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP, stock_hold_created_at TIMESTAMP, stock_hold_closed_at TIMESTAMP,
  stock_hold_close_reason VARCHAR(255), stock_deducted_at TIMESTAMP);
CREATE TABLE order_item (order_item_id INT AUTO_INCREMENT PRIMARY KEY, order_id INT NOT NULL, detail_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1, reserved_quantity INT NOT NULL DEFAULT 0,
  CONSTRAINT ck_order_item_3 CHECK (reserved_quantity BETWEEN 0 AND quantity));
CREATE TABLE return_request_item (return_request_item_id INT AUTO_INCREMENT PRIMARY KEY, return_request_id INT NOT NULL, order_item_id INT);
-- database/migrations/2026-11-06_inventory.sql
CREATE TABLE stock_count (
  count_id INT AUTO_INCREMENT PRIMARY KEY, status VARCHAR(30) NOT NULL DEFAULT 'DRAFT', note VARCHAR(255),
  created_by INT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, counted_at TIMESTAMP NOT NULL,
  confirmed_by INT, confirmed_at TIMESTAMP, rejection_reason VARCHAR(255), request_key VARCHAR(36) UNIQUE,
  CONSTRAINT ck_stock_count_status CHECK (status IN ('DRAFT','PENDING_CONFIRMATION','CONFIRMED','REJECTED','CANCELLED')));
CREATE TABLE stock_count_item (
  count_item_id INT AUTO_INCREMENT PRIMARY KEY, count_id INT NOT NULL, detail_id INT NOT NULL, product_location_id INT,
  system_quantity INT NOT NULL, counted_quantity INT NOT NULL, reason_code VARCHAR(20), note VARCHAR(255),
  CONSTRAINT ck_stock_count_item_1 CHECK (system_quantity >= 0 AND counted_quantity >= 0));

INSERT INTO `role` VALUES (1, 'OWNER'), (2, 'FAMILY_MEMBER'), (3, 'STAFF');
INSERT INTO `user` VALUES (1, 1, 'Chủ cửa hàng', 'ACTIVE'), (2, 2, 'Người nhà', 'ACTIVE'), (3, 3, 'Nhân viên', 'ACTIVE');
INSERT INTO category (category_id, category_name, status) VALUES (1, 'Áo', 'ACTIVE'), (2, 'Quần', 'ACTIVE');
INSERT INTO product (product_id, category_id, product_name, description, status) VALUES
  (10, 1, 'Áo thun', '', 'ACTIVE'), (11, 1, 'Áo sơ mi', '', 'ACTIVE'), (12, 2, 'Quần jean', '', 'ACTIVE');
INSERT INTO product_detail (detail_id, product_id, size, color, price, stock_quantity, online_sales_enabled, status) VALUES
  (1, 10, 'M', 'Đen', 150000, 0, 0, 'ACTIVE'), (2, 10, 'L', 'Đen', 150000, 0, 0, 'ACTIVE'),
  (3, 10, 'M', 'Trắng', 150000, 0, 0, 'ACTIVE'), (4, 11, 'M', 'Xanh', 250000, 0, 0, 'ACTIVE'),
  (5, 12, '30', 'Xanh', 300000, 0, 0, 'ACTIVE'), (6, 12, '31', 'Đen', 300000, 0, 0, 'ACTIVE');
ALTER TABLE product ALTER COLUMN product_id RESTART WITH 100;
ALTER TABLE product_detail ALTER COLUMN detail_id RESTART WITH 100;
