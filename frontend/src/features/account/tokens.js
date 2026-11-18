// Màu và kích thước theo thiết kế của BA cho feature Profile & Account Management.
// Khi nhóm thống nhất theme chung thì chuyển các giá trị này vào src/themes/palette.js.
// Đồng bộ với màn khách hàng (features/shop/storeTheme.jsx): tông trầm — chữ đen, nhấn đỏ đô, nền be.
// Giữ tên cũ (cyan, teal, pink...) vì nhiều màn đang dùng, nhưng giá trị đã đổi sang tông trầm tương ứng:
//   cyan = nền nút chính / mục đang chọn (đen), inkOnCyan = chữ trên nền đó (trắng), teal/pink = màu nhấn (đỏ đô).
export const brand = {
  cyan: '#111111',
  cyanHover: '#2B2B2B',
  cyanSoft: '#EFEBE5',
  teal: '#8A2B2B',
  pink: '#8A2B2B',
  ink: '#111111',
  inkOnCyan: '#FFFFFF',
  muted: '#5C5650',
  line: '#E6E3DE',
  cardLine: '#E6E3DE',
  page: '#F7F5F2',
  surface: '#FFFFFF',
  yellowSoft: '#F6F1E8',
  yellowLine: '#E6DCC8',
  yellowChip: '#EFE4CF',
  yellowInk: '#6B4E16',
  successBg: '#E5F6EC',
  successInk: '#1B7A43',
  warningBg: '#FFF3C2',
  warningInk: '#8A6100',
  dangerBg: '#FDE5E5',
  dangerInk: '#B42318',
  neutralBg: '#EFEBE5',
  neutralInk: '#5C5650'
};

// Thang cỡ chữ (px) dùng chung cho các trang account. Muốn to/nhỏ cả feature chỉ cần sửa ở đây.
export const fs = {
  pageTitle: 30,
  name: 24,
  cardTitle: 20,
  strong: 16,
  body: 15,
  caption: 14,
  small: 13
};

export const radius = 2; // theme.spacing(2) = 16px khi dùng với sx borderRadius
// Thẻ trắng bo góc, viền kem và bóng nhẹ như khung form Đăng nhập
export const cardShadow = '0 24px 50px -34px rgba(17, 17, 17, 0.22)';
export const cardSx = { bgcolor: brand.surface, border: `1px solid ${brand.cardLine}`, borderRadius: '20px', boxShadow: cardShadow };