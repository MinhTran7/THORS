import { Box } from '@mui/material';
import { C, SANS, SERIF, btnSx, focusRing } from 'features/shop/storefront';

/**
 * Style cho các trang đơn hàng của khách, theo giao diện cửa hàng (trang chủ shop):
 * chữ đen, điểm nhấn đỏ rượu, font Playfair Display / Be Vietnam Pro, khung vuông viền mảnh.
 */

export { C, SANS, SERIF };

// Màu chữ theo nhóm trạng thái (tone trong constants.js), đủ tương phản trên nền trắng
export const TONE_INK = { success: '#2F6B3F', danger: C.accent, warning: '#8A5A00', neutral: C.muted };

export const pageTitleSx = { m: 0, fontFamily: SERIF, fontWeight: 400, fontSize: { xs: 32, sm: 44 }, lineHeight: 1.1, color: C.ink };
export const eyebrowSx = { m: 0, fontSize: 12, fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.muted };
export const panelSx = { border: `1px solid ${C.line}`, bgcolor: '#FFFFFF' };
export const panelTitleSx = { ...eyebrowSx, color: C.ink, fontWeight: 600, mb: 2 };

// Nút vuông của shop, cỡ nhỏ hơn một chút để đặt cạnh nhau trong thẻ đơn
export const storeBtnSx = (variant = 'outline', extra = {}) => ({
  ...btnSx(variant),
  px: '22px',
  py: '13px',
  fontSize: 13,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 1,
  ...extra
});

// Nút viền màu đỏ rượu cho thao tác hủy
export const dangerBtnSx = storeBtnSx('outline', { borderColor: C.accent, color: C.accent, '&:hover': { opacity: 0.85, color: C.accent } });

// Ghi đè ô nhập / ô chọn của MUI cho vuông góc, viền đen khi chọn
export const storeInputsSx = {
  '& .MuiOutlinedInput-root': { borderRadius: 0, bgcolor: '#FFFFFF', fontFamily: SANS },
  '& .MuiOutlinedInput-root fieldset': { borderColor: '#CFCAC2' },
  '& .MuiOutlinedInput-root:hover fieldset': { borderColor: C.ink },
  '& .MuiOutlinedInput-root.Mui-focused fieldset': { borderColor: C.ink, borderWidth: 1 },
  '& .MuiInputLabel-root, & .MuiSelect-select, & input': { fontFamily: SANS },
  '& .MuiInputLabel-root.Mui-focused': { color: C.ink }
};

// Ghi đè thanh phân trang dùng chung (Pager) cho hợp với shop
export const storePagerSx = {
  borderTop: `1px solid ${C.line}`,
  '& .MuiButton-root': { borderRadius: 0, fontFamily: SANS, color: C.ink },
  '& .MuiButton-root[aria-current="page"]': { bgcolor: C.ink, color: '#FFFFFF' },
  '& .MuiTypography-root': { fontFamily: SANS }
};

// Khung hộp thoại vuông theo shop
export const storeDialogPaperSx = { borderRadius: 0, p: 1, fontFamily: SANS, '& .MuiTypography-root': { fontFamily: SANS } };

export function StatusText({ tone, label, sx }) {
  return (
    <Box
      component="span"
      sx={{
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: TONE_INK[tone] ?? C.muted,
        whiteSpace: 'nowrap',
        ...sx
      }}
    >
      {label}
    </Box>
  );
}

// Ảnh sản phẩm tỉ lệ 4:5 như thẻ sản phẩm ngoài shop; không có ảnh thì hiện chữ cái đầu
export function StoreThumb({ src, name, width = 88 }) {
  return (
    <Box sx={{ width, aspectRatio: '4 / 5', flexShrink: 0, bgcolor: C.photo, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      {src ? (
        <Box component="img" src={src} alt={name} loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Box component="span" sx={{ fontFamily: SERIF, fontSize: 28, color: 'rgba(17,17,17,.3)' }}>
          {name?.charAt(0)}
        </Box>
      )}
    </Box>
  );
}

export const textLinkSx = {
  color: C.ink,
  textDecoration: 'none',
  fontSize: 13,
  letterSpacing: '0.06em',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 1,
  '&:hover': { color: C.accent },
  ...focusRing
};
