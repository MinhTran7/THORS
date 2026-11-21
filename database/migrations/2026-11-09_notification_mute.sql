-- Bật / tắt nhận thông báo khuyến mãi — 09/11/2026
-- CHƯA CHẠY trên database online chung của nhóm.
--
-- Bảng mới `notification_mute`: mỗi dòng = một người dùng đã TẮT một loại thông báo.
-- Không có dòng = vẫn nhận (mặc định ai cũng nhận). Hiện chỉ cho tắt loại PROMOTION; thông báo đơn hàng
-- và bảo mật tài khoản luôn được gửi.
--
-- Chỉ thêm bảng mới, không sửa bảng cũ. Chưa chạy script thì mọi chức năng vẫn chạy bình thường:
-- khuyến mãi vẫn gửi cho mọi khách, chỉ có công tắc "Nhận thông báo khuyến mãi" bị ẩn. Chạy xong thì
-- backend tự nhận ra trong vòng 1 phút, không cần khởi động lại.

CREATE TABLE IF NOT EXISTS `notification_mute` (
  `user_id` int NOT NULL COMMENT 'Người dùng đã tắt loại thông báo này',
  `type` varchar(30) NOT NULL COMMENT 'Giá trị notification.type bị tắt, hiện chỉ có PROMOTION',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `type`),
  CONSTRAINT `fk_notification_mute_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Hoàn tác:
-- DROP TABLE notification_mute;
