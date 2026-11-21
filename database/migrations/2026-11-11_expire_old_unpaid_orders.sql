-- Đơn chuyển khoản chỉ giữ 10 phút (11/11/2026).
-- ĐÃ CHẠY trên Aiven (11/11/2026 13:03): gán hạn cho 6 đơn #34, #35, #92, #93, #96, #97.
-- Từ nay khi đặt hàng thanh toán online, backend gán payment_expires_at = lúc đặt + 10 phút;
-- OrderScheduler mỗi phút chuyển đơn quá hạn sang EXPIRED và trả lại hàng đang giữ (reserved_quantity).
-- Các đơn chờ thanh toán CŨ chưa có hạn (đặt trước khi có quy tắc này) vẫn đang giữ hàng mãi:
-- gán hạn = lúc đặt + 10 phút. Đơn nào đã quá hạn sẽ bị scheduler hủy trong vòng 1 phút sau khi backend chạy.
-- Không xóa đơn: đơn chuyển sang trạng thái EXPIRED, khách nhận thông báo, lịch sử giữ nguyên.

UPDATE orders
SET payment_expires_at = DATE_ADD(order_date, INTERVAL 10 MINUTE)
WHERE order_type = 'Online'
  AND order_status = 'AWAITING_PAYMENT'
  AND payment_expires_at IS NULL;

-- Kiểm tra: mọi đơn chờ thanh toán đều có hạn
-- SELECT COUNT(*), SUM(payment_expires_at IS NULL) FROM orders WHERE order_status = 'AWAITING_PAYMENT';
