-- Bắt buộc đổi mật khẩu lần đầu — 18/11/2026
-- CHƯA CHẠY trên database online chung của nhóm.
--
-- Bảng mới `user_password_change_required`: mỗi tài khoản do Admin / Owner tạo (mật khẩu do người tạo
-- đặt) có một dòng ở đây. Người dùng đăng nhập xong sẽ bị chặn mọi API, chỉ được đổi mật khẩu hoặc đăng
-- xuất; đổi mật khẩu thành công thì dòng bị xóa.
--
-- Chỉ thêm bảng mới, không sửa bảng `user`. Chưa chạy script thì mọi thứ chạy như trước (không bắt
-- đổi mật khẩu). Chạy xong thì backend tự nhận ra trong vòng 1 phút, không cần khởi động lại. Tài khoản
-- tạo TRƯỚC khi chạy script sẽ không bị bắt đổi.

CREATE TABLE IF NOT EXISTS `user_password_change_required` (
  `user_id` int NOT NULL COMMENT 'Tài khoản phải đổi mật khẩu ở lần đăng nhập tới',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_user_password_change_required_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Hoàn tác:
-- DROP TABLE user_password_change_required;
