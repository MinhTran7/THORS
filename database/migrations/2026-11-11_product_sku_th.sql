-- Đổi SKU tự tạo sang dạng TH + 6 chữ số (11/11/2026).
-- ĐÃ CHẠY trên Aiven (11/11/2026): 17 sản phẩm SP-xxxx -> TH000003 … TH000029.
-- Các sản phẩm đang có SKU mặc định SP-xxxx (do 2026-11-10_product_sku.sql gán) -> TH + mã sản phẩm đủ 6 chữ số,
-- vd SP-0012 -> TH000012. SKU người dùng tự đặt (không phải dạng SP-số) giữ nguyên.
-- Mã biến thể (product_detail.barcode) KHÔNG đổi để tem đã in vẫn dùng được.

UPDATE product
SET sku = CONCAT('TH', LPAD(product_id, 6, '0'))
WHERE sku REGEXP '^SP-[0-9]+$';

-- Kiểm tra: không còn SKU dạng SP-, mọi sản phẩm đều có SKU
-- SELECT COUNT(*), SUM(sku IS NULL), SUM(sku LIKE 'SP-%'), MIN(sku), MAX(sku) FROM product;
