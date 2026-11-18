-- Size giày theo chiều dài bàn chân (17/11/2026) - mở rộng "Gợi ý size" cho giày dép.
-- ĐÃ CHẠY trên thors_restore (17/11/2026): đã thêm product_size_chart.foot_min/foot_max và body_profile.foot_length_cm.
-- 1. product_size_chart.foot_min / foot_max: khoảng chiều dài bàn chân (cm) phù hợp với mỗi size giày.
-- 2. body_profile.foot_length_cm: chiều dài bàn chân của khách (không bắt buộc).
-- Chỉ thêm cột (cho phép NULL), không đổi dữ liệu cũ. Backend tự nhận biết khi chưa chạy file này
-- (khi đó chưa lưu được chiều dài bàn chân, các phần khác vẫn chạy).

ALTER TABLE product_size_chart
  ADD COLUMN foot_min DECIMAL(4,1) DEFAULT NULL COMMENT 'Chiều dài bàn chân phù hợp (cm) - size giày' AFTER hip_max,
  ADD COLUMN foot_max DECIMAL(4,1) DEFAULT NULL AFTER foot_min;

ALTER TABLE body_profile
  ADD COLUMN foot_length_cm DECIMAL(4,1) DEFAULT NULL COMMENT 'Chiều dài bàn chân (cm), 9-35' AFTER hip_cm;

-- Kiểm tra
-- SHOW COLUMNS FROM product_size_chart LIKE 'foot%';
-- SHOW COLUMNS FROM body_profile LIKE 'foot%';
