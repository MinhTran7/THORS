import { Link as RouterLink } from 'react-router-dom';
import { Box } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import { C, SANS, SERIF, focusRing } from 'features/shop/storeTheme';

/**
 * Giao diện trang tài khoản của KHÁCH HÀNG theo kiểu cửa hàng (StorefrontLayout):
 * tiêu đề chữ có chân, khung vuông viền mảnh, nút đen/trắng không bo góc.
 * Owner / Family Member / Admin vẫn dùng giao diện quản trị như cũ.
 */

export const useIsCustomer = () => useAuth()?.account?.role === 'CUSTOMER';

export const storePanelSx = { bgcolor: '#FFFFFF', border: `1px solid ${C.line}`, borderRadius: 0 };
export const storePanelTitleSx = {
  m: 0,
  mb: 2.5,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  color: C.ink
};
export const storeNoticeSx = { bgcolor: C.sand, border: 0, borderRadius: 0 };

// Ghi đè các component MUI / Brand bên trong trang cho hợp với cửa hàng
const overridesSx = {
  '& .MuiButton-root': {
    borderRadius: 0,
    boxShadow: 'none',
    textTransform: 'none',
    fontFamily: SANS,
    fontWeight: 500,
    letterSpacing: '0.04em'
  },
  '& .MuiButton-contained': { bgcolor: C.ink, color: '#FFFFFF', '&:hover': { bgcolor: '#000000', boxShadow: 'none' } },
  '& .MuiButton-contained.Mui-disabled': { bgcolor: '#D9D3CA', color: '#FFFFFF' },
  '& .MuiButton-outlined': { bgcolor: '#FFFFFF', borderColor: C.ink, color: C.ink, '&:hover': { bgcolor: C.sand, borderColor: C.ink } },
  '& .MuiButton-outlined.Mui-disabled': { borderColor: C.line, color: '#A39E97' },
  '& .MuiOutlinedInput-root': { borderRadius: 0, bgcolor: '#FFFFFF', fontFamily: SANS },
  '& .MuiOutlinedInput-root fieldset': { borderColor: '#CFCAC2' },
  '& .MuiOutlinedInput-root:hover fieldset': { borderColor: C.ink },
  '& .MuiOutlinedInput-root.Mui-focused fieldset': { borderColor: C.ink, borderWidth: 1 },
  '& .MuiAlert-root, & .MuiChip-root': { borderRadius: 0 },
  '& .MuiTypography-root': { fontFamily: SANS }
};

const backLinkSx = {
  color: C.ink,
  textDecoration: 'none',
  fontSize: 13,
  letterSpacing: '0.06em',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 1,
  mb: 3,
  '&:hover': { color: C.accent },
  ...focusRing
};

/** Khung trang tài khoản của khách: link quay lại, dòng nhỏ phía trên, tiêu đề lớn, mô tả, nút bên phải. */
export function StoreAccountShell({ back, eyebrow = 'Tài khoản của tôi', title, subtitle, action, children }) {
  return (
    <Box sx={{ fontFamily: SANS, color: C.ink, ...overridesSx }}>
      {back && (
        <Box component={RouterLink} to={back.to} sx={backLinkSx}>
          <span aria-hidden="true">←</span> {back.label.toUpperCase()}
        </Box>
      )}
      <Box
        sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 2, mb: { xs: 4, sm: 5 } }}
      >
        <Box>
          <Box
            component="p"
            sx={{ m: 0, mb: 1.5, fontSize: 12, fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.muted }}
          >
            {eyebrow}
          </Box>
          <Box component="h1" sx={{ m: 0, fontFamily: SERIF, fontWeight: 400, fontSize: { xs: 32, sm: 44 }, lineHeight: 1.1 }}>
            {title}
          </Box>
          {subtitle && (
            <Box component="p" sx={{ m: 0, mt: 1.5, fontSize: 15, color: C.muted }}>
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
