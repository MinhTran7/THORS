-- Bảng bổ sung cho AccountIntegrationTest và OrderDeliveryIntegrationTest (H2 MODE=MySQL).
-- Cột theo database/SQL_v3.sql và các migration 2026-11-13_order_delivery_proof.sql,
-- 2026-11-18_password_change_required.sql. Cố ý KHÔNG đặt khóa ngoại tới `user` để test-schema.sql
-- của các test khác vẫn DROP được bảng user.
CREATE TABLE IF NOT EXISTS user_password_change_required (
  user_id INT NOT NULL PRIMARY KEY,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification (
  notification_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(30) NOT NULL,
  related_entity_type VARCHAR(50) NULL,
  related_entity_id INT NULL,
  -- MySQL có DEFAULT CURRENT_TIMESTAMP; bỏ ở H2 vì H2 trả cả cột có DEFAULT trong getGeneratedKeys(), làm
  -- KeyHolder.getKey() của NotificationRepository.insert lỗi. Code luôn ghi NOW() nên không đổi hành vi.
  created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS user_notification (
  user_notification_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  notification_id INT NOT NULL,
  is_read TINYINT NOT NULL DEFAULT 0,
  read_at DATETIME NULL
);

CREATE TABLE IF NOT EXISTS product_detail (
  detail_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  size VARCHAR(10) NOT NULL DEFAULT 'M',
  color VARCHAR(30) NOT NULL DEFAULT 'Đen',
  price DECIMAL(12,0) NULL,
  stock_quantity INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS product_image (
  image_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  is_primary TINYINT NOT NULL DEFAULT 0,
  deleted_at DATETIME NULL
);

CREATE TABLE IF NOT EXISTS orders (
  order_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(30) NOT NULL,
  order_type VARCHAR(20) NOT NULL,
  user_id INT NOT NULL,
  discount_code_id INT NULL,
  promotion_id INT NULL,
  delivery_name VARCHAR(100) NULL,
  delivery_phone VARCHAR(15) NULL,
  delivery_address VARCHAR(255) NULL,
  delivery_lat DOUBLE NULL,
  delivery_lng DOUBLE NULL,
  delivery_distance_m INT NULL,
  delivery_distance_approx TINYINT NOT NULL DEFAULT 0,
  order_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  order_status VARCHAR(30) NOT NULL,
  payment_expires_at DATETIME NULL,
  total_amount DECIMAL(12,0) NOT NULL,
  created_by INT NOT NULL,
  confirmed_by INT NULL,
  confirmed_at DATETIME NULL,
  stock_deducted_at DATETIME NULL,
  preparation_status VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED',
  payment_method VARCHAR(30) NOT NULL,
  payment_status VARCHAR(30) NOT NULL,
  items_amount DECIMAL(12,0) NOT NULL,
  promotion_discount_amount DECIMAL(12,0) NOT NULL DEFAULT 0,
  coupon_discount_amount DECIMAL(12,0) NOT NULL DEFAULT 0,
  manual_discount_amount DECIMAL(12,0) NOT NULL DEFAULT 0,
  shipping_fee DECIMAL(12,0) NOT NULL DEFAULT 0,
  coupon_code_snapshot VARCHAR(30) NULL,
  promotion_name_snapshot VARCHAR(100) NULL,
  cancel_reason VARCHAR(255) NULL,
  cancelled_at DATETIME NULL,
  related_order_id INT NULL,
  stock_hold_status VARCHAR(20) NOT NULL DEFAULT 'NONE',
  stock_hold_payment_id INT NULL,
  stock_hold_expires_at DATETIME NULL,
  stock_hold_created_at DATETIME NULL,
  stock_hold_paid_at DATETIME NULL,
  stock_hold_closed_at DATETIME NULL,
  stock_hold_close_reason VARCHAR(255) NULL,
  stock_hold_key VARCHAR(100) NULL,
  shipping_carrier VARCHAR(50) NULL,
  shipping_service_code VARCHAR(50) NULL,
  provider_shipment_id VARCHAR(100) NULL,
  tracking_number VARCHAR(100) NULL,
  shipment_status VARCHAR(30) NULL,
  carrier_shipping_fee DECIMAL(12,0) NULL,
  cod_amount DECIMAL(12,0) NULL,
  shipment_created_at DATETIME NULL,
  shipment_picked_up_at DATETIME NULL,
  shipment_delivered_at DATETIME NULL,
  shipment_updated_at DATETIME NULL,
  shipment_last_event_id VARCHAR(100) NULL,
  delivery_district_id INT NULL,
  delivery_ward_code VARCHAR(20) NULL,
  package_weight_g INT NULL,
  refund_bank_bin VARCHAR(20) NULL,
  refund_bank_name VARCHAR(100) NULL,
  refund_account_number VARCHAR(50) NULL,
  refund_account_name VARCHAR(100) NULL
);

CREATE TABLE IF NOT EXISTS order_item (
  order_item_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  detail_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(12,0) NOT NULL,
  product_name_snapshot VARCHAR(200) NOT NULL,
  size_snapshot VARCHAR(10) NOT NULL,
  color_snapshot VARCHAR(30) NOT NULL,
  reserved_quantity INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_delivery_proof (
  order_id INT NOT NULL PRIMARY KEY,
  image_urls TEXT NOT NULL,
  note VARCHAR(255) NULL,
  created_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS return_request (
  return_request_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  status VARCHAR(30) NOT NULL
);
