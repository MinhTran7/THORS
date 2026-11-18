-- Nhận hàng bằng quét tem — 15/11/2026
-- ĐÃ CHẠY trên thors_restore (Aiven) ngày 17/11/2026. Database khác: chạy một lần (kiểm tra bằng
-- SHOW COLUMNS FROM stock_receipt_item LIKE '%_quantity'; nếu đã có scanned_quantity thì bỏ qua).
--
-- Quy trình mới của phiếu nhập (RECEIPT):
--   DRAFT/PENDING_CONFIRMATION --(chủ cửa hàng xác nhận)--> APPROVED = "Chờ kiểm hàng" (tồn CHƯA tăng)
--   --(in tem, quét tem đã dán lên từng sản phẩm)--> "Chốt nhận hàng" --> CONFIRMED (tồn tăng đúng số đã quét)
-- APPROVED đã có trong ck_stock_receipt_1 (migration 2026-11-04) nên không phải sửa CHECK.
--
-- Chỉ thêm cột, không đổi dữ liệu cũ:
--   stock_receipt_item.scanned_quantity  số đã quét khi kiểm hàng (0 với phiếu cũ)
--   stock_receipt_item.expected_quantity số trên phiếu lúc chốt; quantity = số thực nhận (đã quét)
--   stock_receipt.receive_note           lý do chênh lệch giữa số trên phiếu và số đã quét

ALTER TABLE stock_receipt_item ADD COLUMN scanned_quantity INT NOT NULL DEFAULT 0;
ALTER TABLE stock_receipt_item ADD COLUMN expected_quantity INT NULL;
ALTER TABLE stock_receipt ADD COLUMN receive_note VARCHAR(255) NULL;

-- Hoàn tác:
-- ALTER TABLE stock_receipt DROP COLUMN receive_note;
-- ALTER TABLE stock_receipt_item DROP COLUMN expected_quantity;
-- ALTER TABLE stock_receipt_item DROP COLUMN scanned_quantity;
