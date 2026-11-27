-- Lưu Facebook PSID vào đơn hàng chốt từ Facebook POS để tự động nhắn tin Messenger khi chủ shop
-- xác nhận, từ chối, giao hàng, hoàn tiền (chỉ áp dụng best-effort, lỗi gửi tin không làm hỏng đơn).
ALTER TABLE orders
    ADD COLUMN facebook_psid VARCHAR(64) NULL AFTER delivery_lng;
