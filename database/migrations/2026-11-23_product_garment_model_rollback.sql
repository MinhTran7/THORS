-- Gỡ bỏ tính năng mô hình 3D quần áo (Phòng thử đồ) - đảo ngược 2026-11-23_product_garment_model.sql.
-- Không bảng nào khác tham chiếu tới bảng này nên xóa không ảnh hưởng dữ liệu khác.
-- Sau khi chạy: xóa thư mục thors/garments trên Cloudinary (file GLB không còn được dùng).
DROP TABLE IF EXISTS product_garment_model;
