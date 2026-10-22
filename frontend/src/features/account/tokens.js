// Màu và kích thước theo thiết kế của BA cho feature Profile & Account Management.
// Khi nhóm thống nhất theme chung thì chuyển các giá trị này vào src/themes/palette.js.
export const brand = {
  cyan: '#8EE9F2',
  cyanHover: '#74DCE7',
  cyanSoft: '#E6F9FB',
  ink: '#1F2937',
  inkOnCyan: '#0E3A41',
  muted: '#6B7280',
  line: '#E7E8E2',
  page: '#FBFBF7',
  surface: '#FFFFFF',
  yellowSoft: '#FFFBE1',
  yellowLine: '#F1EAB8',
  yellowChip: '#FFF1A6',
  yellowInk: '#6B5600',
  successBg: '#E5F6EC',
  successInk: '#1B7A43',
  warningBg: '#FFF3C2',
  warningInk: '#8A6100',
  dangerBg: '#FDE5E5',
  dangerInk: '#B42318',
  neutralBg: '#EFF0EC',
  neutralInk: '#4B5563'
};

export const radius = 2; // theme.spacing(2) = 16px khi dùng với sx borderRadius
export const cardSx = { bgcolor: brand.surface, border: `1px solid ${brand.line}`, borderRadius: '14px' };