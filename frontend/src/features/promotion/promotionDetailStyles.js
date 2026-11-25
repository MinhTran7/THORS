// Màu, thẻ và bảng dùng chung cho trang chi tiết khuyến mãi và các thẻ con

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
  cyanText: '#0E7490',
  cream: '#FFF7AE',
  creamHover: '#FFF294',
  creamText: '#713F12'
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
    bgcolor: '#F8FAFC',
    color: C.subtle,
    fontSize: 11.5,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    py: 1.5,
    borderBottom: `1px solid ${C.borderLight}`
  },
  '& td': {
    borderColor: C.borderLight,
    py: 1.75,
    fontSize: 13.5,
    color: C.text
  }
};
