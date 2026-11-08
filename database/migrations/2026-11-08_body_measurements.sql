-- Gợi ý size thông minh — 08/11/2026
-- ĐÃ CHẠY trên database online chung của nhóm (08/11/2026, kiểm tra: đủ 4 cột mới + 1 bảng mới).
-- KHÔNG chạy lại trên DB online. Chỉ chạy khi dựng database mới từ database/SQL_v2.sql.
--
-- 1. Bảng `user`: số đo cơ thể và kiểu mặc ưa thích của khách (tất cả tùy chọn, NULL = chưa nhập)
--      height_cm       chiều cao (cm), 100–220
--      weight_kg       cân nặng (kg), 30–150
--      foot_length_mm  chiều dài bàn chân (mm), 150–320 — để gợi ý size giày dép
--      fit_preference  SNUG (ôm) / REGULAR (vừa) / LOOSE (rộng)
-- 2. Bảng mới `order_item_fit_feedback`: khách đánh giá Chật / Vừa / Rộng cho từng món đã nhận.
--      Lưu kèm số đo của khách lúc đánh giá để thống kê "khách có số đo giống bạn".
--
-- Chỉ module sizeadvice và API /api/accounts/profile/body-measurements dùng các cột/bảng này; chưa chạy
-- script thì đăng nhập, hồ sơ, đơn hàng... vẫn hoạt động bình thường, chỉ phần gợi ý size báo lỗi.

ALTER TABLE `user`
  ADD COLUMN `height_cm` smallint DEFAULT NULL COMMENT 'Chiều cao (cm), dùng để gợi ý size',
  ADD COLUMN `weight_kg` smallint DEFAULT NULL COMMENT 'Cân nặng (kg), dùng để gợi ý size',
  ADD COLUMN `foot_length_mm` smallint DEFAULT NULL COMMENT 'Chiều dài bàn chân (mm), dùng để gợi ý size giày',
  ADD COLUMN `fit_preference` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'SNUG / REGULAR / LOOSE',
  ADD CONSTRAINT `ck_user_height` CHECK (`height_cm` IS NULL OR `height_cm` BETWEEN 100 AND 220),
  ADD CONSTRAINT `ck_user_weight` CHECK (`weight_kg` IS NULL OR `weight_kg` BETWEEN 30 AND 150),
  ADD CONSTRAINT `ck_user_foot` CHECK (`foot_length_mm` IS NULL OR `foot_length_mm` BETWEEN 150 AND 320),
  ADD CONSTRAINT `ck_user_fit_preference` CHECK (`fit_preference` IS NULL OR `fit_preference` IN ('SNUG','REGULAR','LOOSE'));

CREATE TABLE IF NOT EXISTS `order_item_fit_feedback` (
  `order_item_id` int NOT NULL COMMENT 'Mỗi dòng đơn một đánh giá; đánh giá lại thì ghi đè',
  `user_id` int NOT NULL COMMENT 'Khách đánh giá (chủ đơn)',
  `fit` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'TIGHT (chật) / TRUE (vừa) / LOOSE (rộng)',
  `height_cm` smallint DEFAULT NULL COMMENT 'Số đo của khách lúc đánh giá',
  `weight_kg` smallint DEFAULT NULL,
  `foot_length_mm` smallint DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`order_item_id`),
  KEY `fk_fit_feedback_user_id` (`user_id`),
  CONSTRAINT `fk_fit_feedback_order_item_id` FOREIGN KEY (`order_item_id`) REFERENCES `order_item` (`order_item_id`),
  CONSTRAINT `fk_fit_feedback_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`),
  CONSTRAINT `ck_fit_feedback_fit` CHECK (`fit` IN ('TIGHT','TRUE','LOOSE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Hoàn tác:
-- DROP TABLE order_item_fit_feedback;
-- ALTER TABLE `user` DROP CHECK ck_user_height, DROP CHECK ck_user_weight, DROP CHECK ck_user_foot,
--   DROP CHECK ck_user_fit_preference, DROP COLUMN height_cm, DROP COLUMN weight_kg,
--   DROP COLUMN foot_length_mm, DROP COLUMN fit_preference;
