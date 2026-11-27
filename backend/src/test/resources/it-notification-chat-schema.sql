-- Bảng thêm cho NotificationIntegrationTest / ChatIntegrationTest / ImageSearchIntegrationTest (H2, MODE=MySQL).
-- Chạy SAU test-schema.sql (role, user, audit_log). Cột lấy theo database/SQL_v3.sql và các migration
-- 2026-11-09_notification_mute, 2026-11-20_chat, 2026-11-24_chat_rag, 2026-11-25_order_item_promotion,
-- 2026-11-25_promotion_type. Bỏ khóa ngoại để dọn dữ liệu giữa các test cho đơn giản.
-- Các bảng code chèn bằng RETURN_GENERATED_KEYS (notification, orders, chat_message) KHÔNG để DEFAULT CURRENT_TIMESTAMP:
-- H2 trả cột có default dạng biểu thức như một generated key nữa, làm KeyHolder.getKey() báo "multiple keys".
-- Câu SQL MySQL mà H2 không hiểu được đổi cú pháp trong com.thors.it.H2MysqlShim (chỉ ở test).
CREATE TABLE IF NOT EXISTS notification (
  notification_id INT NOT NULL AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(30) NOT NULL,
  related_entity_type VARCHAR(50) DEFAULT NULL,
  related_entity_id INT DEFAULT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (notification_id)
);
CREATE TABLE IF NOT EXISTS user_notification (
  user_notification_id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  notification_id INT NOT NULL,
  is_read TINYINT NOT NULL DEFAULT 0,
  read_at DATETIME DEFAULT NULL,
  PRIMARY KEY (user_notification_id),
  UNIQUE (user_id, notification_id)
);
CREATE TABLE IF NOT EXISTS notification_mute (
  user_id INT NOT NULL,
  type VARCHAR(30) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, type)
);
CREATE TABLE IF NOT EXISTS category (
  category_id INT NOT NULL AUTO_INCREMENT,
  category_name VARCHAR(100) NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  parent_id INT DEFAULT NULL,
  target_group VARCHAR(30) DEFAULT NULL,
  icon VARCHAR(40) DEFAULT NULL,
  status VARCHAR(20) NOT NULL,
  PRIMARY KEY (category_id)
);
CREATE TABLE IF NOT EXISTS product (
  product_id INT NOT NULL AUTO_INCREMENT,
  sku VARCHAR(30) DEFAULT NULL,
  category_id INT NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL,
  PRIMARY KEY (product_id)
);
CREATE TABLE IF NOT EXISTS product_detail (
  detail_id INT NOT NULL AUTO_INCREMENT,
  barcode VARCHAR(32) DEFAULT NULL,
  product_id INT NOT NULL,
  size VARCHAR(10) NOT NULL,
  color VARCHAR(30) NOT NULL,
  price DECIMAL(12,0) DEFAULT NULL,
  stock_quantity INT NOT NULL DEFAULT 0,
  min_stock_quantity INT DEFAULT NULL,
  online_sales_enabled TINYINT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL,
  PRIMARY KEY (detail_id)
);
CREATE TABLE IF NOT EXISTS product_image (
  image_id INT NOT NULL AUTO_INCREMENT,
  product_id INT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  is_primary TINYINT NOT NULL DEFAULT 0,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cloud_public_id VARCHAR(255) DEFAULT NULL,
  deleted_at DATETIME DEFAULT NULL,
  PRIMARY KEY (image_id)
);
CREATE TABLE IF NOT EXISTS cart (
  cart_id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  PRIMARY KEY (cart_id),
  UNIQUE (user_id)
);
CREATE TABLE IF NOT EXISTS cart_item (
  cart_item_id INT NOT NULL AUTO_INCREMENT,
  cart_id INT NOT NULL,
  detail_id INT NOT NULL,
  quantity INT NOT NULL,
  PRIMARY KEY (cart_item_id),
  UNIQUE (cart_id, detail_id)
);
CREATE TABLE IF NOT EXISTS promotion (
  promotion_id INT NOT NULL AUTO_INCREMENT,
  promotion_type VARCHAR(20) NOT NULL DEFAULT 'PRODUCT_DISCOUNT',
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  discount_value DECIMAL(12,2) NOT NULL,
  start_date DATETIME NOT NULL,
  end_date DATETIME NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_by INT NOT NULL,
  discount_type VARCHAR(20) NOT NULL,
  min_order_value DECIMAL(12,0) NOT NULL DEFAULT 0,
  max_discount_amount DECIMAL(12,0) DEFAULT NULL,
  usage_limit INT DEFAULT NULL,
  apply_scope VARCHAR(20) NOT NULL DEFAULT 'ALL',
  PRIMARY KEY (promotion_id),
  CONSTRAINT ck_it_promotion_dates CHECK (end_date > start_date)
);
CREATE TABLE IF NOT EXISTS promotion_product (
  promotion_id INT NOT NULL,
  product_id INT NOT NULL,
  PRIMARY KEY (promotion_id, product_id)
);
CREATE TABLE IF NOT EXISTS orders (
  order_id INT NOT NULL AUTO_INCREMENT,
  order_number VARCHAR(30) NOT NULL,
  order_type VARCHAR(20) NOT NULL,
  user_id INT NOT NULL,
  discount_code_id INT DEFAULT NULL,
  promotion_id INT DEFAULT NULL,
  delivery_name VARCHAR(100) DEFAULT NULL,
  delivery_phone VARCHAR(15) DEFAULT NULL,
  delivery_address VARCHAR(255) DEFAULT NULL,
  delivery_lat DOUBLE DEFAULT NULL,
  delivery_lng DOUBLE DEFAULT NULL,
  delivery_distance_m INT DEFAULT NULL,
  delivery_distance_approx TINYINT NOT NULL DEFAULT 0,
  order_date DATETIME DEFAULT NULL,
  order_status VARCHAR(30) NOT NULL,
  payment_expires_at DATETIME DEFAULT NULL,
  total_amount DECIMAL(12,0) NOT NULL,
  created_by INT NOT NULL,
  confirmed_by INT DEFAULT NULL,
  confirmed_at DATETIME DEFAULT NULL,
  stock_deducted_at DATETIME DEFAULT NULL,
  preparation_status VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED',
  payment_method VARCHAR(30) NOT NULL,
  payment_status VARCHAR(30) NOT NULL,
  items_amount DECIMAL(12,0) NOT NULL,
  promotion_discount_amount DECIMAL(12,0) NOT NULL DEFAULT 0,
  coupon_discount_amount DECIMAL(12,0) NOT NULL DEFAULT 0,
  manual_discount_amount DECIMAL(12,0) NOT NULL DEFAULT 0,
  shipping_fee DECIMAL(12,0) NOT NULL DEFAULT 0,
  coupon_code_snapshot VARCHAR(30) DEFAULT NULL,
  promotion_name_snapshot VARCHAR(100) DEFAULT NULL,
  cancel_reason VARCHAR(255) DEFAULT NULL,
  cancelled_at DATETIME DEFAULT NULL,
  related_order_id INT DEFAULT NULL,
  stock_hold_status VARCHAR(20) NOT NULL DEFAULT 'NONE',
  stock_hold_payment_id INT DEFAULT NULL,
  stock_hold_expires_at DATETIME DEFAULT NULL,
  stock_hold_created_at DATETIME DEFAULT NULL,
  stock_hold_paid_at DATETIME DEFAULT NULL,
  stock_hold_closed_at DATETIME DEFAULT NULL,
  stock_hold_close_reason VARCHAR(255) DEFAULT NULL,
  stock_hold_key VARCHAR(100) DEFAULT NULL,
  shipping_carrier VARCHAR(50) DEFAULT NULL,
  shipping_service_code VARCHAR(50) DEFAULT NULL,
  provider_shipment_id VARCHAR(100) DEFAULT NULL,
  tracking_number VARCHAR(100) DEFAULT NULL,
  shipment_status VARCHAR(30) DEFAULT NULL,
  carrier_shipping_fee DECIMAL(12,0) DEFAULT NULL,
  cod_amount DECIMAL(12,0) DEFAULT NULL,
  shipment_created_at DATETIME DEFAULT NULL,
  shipment_picked_up_at DATETIME DEFAULT NULL,
  shipment_delivered_at DATETIME DEFAULT NULL,
  shipment_updated_at DATETIME DEFAULT NULL,
  shipment_last_event_id VARCHAR(100) DEFAULT NULL,
  delivery_district_id INT DEFAULT NULL,
  delivery_ward_code VARCHAR(20) DEFAULT NULL,
  package_weight_g INT DEFAULT NULL,
  refund_bank_bin VARCHAR(20) DEFAULT NULL,
  refund_bank_name VARCHAR(100) DEFAULT NULL,
  refund_account_number VARCHAR(50) DEFAULT NULL,
  refund_account_name VARCHAR(100) DEFAULT NULL,
  PRIMARY KEY (order_id),
  UNIQUE (order_number)
);
CREATE TABLE IF NOT EXISTS order_item (
  order_item_id INT NOT NULL AUTO_INCREMENT,
  order_id INT NOT NULL,
  detail_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(12,0) NOT NULL,
  original_price DECIMAL(12,0) DEFAULT NULL,
  promotion_id INT DEFAULT NULL,
  product_name_snapshot VARCHAR(200) NOT NULL,
  size_snapshot VARCHAR(10) NOT NULL,
  color_snapshot VARCHAR(30) NOT NULL,
  reserved_quantity INT NOT NULL DEFAULT 0,
  PRIMARY KEY (order_item_id)
);
CREATE TABLE IF NOT EXISTS website_setting (
  setting_key VARCHAR(64) NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
);
CREATE TABLE IF NOT EXISTS chat_conversation (
  conversation_id INT NOT NULL AUTO_INCREMENT,
  customer_id INT NOT NULL,
  last_message_at DATETIME DEFAULT NULL,
  customer_last_read_id BIGINT NOT NULL DEFAULT 0,
  store_last_read_id BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id),
  UNIQUE (customer_id)
);
CREATE TABLE IF NOT EXISTS chat_message (
  message_id BIGINT NOT NULL AUTO_INCREMENT,
  conversation_id INT NOT NULL,
  sender_id INT NOT NULL,
  sender_side VARCHAR(10) NOT NULL,
  body TEXT DEFAULT NULL,
  image_url VARCHAR(500) DEFAULT NULL,
  order_id INT DEFAULT NULL,
  product_id INT DEFAULT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (message_id)
);
CREATE TABLE IF NOT EXISTS chat_knowledge (
  knowledge_id INT NOT NULL AUTO_INCREMENT,
  source_type VARCHAR(10) NOT NULL,
  source_key VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  embedding BLOB NOT NULL,
  model VARCHAR(60) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (knowledge_id),
  UNIQUE (source_type, source_key)
);
