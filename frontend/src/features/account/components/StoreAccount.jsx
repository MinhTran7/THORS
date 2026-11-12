import { Link as RouterLink } from 'react-router-dom';
import { Box } from '@mui/material';
import { RightOutlined } from '@ant-design/icons';
import { useAuth } from 'features/auth/AuthProvider';
import { C, CARD_SHADOW, RADIUS, SANS, SERIF, focusRing } from 'features/shop/storeTheme';

/**
 * Giao diện trang tài khoản của KHÁCH HÀNG, đồng bộ với trang Đăng nhập:
 * thẻ trắng bo góc có bóng nhẹ trên nền kem, tiêu đề đậm, nút xanh ngọc nhạt bo 14px.
 * Owner / Family Member / Admin vẫn dùng giao diện quản trị như cũ.
 */

export const useIsCustomer = () => useAuth()?.account?.role === 'CUSTOMER';

export const storePanelSx = { bgcolor: '#FFFFFF', border: 0, borderRadius: RADIUS.card, boxShadow: CARD_SHADOW, overflow: 'hidden' };
export const storePanelTitleSx = {
  m: 0,
  mb: 2.5,
  fontSize: 18,
  fontWeight: 800,
  color: C.ink
};
export const storeNoticeSx = { bgcolor: C.sand, border: '1px solid #F2E3B0', borderRadius: RADIUS.box };

// Ghi đè các component MUI / Brand bên trong trang cho giống form đăng nhập
const overridesSx = {
  '& .MuiButton-root': {
    borderRadius: RADIUS.box,
    boxShadow: 'none',
    textTransform: 'none',
    fontFamily: SANS,
    fontWeight: 700,
    letterSpacing: 0
  },
  '& .MuiButton-contained': { bgcolor: C.cyan, color: C.cyanInk, fontWeight: 800, '&:hover': { bgcolor: '#3A3A3A', boxShadow: 'none' } },
  '& .MuiButton-contained.Mui-disabled': { bgcolor: '#E5E7EB', color: '#9CA3AF' },
  '& .MuiButton-outlined': {
    bgcolor: '#FFFFFF',
    border: `1.5px solid ${C.line}`,
    color: '#374151',
    '&:hover': { bgcolor: '#FAFDFD', border: `1.5px solid ${C.cyan}` }
  },
  '& .MuiButton-outlined.Mui-disabled': { borderColor: C.line, color: '#9CA3AF' },
  '& .MuiOutlinedInput-root': { borderRadius: RADIUS.box, bgcolor: '#FAFDFD', fontFamily: SANS },
  '& .MuiOutlinedInput-root fieldset': { borderColor: C.line, borderWidth: '1.5px' },
  '& .MuiOutlinedInput-root:hover fieldset': { borderColor: C.cyan },
  '& .MuiOutlinedInput-root.Mui-focused fieldset': { borderColor: C.cyan, borderWidth: '1.5px' },
  '& .MuiAlert-root, & .MuiChip-root': { borderRadius: RADIUS.box },
  '& .MuiTypography-root': { fontFamily: SANS }
};

export function StoreCrumb({ back, current }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.25, mb: 3, fontSize: 15 }}>
      <Box component={RouterLink} to={back.to} sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, color: '#1E293B', textDecoration: 'none', fontWeight: 600, ...focusRing }}>
        {back.icon && <Box component="span" sx={{ display: 'inline-flex', fontSize: 16, color: '#475569' }}>{back.icon}</Box>}
        {back.label}
      </Box>
      <RightOutlined style={{ fontSize: 11, color: '#64748B', margin: '0 2px' }} />
      <Box component="span" sx={{ color: '#D7428B', fontWeight: 700 }}>
        {current}
      </Box>
    </Box>
  );
}

/** Khung trang tài khoản của khách: link quay lại, dòng nhỏ phía trên, tiêu đề lớn, mô tả, nút bên phải. */
export function StoreAccountShell({ back, eyebrow, title, subtitle, action, children }) {
  return (
    <Box sx={{ fontFamily: SANS, color: C.ink, ...overridesSx }}>
      {back && <StoreCrumb back={back} current={title} />}
      <Box
        sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 2, mb: { xs: 3, sm: 4 } }}
      >
        <Box>
          {eyebrow && (
            <Box component="p" sx={{ m: 0, mb: 1, fontSize: 14, fontWeight: 700, color: C.accent }}>
              {eyebrow}
            </Box>
          )}
          <Box component="h1" sx={{ m: 0, fontFamily: SERIF, fontWeight: 800, letterSpacing: '-0.5px', fontSize: { xs: 30, sm: 38 }, lineHeight: 1.1 }}>
            {title}
          </Box>
          {subtitle && (
            <Box component="p" sx={{ m: 0, mt: 1, fontSize: 16, color: C.muted }}>
              {subtitle}
            </Box>
          )}
        </Box>
        {action}
      </Box>
      {children}
    </Box>
  );
}
