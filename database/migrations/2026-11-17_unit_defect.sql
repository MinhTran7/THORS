-- Hàng lỗi theo từng chiếc — 17/11/2026
-- Chạy SAU 2026-11-16_product_unit.sql. HeidiSQL: chọn database thors_restore rồi chạy cả file (F9). Chỉ chạy một lần.
--
-- KHÔNG tạo bảng mới: lỗi của mỗi chiếc nằm ngay trên dòng của chiếc đó trong product_unit
-- (mỗi chiếc giữ lỗi gần nhất; lịch sử ghi/sửa lỗi nằm trong audit_log).
-- Mẫu lỗi có sẵn: 8 lỗi mặc định trong code + các lỗi chủ cửa hàng đã tự gõ (lấy lại từ dữ liệu đã ghi).
--
-- Báo lỗi KHÔNG làm giảm tồn: chiếc lỗi vẫn trong kho, quầy bán không bán chiếc đó.
-- Tồn chỉ giảm khi chiếc đó được trả nhà cung cấp hoặc chủ cửa hàng bấm "Bỏ hẳn".

-- 0) Nếu đã chạy bản cũ của file này (có 2 bảng defect_type, product_unit_defect) thì xóa đi.
--    Lỗi đã ghi thử bằng bản cũ sẽ mất (chỉ là dữ liệu thử).
DROP TABLE IF EXISTS product_unit_defect;
DROP TABLE IF EXISTS defect_type;

-- 1) Thêm cột lỗi vào product_unit
ALTER TABLE product_unit
  ADD COLUMN defect_status VARCHAR(20) NULL COMMENT 'NULL = chưa từng lỗi · OPEN đang lỗi · FIXED đã sửa · DISCARDED đã bỏ · RETURNED đã trả NCC · SOLD đã bán',
  ADD COLUMN defect_types VARCHAR(500) NULL COMMENT 'Tên các lỗi, cách nhau bởi ", "',
  ADD COLUMN defect_note VARCHAR(500) NULL COMMENT 'Mô tả lỗi',
  ADD COLUMN defect_source VARCHAR(20) NULL COMMENT 'SUPPLIER / WAREHOUSE / CUSTOMER',
  ADD COLUMN defect_photos VARCHAR(1000) NULL COMMENT 'Mã ảnh bằng chứng, cách nhau bởi dấu phẩy',
  ADD COLUMN defect_by INT NULL,
  ADD COLUMN defect_at TIMESTAMP NULL,
  ADD COLUMN defect_resolved_by INT NULL,
  ADD COLUMN defect_resolved_at TIMESTAMP NULL,
  ADD COLUMN defect_resolve_note VARCHAR(255) NULL,
  ADD KEY ix_product_unit_defect (defect_status, detail_id),
  ADD CONSTRAINT ck_product_unit_defect_status
    CHECK (defect_status IS NULL OR defect_status IN ('OPEN','FIXED','DISCARDED','RETURNED','SOLD')),
  ADD CONSTRAINT ck_product_unit_defect_source
    CHECK (defect_source IS NULL OR defect_source IN ('SUPPLIER','WAREHOUSE','CUSTOMER'));

-- Kiểm tra: phải thấy các cột defect_*
SHOW COLUMNS FROM product_unit LIKE 'defect%';

-- Đếm số bảng của database (giới hạn dự án < 30)
SELECT COUNT(*) AS so_bang FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE';

-- Hoàn tác:
-- ALTER TABLE product_unit DROP CHECK ck_product_unit_defect_status, DROP CHECK ck_product_unit_defect_source,
--   DROP KEY ix_product_unit_defect, DROP COLUMN defect_status, DROP COLUMN defect_types, DROP COLUMN defect_note,
--   DROP COLUMN defect_source, DROP COLUMN defect_photos, DROP COLUMN defect_by, DROP COLUMN defect_at,
--   DROP COLUMN defect_resolved_by, DROP COLUMN defect_resolved_at, DROP COLUMN defect_resolve_note;
