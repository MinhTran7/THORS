-- Công nợ & xử lý tiền với nhà cung cấp — bản cuối, khớp database/SQL_v2.sql (05/11/2026)
-- ĐÃ CHẠY trên thors_restore (05/11/2026): kiểm tra 1, 1, 5, 0; số phiếu giữ nguyên 8.
-- Điều kiện: SQL_v2 đã có SUPPLIER_RETURN/APPROVED trong ck_receipt_type, ck_stock_receipt_1,
-- ck_stock_adjustment_1 (migration 2026-11-04). Script này KHÔNG sửa các CHECK đó.
-- Không xóa/sửa dữ liệu cũ. Phiếu nhập cũ giữ paid_before_tracking = NULL (= chưa khai báo đã trả bao nhiêu).
--
-- 1. stock_receipt.paid_before_tracking: số đã thanh toán cho phiếu nhập TRƯỚC khi có theo dõi công nợ.
--      NULL  = chưa khai báo → công nợ "chưa xác định", không mặc định đã trả đủ hay chưa trả.
--      Phiếu nhập xác nhận sau khi nâng cấp được backend đặt 0.
-- 2. Bảng supplier_settlement: mỗi dòng là một khoản tiền/quyết định với NCC; chỉ hủy (voided_*), không xóa.
--      PAYMENT      cửa hàng thanh toán phiếu nhập (nhiều lần)       target_receipt_id + payment_method
--      REFUND       NCC hoàn tiền cho phiếu trả (nhiều lần)          return_id + payment_method
--      DEBT_OFFSET  giá trị trả trừ vào công nợ một phiếu nhập       return_id + target_receipt_id
--      CREDIT_HOLD  NCC giữ tiền để đối trừ sau                      return_id
--      CREDIT_USE   dùng tiền đang giữ trừ công nợ một phiếu nhập    target_receipt_id
--      EXCHANGE     NCC sẽ giao lại hàng cùng màu/size               return_id + return_item_id + quantity
--                   (hàng đổi vào kho qua phiếu nhập có nguồn là phiếu trả, Owner xác nhận như nhập thường)
-- Công nợ phiếu nhập = giá trị − paid_before_tracking − PAYMENT − DEBT_OFFSET − CREDIT_USE (không âm).

ALTER TABLE stock_receipt
  ADD COLUMN paid_before_tracking DECIMAL(12,0) DEFAULT NULL
    COMMENT 'Phiếu nhập: số đã trả NCC trước khi theo dõi công nợ; NULL = chưa khai báo'
    AFTER close_reason;
ALTER TABLE stock_receipt
  ADD CONSTRAINT ck_stock_receipt_paid_before CHECK (paid_before_tracking IS NULL OR paid_before_tracking >= 0);

