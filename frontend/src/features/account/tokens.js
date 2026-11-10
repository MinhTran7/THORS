// Màu và kích thước theo thiết kế của BA cho feature Profile & Account Management.
// Khi nhóm thống nhất theme chung thì chuyển các giá trị này vào src/themes/palette.js.
// Đồng bộ với trang Đăng nhập (ShopAuthShell.css): nền kem, xanh ngọc nhạt, xanh ngọc đậm cho link, hồng nhấn.
export const brand = {
  cyan: '#A8F1F8',
  cyanHover: '#8FE6EF',
  cyanSoft: '#E6F9FB',
  teal: '#1BA3B3',
  pink: '#E0559A',
  ink: '#1F2937',
  inkOnCyan: '#0E3A41',
  muted: '#6B7280',
  line: '#E7EBEE',
  cardLine: '#F2EBD3',
  page: '#FFFCF0',
  surface: '#FFFFFF',
  yellowSoft: '#FFFBE1',
  yellowLine: '#F1EAB8',
  yellowChip: '#FFF1A6',
  yellowInk: '#6B5600',
  successBg: '#E5F6EC',
  successInk: '#1B7A43',
  warningBg: '#FFF3C2',
  warningInk: '#8A6100',
  dangerBg: '#FDE5E5',
  dangerInk: '#B42318',
  neutralBg: '#EFF0EC',
  neutralInk: '#4B5563'
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
export const cardShadow = '0 24px 50px -34px rgba(31, 41, 55, 0.22)';
export const cardSx = { bgcolor: brand.surface, border: `1px solid ${brand.cardLine}`, borderRadius: '20px', boxShadow: cardShadow };