-- Tồn kho: ngưỡng tối thiểu theo biến thể + phiếu kiểm kê (06/11/2026). Chạy SAU 2026-11-05_supplier_settlement.sql.
-- ĐÃ CHẠY trên thors_restore (05/11/2026 10:13, sau khi sao lưu mysqldump): kiểm tra 1, 2, 0; 44 biến thể, tổng tồn 106 không đổi.
-- Không xóa/sửa dữ liệu cũ: ngưỡng của mọi biến thể hiện có = NULL (= chưa thiết lập, khác với ngưỡng 0).
-- Giữ hàng cho đơn bán dùng lại cột có sẵn order_item.reserved_quantity — không cần thay đổi schema.
-- Lịch sử điều chỉnh do kiểm kê ghi vào stock_adjustment (movement_type 'ADJUSTMENT' đã có trong CHECK),
-- liên kết phiếu qua idempotency_key = 'count:<count_id>:<count_item_id>'.

-- 1. Ngưỡng tồn tối thiểu (Owner thiết lập). NULL = chưa thiết lập; 0 là một ngưỡng thật.
ALTER TABLE product_detail
  ADD COLUMN min_stock_quantity INT DEFAULT NULL
    COMMENT 'Ngưỡng tồn tối thiểu; NULL = chưa thiết lập. So với số có thể bán (tồn − đang giữ)'
    AFTER stock_quantity;
ALTER TABLE product_detail
  ADD CONSTRAINT ck_product_detail_min_stock CHECK (min_stock_quantity IS NULL OR min_stock_quantity >= 0);

-- 2. Phiếu kiểm kê. Nháp / chờ xác nhận không đổi tồn; chỉ Owner xác nhận mới ghi chênh lệch.
CREATE TABLE stock_count (
  count_id INT NOT NULL AUTO_INCREMENT,
  status VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'DRAFT'
    COMMENT 'DRAFT / PENDING_CONFIRMATION / CONFIRMED / REJECTED / CANCELLED',
  note VARCHAR(255) DEFAULT NULL,
  created_by INT NOT NULL COMMENT 'Owner hoặc Family Member lập phiếu',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  counted_at DATETIME NOT NULL COMMENT 'Thời điểm chụp số hệ thống (mỗi lần lưu phiếu)',
  confirmed_by INT DEFAULT NULL COMMENT 'Owner xác nhận / từ chối',
  confirmed_at DATETIME DEFAULT NULL,
  rejection_reason VARCHAR(255) DEFAULT NULL COMMENT 'Lý do từ chối hoặc hủy',
  request_key VARCHAR(36) DEFAULT NULL COMMENT 'Chống tạo trùng khi bấm lặp/gửi lại',
  PRIMARY KEY (count_id),
  UNIQUE KEY uq_stock_count_request (request_key),
  KEY ix_stock_count_status (status, created_at),
  CONSTRAINT fk_stock_count_created_by FOREIGN KEY (created_by) REFERENCES `user` (user_id),
  CONSTRAINT fk_stock_count_confirmed_by FOREIGN KEY (confirmed_by) REFERENCES `user` (user_id),
  CONSTRAINT ck_stock_count_status CHECK (status IN ('DRAFT','PENDING_CONFIRMATION','CONFIRMED','REJECTED','CANCELLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Dòng kiểm kê: một biến thể tại một vị trí (product_location_id NULL = phần chưa xếp vị trí).
CREATE TABLE stock_count_item (
  count_item_id INT NOT NULL AUTO_INCREMENT,
  count_id INT NOT NULL,
  detail_id INT NOT NULL,
  product_location_id INT DEFAULT NULL COMMENT 'NULL = phần chưa xếp vị trí',
  system_quantity INT NOT NULL COMMENT 'Số hệ thống lúc đếm (lúc lưu phiếu)',
  counted_quantity INT NOT NULL COMMENT 'Số thực đếm',
  reason_code VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL
    COMMENT 'Bắt buộc khi lệch: COUNT_ERROR / DAMAGED / LOST / FOUND / MISSING_DOCUMENT',
  note VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (count_item_id),
  KEY ix_stock_count_item_count (count_id),
  KEY ix_stock_count_item_detail (detail_id),
  CONSTRAINT fk_stock_count_item_count FOREIGN KEY (count_id) REFERENCES stock_count (count_id),
  CONSTRAINT fk_stock_count_item_detail FOREIGN KEY (detail_id) REFERENCES product_detail (detail_id),
  CONSTRAINT fk_stock_count_item_location FOREIGN KEY (product_location_id) REFERENCES product_location (product_location_id),
  CONSTRAINT ck_stock_count_item_1 CHECK (system_quantity >= 0 AND counted_quantity >= 0),
  CONSTRAINT ck_stock_count_item_2 CHECK (reason_code IS NULL OR reason_code IN ('COUNT_ERROR','DAMAGED','LOST','FOUND','MISSING_DOCUMENT'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Kiểm tra sau khi chạy (kết quả mong đợi: 1, 2, 0):
-- SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='product_detail' AND COLUMN_NAME='min_stock_quantity';
-- SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('stock_count','stock_count_item');
-- SELECT COUNT(*) FROM product_detail WHERE min_stock_quantity IS NOT NULL;
--
-- Hoàn tác (chỉ khi chưa có phiếu kiểm kê nào):
-- DROP TABLE stock_count_item; DROP TABLE stock_count;
-- ALTER TABLE product_detail DROP CHECK ck_product_detail_min_stock;
-- ALTER TABLE product_detail DROP COLUMN min_stock_quantity;
