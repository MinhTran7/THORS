-- Bỏ cấp Quận/Huyện khỏi địa chỉ giao hàng (địa giới sau sáp nhập 07/2025 chỉ còn Tỉnh > Phường/Xã).
-- Code không còn đọc/ghi 2 cột này. Mã quận GHN của đơn vẫn nằm ở orders.delivery_district_id (giữ nguyên).

ALTER TABLE shipping_address
  DROP COLUMN district_code,
  DROP COLUMN district_name;
