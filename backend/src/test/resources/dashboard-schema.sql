-- Fixture H2 (MODE=MySQL) cho DashboardServiceTest. Chỉ các cột bảng điều khiển đọc, theo database/SQL_v2.sql
-- và migration 2026-11-06_inventory.sql (min_stock_quantity).
CREATE TABLE `role` (role_id INT PRIMARY KEY, role_name VARCHAR(50) NOT NULL);
CREATE TABLE `user` (
  user_id INT PRIMARY KEY, role_id INT NOT NULL, full_name VARCHAR(100) NOT NULL,
  account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE');
CREATE TABLE category (category_id INT PRIMARY KEY, category_name VARCHAR(100) NOT NULL, status VARCHAR(20) NOT NULL);
CREATE TABLE product (
  product_id INT PRIMARY KEY, category_id INT NOT NULL, product_name VARCHAR(200) NOT NULL, status VARCHAR(20) NOT NULL);
CREATE TABLE product_detail (
  detail_id INT PRIMARY KEY, product_id INT NOT NULL, size VARCHAR(10) NOT NULL, color VARCHAR(30) NOT NULL,
  price DECIMAL(12,0), stock_quantity INT NOT NULL DEFAULT 0, min_stock_quantity INT,
  online_sales_enabled TINYINT NOT NULL DEFAULT 0, status VARCHAR(20) NOT NULL);
CREATE TABLE orders (
  order_id INT PRIMARY KEY, order_number VARCHAR(30) NOT NULL, order_type VARCHAR(20) NOT NULL,
  user_id INT NOT NULL, created_by INT NOT NULL, order_date TIMESTAMP NOT NULL,
  order_status VARCHAR(30) NOT NULL, payment_status VARCHAR(30) NOT NULL, total_amount DECIMAL(12,0) NOT NULL);
CREATE TABLE order_item (
  order_item_id INT PRIMARY KEY, order_id INT NOT NULL, detail_id INT NOT NULL, quantity INT NOT NULL,
  unit_price DECIMAL(12,0) NOT NULL, reserved_quantity INT NOT NULL DEFAULT 0);
CREATE TABLE payment (
  payment_id INT PRIMARY KEY, order_id INT NOT NULL, amount DECIMAL(12,0) NOT NULL,
  refunded_amount DECIMAL(12,0) NOT NULL DEFAULT 0);

INSERT INTO `role` VALUES (2, 'OWNER'), (3, 'FAMILY_MEMBER'), (5, 'CUSTOMER');
INSERT INTO `user` VALUES
  (1, 2, 'Chủ shop', 'ACTIVE'),
  (2, 3, 'Thành viên A', 'ACTIVE'),
  (3, 3, 'Thành viên khóa', 'LOCKED'),
  (9, 5, 'Khách web', 'ACTIVE');
INSERT INTO category VALUES (1, 'Áo', 'ACTIVE'), (2, 'Quần', 'INACTIVE');
INSERT INTO product VALUES (10, 1, 'Áo thun', 'ACTIVE'), (11, 1, 'Áo khoác', 'ACTIVE'), (12, 1, 'Áo cũ', 'INACTIVE');
INSERT INTO product_detail VALUES
  (100, 10, 'M', 'Đen', 100000, 20, 5, 1, 'ACTIVE'),   -- còn hàng
  (101, 10, 'L', 'Đen', 100000, 0, 5, 1, 'ACTIVE'),    -- hết hàng
  (102, 11, 'M', 'Xám', 300000, 6, 3, 0, 'ACTIVE'),    -- tồn 6, đang giữ 4 => có thể bán 2 <= ngưỡng 3 => sắp hết
  (103, 11, 'L', 'Xám', 300000, 2, NULL, 0, 'ACTIVE'), -- chưa đặt ngưỡng => không tính sắp hết
  (104, 12, 'M', 'Trắng', 50000, 0, NULL, 0, 'ACTIVE');-- sản phẩm ngưng bán => bỏ qua

-- Ngày 2026-11-02 .. 2026-11-04
INSERT INTO orders VALUES
  (1, 'POS-1', 'In-Store', 2, 2, TIMESTAMP '2026-11-02 09:00:00', 'COMPLETED', 'PAID', 200000),
  (2, 'ORD-1', 'Online', 9, 9, TIMESTAMP '2026-11-03 10:00:00', 'DELIVERED', 'PAID', 300000),
  (3, 'ORD-2', 'Online', 9, 9, TIMESTAMP '2026-11-03 11:00:00', 'PENDING_CONFIRMATION', 'UNPAID', 999000),
  (4, 'ORD-FB', 'Online', 1, 1, TIMESTAMP '2026-11-04 15:00:00', 'COMPLETED', 'PARTIALLY_REFUNDED', 600000),
  (5, 'ORD-3', 'Online', 9, 9, TIMESTAMP '2026-11-04 16:00:00', 'CANCELLED', 'UNPAID', 100000),
  (6, 'POS-OLD', 'In-Store', 1, 1, TIMESTAMP '2026-10-01 09:00:00', 'COMPLETED', 'PAID', 777000),
  (7, 'ORD-4', 'Online', 9, 9, TIMESTAMP '2026-10-20 09:00:00', 'AWAITING_PICKUP', 'PAID', 100000);
INSERT INTO order_item VALUES
  (1, 1, 100, 2, 100000, 0),
  (2, 2, 102, 1, 300000, 0),
  (3, 3, 102, 4, 300000, 4),
  (4, 4, 102, 2, 300000, 0),
  (5, 5, 100, 1, 100000, 0);
INSERT INTO payment VALUES (1, 4, 600000, 100000);
