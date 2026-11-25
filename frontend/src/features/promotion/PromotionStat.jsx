import { Box, Typography } from '@mui/material';
import { C } from './promotionDetailStyles';

// Một ô số liệu tổng trên thẻ báo cáo khuyến mãi
export default function PromotionStat({ label, value, highlight }) {
  return (
    <Box sx={{ flex: '1 1 160px', p: 2, borderRadius: 2.5, border: `1px solid ${C.borderLight}`, bgcolor: C.bg }}>
      <Typography sx={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>{label}</Typography>
      <Typography sx={{ mt: 0.5, fontSize: 20, fontWeight: 800, color: highlight ? '#B45309' : C.text }}>{value}</Typography>
    </Box>
  );
}
