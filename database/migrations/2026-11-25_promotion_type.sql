-- Loại khuyến mãi tách thành cột riêng — 25/11/2026
-- CHƯA CHẠY trên database online chung của nhóm. Phải chạy TRƯỚC khi chạy backend mới.
--
-- PRODUCT_DISCOUNT: khuyến mãi sản phẩm (tự áp vào giá, mọi kênh)
-- ORDER_VOUCHER   : mã giảm giá online (khách chọn khi đặt đơn, có đơn tối thiểu)
-- Dữ liệu cũ được điền theo quy tắc trước đây: min_order_value > 0 là mã giảm giá online.

ALTER TABLE promotion
  ADD COLUMN promotion_type VARCHAR(20) NOT NULL DEFAULT 'PRODUCT_DISCOUNT'
    COMMENT 'PRODUCT_DISCOUNT: khuyến mãi sản phẩm; ORDER_VOUCHER: mã giảm giá online'
    AFTER promotion_id;

UPDATE promotion SET promotion_type = 'ORDER_VOUCHER' WHERE min_order_value > 0;

ALTER TABLE promotion
  ADD CONSTRAINT ck_promotion_type CHECK (promotion_type IN ('PRODUCT_DISCOUNT', 'ORDER_VOUCHER')),
  ADD KEY idx_promotion_running (promotion_type, status, start_date, end_date);

-- Kiểm tra:
-- SELECT promotion_type, COUNT(*) FROM promotion GROUP BY promotion_type;

-- Hoàn tác:
-- ALTER TABLE promotion DROP INDEX idx_promotion_running, DROP CHECK ck_promotion_type, DROP COLUMN promotion_type;
