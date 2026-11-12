-- Mã sản phẩm (SKU) cấp sản phẩm (10/11/2026).
-- ĐÃ CHẠY trên Aiven (11/11/2026): 17 sản phẩm đều có SKU dạng SP-xxxx (SP-0003 … SP-0029).
-- Mã biến thể dùng lại cột product_detail.barcode có sẵn: sản phẩm mới tự tạo SKU-SIZE-MÀU (vd GN-0001-42-DEN).
-- Không xóa/sửa dữ liệu cũ ngoài việc gán SKU cho sản phẩm hiện có; mã vạch (barcode) đã có giữ nguyên.
-- Backend vẫn chạy được khi CHƯA chạy file này (chỉ không có SKU).

-- 1. Cột SKU: chữ in hoa, số, dấu "-", tối đa 30 ký tự, không trùng
ALTER TABLE product
  ADD COLUMN sku VARCHAR(30) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL
    COMMENT 'Mã sản phẩm (SKU). Để trống khi tạo => tự tạo theo danh mục, vd GN-0001'
    AFTER product_id;
ALTER TABLE product
  ADD UNIQUE KEY uq_product_sku (sku);

-- 2. Sản phẩm hiện có: SP-<mã sản phẩm>, vd SP-0012 (sửa lại được ở trang Chỉnh sửa sản phẩm)
UPDATE product SET sku = CONCAT('SP-', LPAD(product_id, 4, '0')) WHERE sku IS NULL;

-- Kiểm tra: mọi sản phẩm đều có SKU
-- SELECT COUNT(*), SUM(sku IS NULL) FROM product;
