// Tủ đồ 3D trên trang Số đo: áo dựng sẵn trên đúng người mẫu (cùng toạ độ, cùng các núm co giãn
// Height/Weight/Bust/Waist/Hips... + núm Size_up / Size_down), nên chỉ cần đặt vào cùng chỗ và vặn núm như cơ thể.
// File gốc: mannequin_web/*.glb (Blender), đã nén meshopt vào public/models/garments.
// File này không import three -> trang Số đo đọc danh sách mà không phải tải thư viện 3D.

/** fabric = tên vật liệu vải trong .glb (được đổi màu); vật liệu khác (cúc áo) giữ nguyên. */
export const WARDROBE = {
  FEMALE: [
    { id: 'blouse', label: 'Áo blouse', url: '/models/garments/blouse-female.glb', fabric: 'ShirtMint', color: '#94BD94' },
    { id: 'fleece', label: 'Áo nỉ dài tay', url: '/models/garments/fleece-female.glb', fabric: 'Fleece', color: '#F2F0EC' }
  ],
  MALE: [{ id: 'cuban', label: 'Sơ mi cổ Cuba', url: '/models/garments/cuban-male.glb', fabric: 'LinenNavy', color: '#22273C' }]
};

/**
 * Size áo -> núm Size_up / Size_down. Áo gốc dựng ở cỡ M.
 * Đo trên file: Size_up = 1 rộng thêm ~7-10 cm vòng ngực, Size_down = 1 nhỏ đi ~3-5 cm.
 */
export const GARMENT_SIZES = {
  S: { Size_down: 1 },
  M: {},
  L: { Size_up: 0.5 },
  XL: { Size_up: 1 }
};

/** Màu vải có thể chọn (ngoài màu gốc của áo). */
export const FABRIC_COLORS = [
  ['#F5F3EE', 'Trắng'],
  ['#222326', 'Đen'],
  ['#D8C3A5', 'Be'],
  ['#1F2A44', 'Xanh navy'],
  ['#8FA8C8', 'Xanh nhạt'],
  ['#E8A9B8', 'Hồng'],
  ['#9B2C2C', 'Đỏ đô']
];
