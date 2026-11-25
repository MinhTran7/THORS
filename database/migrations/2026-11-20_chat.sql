-- Chat giữa khách hàng và cửa hàng ("Liên hệ người bán") — 20/11/2026.
-- CHỈ TẠO 2 BẢNG MỚI, không sửa/xóa dữ liệu cũ. Chạy một lần sau SQL_v3.sql
-- (kiểm tra: SHOW TABLES LIKE 'chat_%'; đã có đủ 2 bảng thì bỏ qua).
-- Chưa chạy migration thì web ẩn nút chat; chạy xong thì trong vòng 1 phút tự bật, không cần khởi động lại.
-- Mọi cột thời gian lưu theo giờ UTC như các bảng khác.

-- Mỗi khách hàng có đúng một cuộc trò chuyện với cửa hàng.
CREATE TABLE IF NOT EXISTS chat_conversation (
  conversation_id INT NOT NULL AUTO_INCREMENT,
  customer_id INT NOT NULL COMMENT 'Tài khoản khách hàng (user.user_id)',
  last_message_at DATETIME DEFAULT NULL COMMENT 'Thời điểm tin nhắn mới nhất, để sắp xếp danh sách',
  customer_last_read_id BIGINT NOT NULL DEFAULT 0 COMMENT 'Tin cuối cùng khách đã đọc',
  store_last_read_id BIGINT NOT NULL DEFAULT 0 COMMENT 'Tin cuối cùng cửa hàng đã đọc',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id),
  UNIQUE KEY uq_chat_conversation_customer (customer_id),
  KEY ix_chat_conversation_last (last_message_at),
  CONSTRAINT fk_chat_conversation_customer FOREIGN KEY (customer_id) REFERENCES `user` (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Tin nhắn: chữ và/hoặc ảnh, có thể kèm thẻ đơn hàng hoặc thẻ sản phẩm.
CREATE TABLE IF NOT EXISTS chat_message (
  message_id BIGINT NOT NULL AUTO_INCREMENT,
  conversation_id INT NOT NULL,
  sender_id INT NOT NULL COMMENT 'Người gửi (user.user_id)',
  sender_side VARCHAR(10) NOT NULL COMMENT 'CUSTOMER hoặc STORE',
  body TEXT DEFAULT NULL COMMENT 'Nội dung chữ; NULL khi chỉ gửi ảnh / thẻ',
  image_url VARCHAR(500) DEFAULT NULL COMMENT 'Ảnh đính kèm (Cloudinary)',
  order_id INT DEFAULT NULL COMMENT 'Thẻ đơn hàng đính kèm',
  product_id INT DEFAULT NULL COMMENT 'Thẻ sản phẩm đính kèm',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id),
  KEY ix_chat_message_conversation (conversation_id, message_id),
  CONSTRAINT fk_chat_message_conversation FOREIGN KEY (conversation_id) REFERENCES chat_conversation (conversation_id),
  CONSTRAINT fk_chat_message_sender FOREIGN KEY (sender_id) REFERENCES `user` (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
