import { Box } from '@mui/material';
import { C, CARD_SHADOW, RADIUS, SANS, SERIF, btnSx, focusRing } from 'features/shop/storeTheme';

/**
 * Style cho các trang đơn hàng của khách, đồng bộ với trang Đăng nhập:
 * nền kem, thẻ trắng bo góc có bóng nhẹ, tiêu đề đậm, nút xanh ngọc nhạt bo 14px.
 */

export { C, SANS, SERIF };

// Màu chữ theo nhóm trạng thái (tone trong constants.js), đủ tương phản trên nền trắng
export const TONE_INK = { success: '#2F6B3F', danger: '#C2185B', warning: '#8A5A00', neutral: C.muted };

export const pageTitleSx = { m: 0, fontFamily: SERIF, fontWeight: 800, letterSpacing: '-0.5px', fontSize: { xs: 30, sm: 38 }, lineHeight: 1.1, color: C.ink };
export const eyebrowSx = { m: 0, fontSize: 14, fontWeight: 700, color: C.accent };
export const panelSx = { bgcolor: '#FFFFFF', borderRadius: RADIUS.card, boxShadow: CARD_SHADOW, overflow: 'hidden' };
export const panelTitleSx = { m: 0, fontSize: 18, fontWeight: 800, color: C.ink, mb: 2 };

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

// Nút viền hồng đậm cho thao tác hủy
export const dangerBtnSx = storeBtnSx('outline', { borderColor: '#F2A3A3', color: '#D14343', '&:hover': { opacity: 0.85, color: '#D14343' } });

// Ghi đè ô nhập / ô chọn của MUI giống ô nhập trang đăng nhập: bo 14px, viền nhạt, xanh khi chọn
export const storeInputsSx = {
  '& .MuiOutlinedInput-root': { borderRadius: RADIUS.box, bgcolor: '#FAFDFD', fontFamily: SANS },
  '& .MuiOutlinedInput-root fieldset': { borderColor: C.line, borderWidth: '1.5px' },
  '& .MuiOutlinedInput-root:hover fieldset': { borderColor: C.cyan },
  '& .MuiOutlinedInput-root.Mui-focused fieldset': { borderColor: C.cyan, borderWidth: '1.5px' },
  '& .MuiInputLabel-root, & .MuiSelect-select, & input': { fontFamily: SANS },
  '& .MuiInputLabel-root.Mui-focused': { color: C.teal }
};

// Ghi đè thanh phân trang dùng chung (Pager) cho hợp với shop
export const storePagerSx = {
  borderTop: `1px solid ${C.line}`,
  '& .MuiButton-root': { borderRadius: '10px', fontFamily: SANS, color: C.ink },
  '& .MuiButton-root[aria-current="page"]': { bgcolor: C.cyan, color: C.cyanInk },
  '& .MuiTypography-root': { fontFamily: SANS }
};

// Khung hộp thoại bo góc như thẻ đăng nhập
export const storeDialogPaperSx = { borderRadius: RADIUS.card, p: 1, fontFamily: SANS, '& .MuiTypography-root': { fontFamily: SANS } };

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
    <Box sx={{ width, aspectRatio: '4 / 5', flexShrink: 0, bgcolor: C.photo, borderRadius: '12px', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
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
  color: C.teal,
  textDecoration: 'none',
  fontSize: 14,
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 1,
  '&:hover': { color: '#158A98' },
  ...focusRing
};
