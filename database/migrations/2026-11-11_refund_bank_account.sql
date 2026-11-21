-- Tài khoản người chuyển + tài khoản nhận hoàn tiền (11/11/2026).
-- ĐÃ CHẠY trên Aiven (11/11/2026): đã thêm 4 cột payment.payer_* và 4 cột orders.refund_*.
-- 1. payment.payer_*: tài khoản khách đã dùng để chuyển khoản, PayOS gửi kèm khi thanh toán thành công
--    (counterAccountBankId / BankName / Number / Name). Có ngân hàng không gửi -> để trống.
-- 2. orders.refund_*: tài khoản nhận tiền hoàn khi đơn đã thanh toán bị hủy / từ chối. Khách xác nhận
--    (điền sẵn từ payment.payer_*) hoặc tự nhập; chủ shop quét mã VietQR tạo từ thông tin này để hoàn tiền.
-- Chỉ thêm cột, không đổi dữ liệu. Backend vẫn chạy khi chưa chạy file này (không lưu / hiện tài khoản hoàn tiền).

ALTER TABLE payment
  ADD COLUMN payer_bank_bin VARCHAR(20) DEFAULT NULL COMMENT 'Mã BIN ngân hàng người chuyển (PayOS counterAccountBankId)',
  ADD COLUMN payer_bank_name VARCHAR(100) DEFAULT NULL COMMENT 'Tên ngân hàng người chuyển',
  ADD COLUMN payer_account_number VARCHAR(50) DEFAULT NULL COMMENT 'Số tài khoản người chuyển',
  ADD COLUMN payer_account_name VARCHAR(100) DEFAULT NULL COMMENT 'Tên chủ tài khoản người chuyển';

ALTER TABLE orders
  ADD COLUMN refund_bank_bin VARCHAR(20) DEFAULT NULL COMMENT 'Mã BIN ngân hàng nhận tiền hoàn',
  ADD COLUMN refund_bank_name VARCHAR(100) DEFAULT NULL COMMENT 'Tên ngân hàng nhận tiền hoàn',
  ADD COLUMN refund_account_number VARCHAR(50) DEFAULT NULL COMMENT 'Số tài khoản nhận tiền hoàn',
  ADD COLUMN refund_account_name VARCHAR(100) DEFAULT NULL COMMENT 'Tên chủ tài khoản nhận tiền hoàn';

-- Kiểm tra
-- SHOW COLUMNS FROM payment LIKE 'payer%';
-- SHOW COLUMNS FROM orders LIKE 'refund%';
