-- Yêu cầu xếp kệ / chuyển kệ của Family Member chờ Owner xác nhận (10/11/2026). Chạy SAU 2026-11-06_inventory.sql.
-- CHƯA CHẠY trên thors_restore. Chỉ THÊM một bảng mới, không sửa/xóa bảng hay dữ liệu cũ.
-- Family bấm Lưu → một dòng PENDING ở đây; product_location và stock_adjustment chưa đổi.
-- Owner xác nhận → hệ thống thực hiện đúng thao tác xếp/chuyển (ghi stock_adjustment 'MOVE' với
-- idempotency_key = 'move:<request_key>') rồi đánh dấu APPROVED. Owner từ chối → REJECTED, kho không đổi.

CREATE TABLE location_move_request (
  request_id INT NOT NULL AUTO_INCREMENT,
  detail_id INT NOT NULL,
  from_location_id INT DEFAULT NULL COMMENT 'NULL = lấy từ phần chưa xếp vị trí',
  to_shelf_id INT DEFAULT NULL COMMENT 'Tầng đích; NULL = đưa về phần chưa xếp vị trí',
  quantity INT NOT NULL,
  description VARCHAR(2000) DEFAULT NULL COMMENT 'Mô tả vị trí (bắt buộc khi là vị trí mới)',
  photo_keys VARCHAR(400) DEFAULT NULL COMMENT 'Mã ảnh thực tế, cách nhau bởi dấu phẩy (tối đa 8)',
  request_key VARCHAR(36) NOT NULL COMMENT 'Chống gửi trùng khi bấm lặp',
  status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'PENDING'
    COMMENT 'PENDING / APPROVED / REJECTED / CANCELLED',
  requested_by INT NOT NULL COMMENT 'Family Member gửi yêu cầu',
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by INT DEFAULT NULL COMMENT 'Owner xác nhận / từ chối (hoặc người gửi tự hủy)',
  decided_at DATETIME DEFAULT NULL,
  rejection_reason VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (request_id),
  UNIQUE KEY uq_location_move_request_key (request_key),
  KEY ix_location_move_request_status (status, requested_at),
  CONSTRAINT fk_move_request_detail FOREIGN KEY (detail_id) REFERENCES product_detail (detail_id),
  CONSTRAINT fk_move_request_from FOREIGN KEY (from_location_id) REFERENCES product_location (product_location_id),
  CONSTRAINT fk_move_request_to FOREIGN KEY (to_shelf_id) REFERENCES shelf_level (shelf_level_id),
  CONSTRAINT fk_move_request_by FOREIGN KEY (requested_by) REFERENCES `user` (user_id),
  CONSTRAINT fk_move_request_decided_by FOREIGN KEY (decided_by) REFERENCES `user` (user_id),
  CONSTRAINT ck_move_request_quantity CHECK (quantity > 0),
  CONSTRAINT ck_move_request_status CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Kiểm tra sau khi chạy (kết quả mong đợi: 1):
-- SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='location_move_request';
--
-- Hoàn tác (chỉ khi chưa cần giữ lịch sử yêu cầu):
-- DROP TABLE location_move_request;
