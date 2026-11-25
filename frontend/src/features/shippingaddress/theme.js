// Màu và kiểu nút / thẻ của trang địa chỉ giao hàng, đồng bộ với trang Đăng nhập và các trang tài khoản của khách
import { C as STORE } from 'features/shop/storeTheme';

export const C = {
  cyan: '#A8F1F8',
  teal: '#1BA3B3',
  text: '#1F2937',
  muted: '#6B7280',
  border: '#E7EBEE',
  borderLight: '#F1F3F5',
  surface: '#FFFFFF',
  error: '#D14343'
};

export const primaryButtonSx = {
  bgcolor: STORE.accent,
  color: '#FFFFFF',
  fontWeight: 800,
  fontSize: 14.5,
  px: 3,
  height: 46,
  borderRadius: '14px',
  textTransform: 'none',
  boxShadow: 'none',
  '&:hover': { bgcolor: STORE.accent, color: '#FFFFFF', boxShadow: 'none' },
  '&::after': { display: 'none' },
  '&.Mui-disabled': { bgcolor: '#E5E7EB', color: '#9CA3AF' }
};

export const outlineButtonSx = {
  textTransform: 'none',
  fontWeight: 700,
  fontSize: 14.5,
  color: '#374151',
  bgcolor: C.surface,
  px: 2.5,
  height: 46,
  borderRadius: '14px',
  border: `1.5px solid ${C.border}`,
  '&:hover': { bgcolor: C.surface, borderColor: STORE.ink, color: '#374151' }
};

// Thẻ trắng bo góc, bóng nhẹ như khung form Đăng nhập
export const cardSx = {
  bgcolor: C.surface,
  borderRadius: '24px',
  border: 0,
  boxShadow: '0 24px 50px -30px rgba(31, 41, 55, 0.25), 0 0 0 1px #F2EBD3'
};
