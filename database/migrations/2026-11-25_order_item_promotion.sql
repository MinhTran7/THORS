-- Ghi giá gốc và khuyến mãi sản phẩm đã áp dụng cho từng dòng hàng — 25/11/2026
-- Phải chạy TRƯỚC khi chạy backend mới. Đơn cũ để trống 2 cột (không còn dữ liệu để điền lại).
--
-- unit_price     : giá sau khuyến mãi sản phẩm (giữ như cũ, thành tiền = quantity × unit_price)
-- original_price : giá gốc lúc mua
-- promotion_id   : khuyến mãi sản phẩm đã áp dụng cho dòng hàng (NULL nếu không có)

ALTER TABLE order_item
  ADD COLUMN original_price DECIMAL(12,0) NULL COMMENT 'Giá gốc lúc mua; NULL với đơn cũ' AFTER unit_price,
  ADD COLUMN promotion_id INT NULL COMMENT 'Khuyến mãi sản phẩm đã áp dụng cho dòng hàng' AFTER original_price,
  ADD KEY idx_order_item_promotion (promotion_id),
  ADD CONSTRAINT fk_order_item_promotion FOREIGN KEY (promotion_id) REFERENCES promotion (promotion_id),
  ADD CONSTRAINT ck_order_item_original_price CHECK (original_price IS NULL OR original_price >= unit_price);

-- Kiểm tra:
-- SHOW CREATE TABLE order_item;

-- Hoàn tác:
-- ALTER TABLE order_item DROP FOREIGN KEY fk_order_item_promotion, DROP CHECK ck_order_item_original_price,
--   DROP INDEX idx_order_item_promotion, DROP COLUMN promotion_id, DROP COLUMN original_price;
