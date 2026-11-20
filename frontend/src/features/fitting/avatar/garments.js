/**
 * Áo 3D đã "mặc" sẵn lên người mẫu (dùng để mặc thử trên hình 3D).
 *
 * Cách tạo một áo mới:
 * 1. Tạo file .glb của áo từ ảnh sản phẩm (vd Hunyuan3D / hy3d.tencent.ai).
 * 2. scripts/avatar-optimize: chạy garment-fit.py bằng Blender (xem README trong package.json) để đặt áo lên đúng
 *    người mẫu và tạo núm co giãn theo số đo, rồi `node garment.mjs` để nén.
 * 3. Thêm một dòng vào danh sách dưới đây.
 *
 * url: đường dẫn trong public/ (không có đuôi .glb). gender: người mẫu mà áo được mặc lên.
 */
export const GARMENTS = [{ id: 'cardigan', name: 'Áo len cardigan', gender: 'FEMALE', url: '/models/garments/cardigan-female' }];

export const garmentsFor = (gender) => GARMENTS.filter((g) => g.gender === gender);
