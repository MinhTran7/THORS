export const C = {
  cyan: '#8EECF5',
  cyanHover: '#76DCED',
  text: '#1E293B',
  muted: '#64748B',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  surface: '#FFFFFF',
  error: '#EF4444'
};

export const primaryButtonSx = {
  bgcolor: C.cyan,
  color: '#0F172A',
  fontWeight: 700,
  fontSize: 13.5,
  px: 3,
  height: 42,
  borderRadius: 2.5,
  textTransform: 'none',
  boxShadow: 'none',
  '&:hover': { bgcolor: C.cyanHover, boxShadow: '0 2px 8px rgba(142, 236, 245, 0.4)' },
  '&.Mui-disabled': { bgcolor: C.border, color: '#94A3B8' }
};

export const outlineButtonSx = {
  textTransform: 'none',
  fontWeight: 600,
  fontSize: 13.5,
  color: C.text,
  px: 2.5,
  height: 42,
  borderRadius: 2.5,
  border: `1px solid ${C.border}`,
  '&:hover': { bgcolor: C.borderLight }
};

export const cardSx = {
  bgcolor: C.surface,
  borderRadius: 3.5,
  border: `1px solid ${C.border}`,
  boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
};
