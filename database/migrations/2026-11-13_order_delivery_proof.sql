-- Minh chứng giao hàng — 13/11/2026
-- CHƯA CHẠY trên database online chung của nhóm.
--
-- Bảng mới `order_delivery_proof`: mỗi đơn online được chủ shop bấm "Xác nhận đã giao" có một dòng, gồm
-- 1–3 ảnh lúc giao (lưu trên Cloudinary) và ghi chú tùy chọn. Đơn gửi GHN không cần dòng này vì GHN tự
-- báo đã giao.
--
-- Chỉ thêm bảng mới, không sửa bảng cũ. Chưa chạy script thì mọi chức năng vẫn chạy như trước: chủ shop
-- bấm "Xác nhận đã giao" không cần ảnh. Chạy xong thì backend tự nhận ra trong vòng 1 phút (không cần
-- khởi động lại) và từ đó bắt buộc có ảnh minh chứng.

CREATE TABLE IF NOT EXISTS `order_delivery_proof` (
  `order_id` int NOT NULL COMMENT 'Đơn online đã giao',
  `image_urls` text NOT NULL COMMENT 'URL ảnh Cloudinary, mỗi dòng một ảnh (1–3 ảnh)',
  `note` varchar(255) DEFAULT NULL COMMENT 'Ghi chú của người giao, ví dụ: gửi bảo vệ tòa nhà',
  `created_by` int NOT NULL COMMENT 'Người bấm xác nhận đã giao',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`order_id`),
  CONSTRAINT `fk_order_delivery_proof_order_id` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`),
  CONSTRAINT `fk_order_delivery_proof_created_by` FOREIGN KEY (`created_by`) REFERENCES `user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Hoàn tác:
-- DROP TABLE order_delivery_proof;
