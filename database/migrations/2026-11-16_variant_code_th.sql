-- Thống nhất mã biến thể (mã vạch) về một dạng — 16/11/2026
-- CHƯA CHẠY trên database nào. Sao lưu DB và chạy thử trên bản sao trước.
--
-- Mã thống nhất của module Kho:
--   Mã sản phẩm : SP + 5 số mã sản phẩm   (vd SP00024) — chỉ hiển thị, không lưu cột
--   Mã biến thể : TH + 6 số mã biến thể   (vd TH000051) — cột product_detail.barcode
--
-- File này đổi các mã biến thể KHÁC dạng TH (vd GN-0001-42-DEN tạo từ trang Thêm sản phẩm)
-- sang TH + mã biến thể. Mã đã đúng dạng TH (kể cả có hậu tố, vd TH000123-1) và mã đang trống giữ nguyên;
-- mã trống được tạo bằng nút "Tạo mã" ở trang Tồn kho.
-- Tồn kho, đơn hàng, lịch sử không bị ảnh hưởng (liên kết bằng detail_id, không bằng mã).
-- TEM ĐÃ IN với mã cũ sẽ không quét được nữa: in lại tem các biến thể này ở trang Tồn kho.

-- 0. Xem trước các mã sẽ bị đổi (chạy riêng câu này để kiểm tra)
SELECT detail_id, barcode AS ma_cu,
       CONCAT('TH', LPAD(detail_id, GREATEST(6, CHAR_LENGTH(detail_id)), '0')) AS ma_moi
FROM product_detail
WHERE barcode IS NOT NULL AND barcode <> ''
  AND NOT REGEXP_LIKE(barcode, '^TH[0-9]{6,}(-[0-9]+)?$', 'c')
ORDER BY detail_id;

-- 1. Lưu mã cũ để hoàn tác được (CREATE TABLE đặt ngoài transaction vì MySQL tự COMMIT khi gặp DDL)
CREATE TABLE IF NOT EXISTS product_detail_barcode_backup_20261116 (
  detail_id INT PRIMARY KEY,
  old_barcode VARCHAR(32) NOT NULL
);

START TRANSACTION;

INSERT IGNORE INTO product_detail_barcode_backup_20261116 (detail_id, old_barcode)
SELECT detail_id, barcode
FROM product_detail
WHERE barcode IS NOT NULL AND barcode <> ''
  AND NOT REGEXP_LIKE(barcode, '^TH[0-9]{6,}(-[0-9]+)?$', 'c');

-- 2. Đổi sang TH + mã biến thể, khi mã đó chưa bị biến thể khác dùng
--    (bảng tạm `used` có DISTINCT để MySQL không báo lỗi 1093 khi cập nhật chính bảng đang đọc)
UPDATE product_detail d
LEFT JOIN (SELECT DISTINCT barcode FROM product_detail WHERE barcode IS NOT NULL) used
  ON used.barcode = CONCAT('TH', LPAD(d.detail_id, GREATEST(6, CHAR_LENGTH(d.detail_id)), '0'))
SET d.barcode = CONCAT('TH', LPAD(d.detail_id, GREATEST(6, CHAR_LENGTH(d.detail_id)), '0'))
WHERE d.barcode IS NOT NULL AND d.barcode <> ''
  AND NOT REGEXP_LIKE(d.barcode, '^TH[0-9]{6,}(-[0-9]+)?$', 'c')
  AND used.barcode IS NULL;

-- 3. Hiếm: mã TH đó đã bị nhập tay cho biến thể khác -> thêm hậu tố "-1" (giống nút "Tạo mã")
UPDATE product_detail d
LEFT JOIN (SELECT DISTINCT barcode FROM product_detail WHERE barcode IS NOT NULL) used
  ON used.barcode = CONCAT('TH', LPAD(d.detail_id, GREATEST(6, CHAR_LENGTH(d.detail_id)), '0'), '-1')
SET d.barcode = CONCAT('TH', LPAD(d.detail_id, GREATEST(6, CHAR_LENGTH(d.detail_id)), '0'), '-1')
WHERE d.barcode IS NOT NULL AND d.barcode <> ''
  AND NOT REGEXP_LIKE(d.barcode, '^TH[0-9]{6,}(-[0-9]+)?$', 'c')
  AND used.barcode IS NULL;

COMMIT;

-- Kiểm tra: phải trả về 0 dòng (mọi mã đều dạng TH). Còn dòng nào thì sửa tay mã đó ở trang Sản phẩm.
-- SELECT detail_id, barcode FROM product_detail
-- WHERE barcode IS NOT NULL AND barcode <> ''
--   AND NOT REGEXP_LIKE(barcode, '^TH[0-9]{6,}(-[0-9]+)?$', 'c');

-- Hoàn tác (trả lại mã cũ):
-- UPDATE product_detail d JOIN product_detail_barcode_backup_20261116 b ON b.detail_id = d.detail_id
-- SET d.barcode = b.old_barcode;
-- Khi đã ổn, xóa bảng sao lưu:
-- DROP TABLE product_detail_barcode_backup_20261116;
