-- Bỏ SKU cấp sản phẩm + đưa mã biến thể về dạng TH (11/11/2026).
-- Mã tự tạo nay nằm ở TỪNG BIẾN THỂ: product_detail.barcode = TH + mã biến thể 6 chữ số (vd TH000058),
-- giống module Kho (WarehouseBarcodes).

-- 1. Biến thể được tạo bằng code cũ (mã dạng SKU-SIZE-MÀU, vd AO-0001-M-DEN, DN-0001-L-DEN) -> TH + mã biến thể.
--    Chỉ đổi mã bắt đầu bằng SKU của chính sản phẩm đó (mã do hệ thống tự sinh, không phải mã người dùng nhập/đã in).
UPDATE product_detail d
JOIN product p ON p.product_id = d.product_id
SET d.barcode = CONCAT('TH', LPAD(d.detail_id, 6, '0'))
WHERE p.sku IS NOT NULL
  AND d.barcode LIKE CONCAT(p.sku, '-%')
  AND d.barcode NOT REGEXP '^TH[0-9]{6}(-[0-9]+)?$';

-- 2. Xóa SKU tự gán cấp sản phẩm:
--    - TH + mã sản phẩm (2026-11-11_product_sku_th.sql) — trùng chữ với mã biến thể (sản phẩm #24 = biến thể #24 = TH000024)
--    - mã theo danh mục của code cũ (vd AO-0001, DN-0001)
UPDATE product
SET sku = NULL
WHERE sku = CONCAT('TH', LPAD(product_id, 6, '0'))
   OR sku REGEXP '^[A-Z]{2,4}-[0-9]{4}$';

-- Kiểm tra: không còn SKU tự gán, mọi mã biến thể đều dạng TH
-- SELECT COUNT(*), SUM(sku IS NULL) FROM product;
-- SELECT detail_id, barcode FROM product_detail WHERE barcode NOT REGEXP '^TH[0-9]{6}(-[0-9]+)?$';
