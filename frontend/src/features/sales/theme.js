// Màu và kiểu dùng chung cho các trang bán tại quầy

export const C = {
  text: '#0F172A',
  label: '#334155',
  body: '#475569',
  muted: '#64748B',
  subtle: '#94A3B8',
  faint: '#CBD5E1',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  cyan: '#8EECF5',
  cyanHover: '#76E5EF',
  cyanText: '#0E7490',
  cream: '#FFF7AE',
  creamText: '#713F12',
  yellow: '#FEF9C3',
  yellowBorder: '#FDE047',
  yellowText: '#854D0E',
  green: '#10B981',
  error: '#EF4444'
};

// Lớp CSS tắt hiệu ứng bấm của MUI trên màn bán hàng
export const NO_EFFECTS = 'pos-no-effects';

export const noEffectStyles = {
  [`.${NO_EFFECTS} .MuiButtonBase-root, .${NO_EFFECTS} .MuiButtonBase-root::after`]: { transition: 'none !important' },
  [`.${NO_EFFECTS} .MuiButton-root:active::after`]: { opacity: '0 !important' },
  [`.${NO_EFFECTS} .MuiIconButton-root:hover, .${NO_EFFECTS} .MuiButton-text:hover`]: { backgroundColor: 'transparent !important' }
};

export const cardSx = { bgcolor: C.surface, borderRadius: 3.5, border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' };

export const primaryButtonSx = {
  bgcolor: C.cyan,
  color: C.text,
  fontWeight: 700,
  borderRadius: 2.5,
  textTransform: 'none',
  boxShadow: 'none',
  '&:hover': { bgcolor: C.cyanHover, boxShadow: 'none' },
  '&.Mui-disabled': { bgcolor: C.border, color: C.subtle }
};

export const outlineButtonSx = {
  bgcolor: C.surface,
  border: `1px solid ${C.border}`,
  color: C.label,
  fontWeight: 600,
  borderRadius: 1.5,
  textTransform: 'none'
};

// Nút chọn một trong nhiều (phương thức thanh toán, kiểu giảm giá)
export const choiceSx = (selected) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 1,
  fontFamily: 'inherit',
  fontWeight: 700,
  fontSize: 13,
  borderRadius: 2.5,
  cursor: 'pointer',
  outline: 'none',
  userSelect: 'none',
  bgcolor: selected ? C.yellow : C.surface,
  border: `1.5px solid ${selected ? C.yellowBorder : C.border}`,
  color: selected ? C.yellowText : C.body
});

export const filterInputSx = {
  bgcolor: C.surface,
  borderRadius: 2.5,
  height: 44,
  fontSize: 13.5,
  '& fieldset, & .MuiOutlinedInput-notchedOutline': { borderColor: C.border },
  '&:hover fieldset, &:hover .MuiOutlinedInput-notchedOutline': { borderColor: C.cyan },
  '&.Mui-focused fieldset, &.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: C.cyan }
};
