/**
 * Màu, font và style dùng chung cho giao diện cửa hàng (StorefrontLayout, ShopPage...).
 * Viết bằng object sx của MUI, không dùng file CSS.
 */

export const C = { ink: '#111111', accent: '#8A2B2B', line: '#E6E3DE', sand: '#EFEBE5', muted: '#5C5650', photo: '#EEEAE4' };
export const SANS = "'Be Vietnam Pro', system-ui, sans-serif";
export const SERIF = "'Playfair Display', Georgia, serif";
export const FONT_URL =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Be+Vietnam+Pro:wght@400;500;600&display=swap';

export const focusRing = { '&:focus-visible': { outline: `2px solid ${C.accent}`, outlineOffset: '2px' } };
export const container = { maxWidth: 1320, mx: 'auto', px: { xs: '16px', sm: '40px' }, boxSizing: 'border-box' };
export const section = { ...container, pt: { xs: '64px', sm: '96px' } };
export const linkSx = { color: C.ink, textDecoration: 'none', cursor: 'pointer', '&:hover': { color: C.accent }, ...focusRing };
export const h2Sx = { m: 0, fontFamily: SERIF, fontWeight: 400, fontSize: { xs: 32, sm: 40 } };
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
  border: `1px solid ${variant === 'light' ? '#FFFFFF' : C.ink}`,
  bgcolor: variant === 'dark' ? C.ink : '#FFFFFF',
  color: variant === 'dark' ? '#FFFFFF' : C.ink,
  transition: 'opacity .2s',
  '&:hover': { opacity: 0.85, color: variant === 'dark' ? '#FFFFFF' : C.ink },
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
