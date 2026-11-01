import { Chip } from '@mui/material';
import { brand } from '../tokens';
import { ROLE_LABEL } from '../constants';

const TONES = {
  success: [brand.successBg, brand.successInk],
  warning: [brand.warningBg, brand.warningInk],
  danger: [brand.dangerBg, brand.dangerInk],
  neutral: [brand.neutralBg, brand.neutralInk]
};

// Mỗi vai trò một màu sáng riêng (nền tươi, chữ đậm cùng tông để dễ đọc).
// Cố ý tránh xanh lá / vàng / đỏ vì ba màu đó đã dành cho trạng thái (Hoạt động, Chờ xác minh, Đã khóa).
const ROLE_TONES = {
  ADMIN: ['#DDD6FE', '#4C1D95'], // tím
  OWNER: ['#A5F3FC', '#0B4A55'], // xanh ngọc (màu thương hiệu)
  STAFF: ['#BFDBFE', '#1E40AF'], // xanh dương
  FAMILY_MEMBER: ['#FBCFE8', '#831843'], // hồng
  CUSTOMER: ['#FED7AA', '#7C2D12'] // cam
};

export function StatusPill({ tone = 'neutral', label }) {
  const [bg, ink] = TONES[tone] ?? TONES.neutral;
  return (
    <Chip size="small" label={label} sx={{ bgcolor: bg, color: ink, fontWeight: 600, fontSize: 13, height: 26, borderRadius: '999px' }} />
  );
}

export function RoleChip({ role }) {
  const [bg, ink] = ROLE_TONES[role] ?? ROLE_TONES.CUSTOMER;
  return (
    <Chip
      size="small"
      label={ROLE_LABEL[role] ?? role}
      sx={{
        bgcolor: bg,
        color: ink,
        fontWeight: 600,
        fontSize: 13,
        height: 26,
        borderRadius: '999px'
      }}
    />
  );
}