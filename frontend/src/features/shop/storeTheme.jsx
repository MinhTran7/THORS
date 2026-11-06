/**
 * Màu, font và style dùng chung cho giao diện cửa hàng (StorefrontLayout, ShopPage...).
 * Viết bằng object sx của MUI, không dùng file CSS.
 */

// Đồng bộ với trang Đăng nhập / Đăng ký (ShopAuthShell.css): nền kem, chữ xám đậm, hồng nhấn, xanh ngọc cho nút và link
export const C = {
  ink: '#1F2937',
  accent: '#E0559A',
  line: '#E7EBEE',
  sand: '#FFF6DA',
  muted: '#6B7280',
  photo: '#F3EFE8',
  teal: '#1BA3B3',
  cyan: '#A8F1F8',
  cyanInk: '#0E3A41',
  cream: '#FFFCF0'
};
export const RADIUS = { card: '24px', box: '14px' };
export const CARD_SHADOW = '0 24px 50px -30px rgba(31, 41, 55, 0.25), 0 0 0 1px #F2EBD3';
export const SANS = "'Public Sans', system-ui, sans-serif";
// Tiêu đề dùng cùng font với trang đăng nhập (đậm 800), không còn chữ có chân
export const SERIF = SANS;
export const FONT_URL = 'https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;800&display=swap';

export const focusRing = { '&:focus-visible': { outline: `2px solid ${C.teal}`, outlineOffset: '2px' } };
export const container = { maxWidth: 1320, mx: 'auto', px: { xs: '16px', sm: '40px' }, boxSizing: 'border-box' };
export const section = { ...container, pt: { xs: '64px', sm: '96px' } };
export const linkSx = { color: C.ink, textDecoration: 'none', cursor: 'pointer', '&:hover': { color: C.teal }, ...focusRing };
export const h2Sx = { m: 0, fontFamily: SERIF, fontWeight: 800, letterSpacing: '-0.5px', fontSize: { xs: 30, sm: 38 } };
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
  '&:hover': { color: C.teal },
  ...focusRing
};

// 'dark' = nút chính (xanh ngọc nhạt như nút Đăng nhập), 'outline' / 'light' = nút phụ viền nhạt
export const btnSx = (variant) => ({
  display: 'inline-block',
  boxSizing: 'border-box',
  minHeight: 44,
  px: '32px',
  py: '16px',
  fontFamily: 'inherit',
  fontSize: 15,
  fontWeight: variant === 'dark' ? 800 : 700,
  letterSpacing: 0,
  lineHeight: 1,
  textDecoration: 'none',
  cursor: 'pointer',
  borderRadius: RADIUS.box,
  border: variant === 'dark' ? `1.5px solid ${C.cyan}` : `1.5px solid ${variant === 'light' ? '#FFFFFF' : C.line}`,
  bgcolor: variant === 'dark' ? C.cyan : '#FFFFFF',
  color: variant === 'dark' ? C.cyanInk : '#374151',
  transition: 'opacity .2s, border-color .2s',
  '&:hover': { opacity: 0.85, color: variant === 'dark' ? C.cyanInk : '#374151' },
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