CREATE TABLE supplier_settlement (
  settlement_id INT NOT NULL AUTO_INCREMENT,
  settlement_type VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL
    COMMENT 'PAYMENT / REFUND / DEBT_OFFSET / CREDIT_HOLD / CREDIT_USE / EXCHANGE',
  supplier_name VARCHAR(200) NOT NULL COMMENT 'Tên NCC theo chuỗi phiếu đặt tại thời điểm ghi',
  return_id INT DEFAULT NULL COMMENT 'Phiếu trả SUPPLIER_RETURN đã xuất trả được xử lý',
  return_item_id INT DEFAULT NULL COMMENT 'EXCHANGE: dòng phiếu trả được đổi',
  target_receipt_id INT DEFAULT NULL COMMENT 'PAYMENT / DEBT_OFFSET / CREDIT_USE: phiếu nhập được giảm công nợ',
  quantity INT DEFAULT NULL COMMENT 'EXCHANGE: số lượng NCC đồng ý giao đổi',
  amount DECIMAL(12,0) NOT NULL COMMENT 'VNĐ; EXCHANGE = quantity x đơn giá trả',
  payment_method VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'PAYMENT/REFUND: CASH / BANK_TRANSFER',
  transaction_date DATE NOT NULL COMMENT 'Ngày thanh toán / nhận tiền / thỏa thuận',
  note VARCHAR(255) DEFAULT NULL,
  created_by INT NOT NULL COMMENT 'Người ghi nhận',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  voided_by INT DEFAULT NULL,
  voided_at DATETIME DEFAULT NULL,
  void_reason VARCHAR(255) DEFAULT NULL,
  request_key VARCHAR(36) NOT NULL COMMENT 'Chống ghi trùng khi bấm lặp/gửi lại',
  PRIMARY KEY (settlement_id),
  UNIQUE KEY uq_supplier_settlement_1 (request_key),
  KEY ix_supplier_settlement_return (return_id),
  KEY ix_supplier_settlement_target (target_receipt_id),
  KEY ix_supplier_settlement_item (return_item_id),
  CONSTRAINT fk_supplier_settlement_return FOREIGN KEY (return_id) REFERENCES stock_receipt (receipt_id),
  CONSTRAINT fk_supplier_settlement_item FOREIGN KEY (return_item_id) REFERENCES stock_receipt_item (receipt_item_id),
  CONSTRAINT fk_supplier_settlement_target FOREIGN KEY (target_receipt_id) REFERENCES stock_receipt (receipt_id),
  CONSTRAINT fk_supplier_settlement_created_by FOREIGN KEY (created_by) REFERENCES `user` (user_id),
  CONSTRAINT fk_supplier_settlement_voided_by FOREIGN KEY (voided_by) REFERENCES `user` (user_id),
  CONSTRAINT ck_supplier_settlement_1 CHECK (settlement_type IN ('PAYMENT','REFUND','DEBT_OFFSET','CREDIT_HOLD','CREDIT_USE','EXCHANGE')),
  CONSTRAINT ck_supplier_settlement_2 CHECK (amount > 0),
  CONSTRAINT ck_supplier_settlement_3 CHECK (payment_method IS NULL OR payment_method IN ('CASH','BANK_TRANSFER')),
  CONSTRAINT ck_supplier_settlement_4 CHECK (
       (settlement_type = 'PAYMENT' AND return_id IS NULL AND target_receipt_id IS NOT NULL AND payment_method IS NOT NULL)
    OR (settlement_type = 'REFUND' AND return_id IS NOT NULL AND target_receipt_id IS NULL AND payment_method IS NOT NULL)
    OR (settlement_type = 'DEBT_OFFSET' AND return_id IS NOT NULL AND target_receipt_id IS NOT NULL)
    OR (settlement_type = 'CREDIT_HOLD' AND return_id IS NOT NULL AND target_receipt_id IS NULL)
    OR (settlement_type = 'CREDIT_USE' AND return_id IS NULL AND target_receipt_id IS NOT NULL)
    OR (settlement_type = 'EXCHANGE' AND return_id IS NOT NULL AND return_item_id IS NOT NULL
        AND quantity IS NOT NULL AND quantity > 0 AND target_receipt_id IS NULL)),
  CONSTRAINT ck_supplier_settlement_5 CHECK ((voided_at IS NULL) = (voided_by IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Kiểm tra sau khi chạy:
-- SHOW CREATE TABLE supplier_settlement;
-- SELECT COLUMN_NAME, IS_NULLABLE FROM information_schema.COLUMNS
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_receipt' AND COLUMN_NAME = 'paid_before_tracking';
-- SELECT COUNT(*) FROM stock_receipt WHERE paid_before_tracking IS NOT NULL;   -- phải = 0 ngay sau khi chạy
--
-- Hoàn tác (chỉ khi chưa ghi nhận khoản nào):
-- DROP TABLE supplier_settlement;
-- ALTER TABLE stock_receipt DROP CHECK ck_stock_receipt_paid_before;
-- ALTER TABLE stock_receipt DROP COLUMN paid_before_tracking;
