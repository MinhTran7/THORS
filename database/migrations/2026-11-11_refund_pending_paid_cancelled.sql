-- Đơn đã thanh toán online rồi bị hủy / từ chối -> "Chờ hoàn tiền" (11/11/2026).
-- ĐÃ CHẠY trên Aiven (11/11/2026): đơn #100 (10.000₫) -> REFUND_PENDING.
-- Chạy lại (11/11/2026): đơn #101 (10.000₫, hủy lúc backend còn bản cũ) -> REFUND_PENDING.
-- Từ nay backend tự chuyển payment_status sang REFUND_PENDING khi hủy / từ chối đơn ONLINE đã PAID,
-- chủ shop chuyển khoản trả lại rồi bấm "Đã hoàn tiền" (REFUNDED). PayOS không hoàn tiền tự động.
-- File này sửa các đơn bị hủy TRƯỚC khi có quy tắc trên (hiện có đơn #100, 10.000₫).

UPDATE orders
SET payment_status = 'REFUND_PENDING'
WHERE order_type = 'Online'
  AND payment_method = 'ONLINE'
  AND payment_status = 'PAID'
  AND order_status IN ('CANCELLED', 'REJECTED');

-- Kiểm tra: không còn đơn đã hủy mà tiền vẫn ở trạng thái "Đã thanh toán"
-- SELECT order_id, order_status, payment_status FROM orders WHERE payment_status = 'PAID' AND order_status IN ('CANCELLED','REJECTED','EXPIRED');
