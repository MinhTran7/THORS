import { Chip } from '@mui/material';
import { brand } from '../tokens';
import { ROLE_LABEL } from '../constants';

const TONES = {
  success: [brand.successBg, brand.successInk],
  warning: [brand.warningBg, brand.warningInk],
  danger: [brand.dangerBg, brand.dangerInk],
  neutral: [brand.neutralBg, brand.neutralInk]
};

export function StatusPill({ tone = 'neutral', label }) {
  const [bg, ink] = TONES[tone] ?? TONES.neutral;
  return (
    <Chip size="small" label={label} sx={{ bgcolor: bg, color: ink, fontWeight: 600, fontSize: 12, height: 22, borderRadius: '999px' }} />
  );
}

export function RoleChip({ role }) {
  const family = role === 'FAMILY_MEMBER';
  return (
    <Chip
      size="small"
      label={ROLE_LABEL[role] ?? role}
      sx={{
        bgcolor: family ? brand.yellowChip : brand.cyanSoft,
        color: family ? brand.yellowInk : brand.ink,
        fontWeight: 600,
        fontSize: 12,
        height: 22,
        borderRadius: '999px'
      }}
    />
  );
}