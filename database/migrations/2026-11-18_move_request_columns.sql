-- Yêu cầu xếp kệ / chuyển kệ của Thành viên gia đình chờ chủ cửa hàng xác nhận — 18/11/2026.
-- KHÔNG tạo bảng mới: chỉ THÊM CỘT vào stock_adjustment, không sửa/xóa dữ liệu cũ.
-- Chạy một lần sau SQL_v3.sql (kiểm tra: SHOW COLUMNS FROM stock_adjustment LIKE 'request_status'; đã có thì bỏ qua).
--
-- Một yêu cầu = một dòng stock_adjustment loại MOVE với quantity_change = 0 (tổng tồn không đổi). Cột có sẵn được dùng lại:
--   detail_id, movement_quantity = số lượng, source_location_id = vị trí nguồn (NULL = hàng chưa xếp),
--   adjusted_by / adjusted_at = người gửi / lúc gửi, reason = lý do khi bị từ chối,
--   idempotency_key = 'movereq:<mã chống gửi trùng>' (thẻ kho bỏ qua các dòng này).
-- Chủ cửa hàng xác nhận → ghi dòng MOVE thật như khi chủ tự xếp (idempotency_key = 'move:<mã>').
-- Mọi dòng cũ có request_status = NULL nên không bị ảnh hưởng.

ALTER TABLE stock_adjustment
  ADD COLUMN request_status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL
    COMMENT 'NULL = biến động kho thật · PENDING / APPROVED / REJECTED / CANCELLED = yêu cầu xếp/chuyển kệ',
  ADD COLUMN request_shelf_id INT DEFAULT NULL COMMENT 'Yêu cầu: tầng đích; NULL = đưa về phần chưa xếp',
  ADD COLUMN request_note VARCHAR(2000) DEFAULT NULL COMMENT 'Yêu cầu: mô tả vị trí',
  ADD COLUMN request_photo_keys VARCHAR(400) DEFAULT NULL COMMENT 'Yêu cầu: mã ảnh thực tế tại vị trí, cách nhau bởi dấu phẩy',
  ADD COLUMN decided_by INT DEFAULT NULL COMMENT 'Yêu cầu: người xác nhận / từ chối / tự hủy',
  ADD COLUMN decided_at DATETIME DEFAULT NULL COMMENT 'Yêu cầu: lúc xác nhận / từ chối / tự hủy',
  ADD KEY ix_stock_adjustment_request (request_status),
  ADD CONSTRAINT fk_stock_adjustment_request_shelf FOREIGN KEY (request_shelf_id) REFERENCES shelf_level (shelf_level_id),
  ADD CONSTRAINT fk_stock_adjustment_decided_by FOREIGN KEY (decided_by) REFERENCES `user` (user_id),
  ADD CONSTRAINT ck_stock_adjustment_request CHECK (
    request_status IS NULL OR (request_status IN ('PENDING','APPROVED','REJECTED','CANCELLED') AND movement_type = 'MOVE'));
