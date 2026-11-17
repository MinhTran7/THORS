-- Hồ sơ số đo cơ thể của khách (14/11/2026) - Phase 1 tính năng "Thử đồ ảo & gợi ý size".
-- ĐÃ CHẠY trên thors_restore (14/11/2026): đã tạo bảng body_profile (9 cột).
-- Quan hệ 1-1 với user: user_id vừa là khóa chính vừa là khóa ngoại -> mỗi khách tối đa 1 hồ sơ.
-- Tách bảng riêng (không thêm cột vào user) để module độc lập, khách xóa số đo không ảnh hưởng tài khoản.
-- chest/waist/hip cho phép NULL: nhiều khách không biết số đo vòng; gợi ý size chỉ dùng số đo có sẵn.
-- Chỉ thêm bảng mới, không đổi dữ liệu cũ. Xóa user -> xóa luôn hồ sơ số đo (ON DELETE CASCADE).

CREATE TABLE body_profile (
  user_id        INT          NOT NULL,
  gender         VARCHAR(10)  NOT NULL COMMENT 'MALE | FEMALE (chọn dáng avatar nam/nữ)',
  height_cm      DECIMAL(4,1) NOT NULL COMMENT 'Chiều cao (cm), 120-220',
  weight_kg      DECIMAL(4,1) NOT NULL COMMENT 'Cân nặng (kg), 30-200',
  chest_cm       DECIMAL(4,1) DEFAULT NULL COMMENT 'Vòng ngực (cm), 60-150',
  waist_cm       DECIMAL(4,1) DEFAULT NULL COMMENT 'Vòng eo (cm), 50-150',
  hip_cm         DECIMAL(4,1) DEFAULT NULL COMMENT 'Vòng hông (cm), 60-160',
  fit_preference VARCHAR(10)  NOT NULL DEFAULT 'REGULAR' COMMENT 'SLIM | REGULAR | LOOSE (thích mặc ôm / vừa / rộng)',
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_body_profile_user FOREIGN KEY (user_id) REFERENCES `user` (user_id) ON DELETE CASCADE,
  CONSTRAINT ck_body_profile_gender CHECK (gender IN ('MALE', 'FEMALE')),
  CONSTRAINT ck_body_profile_fit CHECK (fit_preference IN ('SLIM', 'REGULAR', 'LOOSE'))
);

-- Kiểm tra
-- SHOW CREATE TABLE body_profile;
