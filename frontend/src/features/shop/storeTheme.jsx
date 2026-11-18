/**
 * Màu, font và style dùng chung cho giao diện cửa hàng (StorefrontLayout, ShopPage...).
 * Viết bằng object sx của MUI, không dùng file CSS.
 */

// Tông trầm của màn khách hàng (theo nhánh Hieu): chữ đen, nhấn đỏ đô, nền be, tiêu đề chữ có chân.
// teal / cyan / cyanInk / cream được giữ tên vì nhiều màn đang dùng, nhưng đổi sang màu tông trầm tương ứng.
export const C = {
  ink: '#111111', // chữ
  accent: '#8A2B2B', // đỏ đô: link khi rê chuột, giá khuyến mãi, Sale
  primary: '#8A2B2B', // màu chủ đạo: nút chính, thanh thông báo, ô đang chọn
  primaryDark: '#6E1F1F', // khi rê chuột lên nút đỏ đô
  deep: '#4A1717', // nền footer (đỏ đô đậm)
  line: '#E6E3DE',
  sand: '#EFEBE5',
  muted: '#5C5650',
  photo: '#EEEAE4',
  teal: '#8A2B2B', // màu nhấn cho link / tab đang chọn
  cyan: '#8A2B2B', // nền nút chính, viền ô nhập khi focus
  cyanInk: '#FFFFFF', // chữ trên nút chính
  cream: '#F7F5F2' // nền trang
};
export const RADIUS = { card: '24px', box: '14px' };
export const CARD_SHADOW = '0 24px 50px -30px rgba(17, 17, 17, 0.25), 0 0 0 1px #E6E3DE';
export const SANS = "'Be Vietnam Pro', system-ui, sans-serif";
// Chỉ logo trên header dùng chữ có chân; mọi chữ còn lại (kể cả tiêu đề) dùng chung font Be Vietnam Pro.
// SERIF giữ tên cũ cho các màn đang import, nhưng giờ trỏ về font chữ thường.
export const LOGO_FONT = "'Playfair Display', Georgia, serif";
export const SERIF = SANS;
export const FONT_URL =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap';

export const focusRing = { '&:focus-visible': { outline: `2px solid ${C.accent}`, outlineOffset: '2px' } };
export const container = { maxWidth: 1320, mx: 'auto', px: { xs: '16px', sm: '40px' }, boxSizing: 'border-box' };
export const section = { ...container, pt: { xs: '64px', sm: '96px' } };
export const linkSx = { color: C.ink, textDecoration: 'none', cursor: 'pointer', '&:hover': { color: C.accent }, ...focusRing };
export const h2Sx = { m: 0, fontFamily: SANS, fontWeight: 700, fontSize: { xs: 28, sm: 36 }, letterSpacing: '-0.01em' };
export const eyebrowSx = { m: 0, fontSize: 13, letterSpacing: '0.2em', textTransform: 'uppercase' };
export const srOnly = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap'
};

export const iconBtnSx = {
  width: 44,
  height: 44,
  p: 0,
  border: 0,
  bgcolor: 'transparent',
  color: C.ink,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textDecoration: 'none',
  fontFamily: 'inherit',
  '&:hover': { color: C.accent },
  ...focusRing
};

// 'dark' = nút đỏ đô chữ trắng, 'outline' = nút trắng viền đỏ đô, 'light' = nút trắng viền trắng (trên nền màu)
export const btnSx = (variant) => ({
  display: 'inline-block',
  boxSizing: 'border-box',
  minHeight: 44,
  px: '32px',
  py: '16px',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 500,
  letterSpacing: '0.06em',
  lineHeight: 1,
  textDecoration: 'none',
  cursor: 'pointer',
  border: `1px solid ${variant === 'light' ? '#FFFFFF' : C.primary}`,
  bgcolor: variant === 'dark' ? C.primary : '#FFFFFF',
  color: variant === 'dark' ? '#FFFFFF' : C.primary,
  transition: 'opacity .2s',
  '&:hover': { opacity: 0.85, color: variant === 'dark' ? '#FFFFFF' : C.primary },
  '&:disabled': { opacity: 0.6, cursor: 'default' },
  ...focusRing
});

export const scrollToId = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export function Icon({ children, size = 20, strokeWidth = 1.6 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
      {children}
    </svg>
  );
}
