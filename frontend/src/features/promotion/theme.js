// Màu và kiểu dùng chung cho các trang khuyến mãi (Owner)

export const C = {
  text: '#1E293B',
  muted: '#64748B',
  subtle: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  cyan: '#8EECF5',
  cyanHover: '#76E5EF',
  cream: '#FFF7AE',
  creamText: '#713F12',
  // Form tạo/sửa dùng tông vàng
  yellow: '#FDE68A',
  yellowCheck: '#FCD34D',
  yellowText: '#92400E',
  yellowDark: '#422006',
  yellowSelected: '#FFFBEB',
  discount: '#B45309',
  error: '#EF4444',
  danger: '#DC2626'
};

export const SCHEDULE_TONE = {
  ONGOING: { bg: C.cream, color: C.creamText },
  UPCOMING: { bg: '#E0F2FE', color: '#0369A1' },
  ENDED: { bg: C.borderLight, color: C.muted }
};

export const cardSx = {
  bgcolor: C.surface,
  borderRadius: 3.5,
  border: `1px solid ${C.border}`,
  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
  p: { xs: 2.5, sm: 3 },
  mb: 2.5
};

export const tableSx = {
  '& th': {
    bgcolor: C.bg,
    color: C.subtle,
    fontSize: 11.5,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    py: 1.5,
    borderBottom: `1px solid ${C.borderLight}`
  },
  '& td': { borderColor: C.borderLight, py: 1.75, fontSize: 13.5, color: C.text }
};

export const primaryButtonSx = {
  bgcolor: C.cyan,
  color: C.text,
  fontWeight: 700,
  fontSize: 13.5,
  borderRadius: 2.5,
  height: 44,
  px: 2.5,
  textTransform: 'none',
  boxShadow: 'none',
  '&:hover': { bgcolor: C.cyanHover, boxShadow: 'none' }
};

export const secondaryButtonSx = {
  textTransform: 'none',
  borderRadius: 2.5,
  bgcolor: C.surface,
  border: `1px solid ${C.border}`,
  fontWeight: 700,
  fontSize: 13.5,
  px: 2,
  height: 44,
  '&:hover': { bgcolor: C.bg }
};

// Ô nhập trong form tạo/sửa: viền không đổi màu khi focus hoặc lỗi (lỗi hiện bằng chữ đỏ)
export const fieldSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: C.surface,
    borderRadius: 2.5,
    fontSize: 14,
    '&, &.Mui-focused, &.Mui-error.Mui-focused': { boxShadow: 'none' },
    '& fieldset, &:hover fieldset, &.Mui-focused fieldset, &.Mui-error fieldset, &.Mui-error:hover fieldset, &.Mui-error.Mui-focused fieldset':
      { border: `1px solid ${C.border}` }
  },
  '& .MuiFormHelperText-root': { mx: 0.5, fontSize: 12 },
  '& .MuiInputLabel-root': { fontSize: 13.5 },
  '& .MuiInputLabel-root.Mui-focused, & .MuiInputLabel-root.Mui-error': { color: C.muted }
};

// Ô lọc trên trang danh sách: viền cyan khi hover/focus
export const filterInputSx = {
  bgcolor: C.surface,
  borderRadius: 2.5,
  height: 44,
  fontSize: 13.5,
  '& fieldset, & .MuiOutlinedInput-notchedOutline': { borderColor: C.border },
  '&:hover fieldset, &:hover .MuiOutlinedInput-notchedOutline': { borderColor: C.cyan },
  '&.Mui-focused fieldset, &.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: C.cyan }
};

export const dialogPaper = { paper: { sx: { borderRadius: 3.5, border: `1px solid ${C.border}`, p: 1 } } };
