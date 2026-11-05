-- Trả hàng nhà cung cấp (SUPPLIER_RETURN) — 04/11/2026
-- CHƯA CHẠY trên database nào. Sao lưu DB và chạy thử trên bản sao trước.
-- Kiểm tra tên constraint thật bằng SHOW CREATE TABLE trước khi chạy (tên dưới đây theo database/SQL_v1.sql).
--
-- Không thêm bảng/cột. Chỉ mở rộng 3 CHECK:
--   1. stock_receipt.receipt_type      + 'SUPPLIER_RETURN'  (phiếu trả liên kết phiếu nhập qua source_receipt_id)
--   2. stock_receipt.status            + 'APPROVED'         (phiếu trả đã được Owner duyệt, chờ xuất trả; chưa trừ tồn)
--   3. stock_adjustment.movement_type  + 'SUPPLIER_RETURN'  (lịch sử kho khi xuất trả, receipt_item_id = dòng phiếu trả)
--
-- Ý nghĩa trạng thái của phiếu trả:
--   DRAFT = Nháp · PENDING_CONFIRMATION = Chờ duyệt · APPROVED = Chờ xuất trả · CONFIRMED = Đã xuất trả
--   REJECTED / CANCELLED như các phiếu khác. confirmed_by/confirmed_at = người/thời điểm duyệt;
--   thời điểm và người xuất trả lấy từ stock_adjustment (movement_type = 'SUPPLIER_RETURN').
-- Trước khi chạy script, code vẫn biên dịch/chạy nhưng tạo phiếu trả sẽ bị CHECK từ chối (TASK-03).

-- Tên constraint đã đối chiếu với DB thật qua information_schema (04/11/2026).
-- DROP và ADD tách riêng: MySQL có thể báo trùng tên nếu gộp trong một ALTER.
ALTER TABLE stock_receipt DROP CHECK ck_receipt_type;
ALTER TABLE stock_receipt ADD CONSTRAINT ck_receipt_type
  CHECK (receipt_type IN ('PURCHASE_ORDER','RECEIPT','SUPPLIER_RETURN'));

ALTER TABLE stock_receipt DROP CHECK ck_stock_receipt_1;
ALTER TABLE stock_receipt ADD CONSTRAINT ck_stock_receipt_1
  CHECK (status IN ('DRAFT','PENDING_CONFIRMATION','APPROVED','CONFIRMED','REJECTED','CANCELLED','CLOSED'));

ALTER TABLE stock_adjustment DROP CHECK ck_stock_adjustment_1;
ALTER TABLE stock_adjustment ADD CONSTRAINT ck_stock_adjustment_1
  CHECK (movement_type IN ('ADJUSTMENT','RECEIPT','ORDER_OUT','MOVE','RESTOCK','SUPPLIER_RETURN'));

-- Hoàn tác (chỉ chạy được khi không còn dòng dùng giá trị mới):
-- ALTER TABLE stock_adjustment DROP CHECK ck_stock_adjustment_1, ADD CONSTRAINT ck_stock_adjustment_1 CHECK (movement_type IN ('ADJUSTMENT','RECEIPT','ORDER_OUT','MOVE','RESTOCK'));
-- ALTER TABLE stock_receipt DROP CHECK ck_stock_receipt_1, ADD CONSTRAINT ck_stock_receipt_1 CHECK (status IN ('DRAFT','PENDING_CONFIRMATION','CONFIRMED','REJECTED','CANCELLED','CLOSED'));
-- ALTER TABLE stock_receipt DROP CHECK ck_receipt_type, ADD CONSTRAINT ck_receipt_type CHECK (receipt_type IN ('PURCHASE_ORDER','RECEIPT'));
