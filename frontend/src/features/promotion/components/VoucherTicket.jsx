import { Box, Button, Dialog, IconButton } from '@mui/material';
import { CloseOutlined } from '@ant-design/icons';
import { C, RADIUS, SANS } from 'features/shop/storeTheme';
import { capText, formatDate, formatDateTime, money } from '../utils';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const WARN = '#8A5A00';
export const STUB_BG = '#FFF9DB';

const isPercent = (p) => p.discountType === 'PERCENT';

export const timeLeft = (end) => {
  const ms = new Date(end) - Date.now();
  if (!(ms > 0) || ms > 3 * DAY) return null;
  return ms >= DAY ? `Còn ${Math.floor(ms / DAY)} ngày` : `Còn ${Math.max(1, Math.floor(ms / HOUR))} giờ`;
};

export const isUpcoming = (p) => new Date(p.startDate) > new Date();

const discountParts = (p) => {
  const v = Number(p.discountValue) || 0;
  if (isPercent(p)) return [v, '%'];
  return v >= 1000 ? [Math.round(v / 1000), 'K'] : [v, 'đ'];
};

// Màu nút theo màn khách (storeTheme)
const CYAN_HOVER = C.accent;

const noClickFx = { '&::after': { display: 'none !important' } };

const notch = (x, y) => `radial-gradient(circle at ${x} ${y}, #0000 10px, #000 10.5px) ${x} ${y} / 20px 51% no-repeat`;
const teeth = (x) => `radial-gradient(circle at ${x} 50%, #0000 5px, #000 5.5px) ${x} 0 / 8px 14px repeat-y`;
const solid = (x, w) => `linear-gradient(#000 0 0) ${x} 0 / calc(100% - ${w}px) 100% no-repeat`;
const maskSx = (...layers) => ({ WebkitMask: layers.join(','), mask: layers.join(',') });

// Vé voucher: bên trái tên và điều kiện, bên phải mức giảm
export function VoucherTicket({ promotion, onViewCondition }) {
  const [value, unit] = discountParts(promotion);
  const left = timeLeft(promotion.endDate);
  const upcoming = isUpcoming(promotion);

  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: 160,
        filter: 'drop-shadow(0 14px 18px rgba(31,41,55,.08)) drop-shadow(0 0 1px rgba(160,140,90,.55))'
      }}
    >
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          bgcolor: '#FFFFFF',
          p: '18px 18px 14px 26px',
          display: 'flex',
          flexDirection: 'column',
          ...maskSx(solid('8px', 28), teeth('0'), notch('100%', '0'), notch('100%', '100%'))
        }}
      >
        <Box component="h3" sx={{ m: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.35 }}>
          {promotion.name}
        </Box>
        <Box sx={{ fontSize: 12.5, color: C.muted, mt: 0.5, lineHeight: 1.5, '& b': { color: C.ink, fontWeight: 600 } }}>
          Cho đơn từ <b>{money(promotion.minOrderValue)}</b>
          {capText(promotion) && ` · ${capText(promotion)}`}
        </Box>
        <Box sx={{ fontSize: 12.5, mt: 0.75, color: left && !upcoming ? WARN : C.muted, fontWeight: left && !upcoming ? 600 : 400 }}>
          {upcoming ? `Bắt đầu ${formatDateTime(promotion.startDate)}` : left || `HSD ${formatDate(promotion.endDate)}`}
        </Box>
        <Box sx={{ mt: 'auto', pt: 1.5 }}>
          <Button
            variant="text"
            disableRipple
            onClick={() => onViewCondition(promotion)}
            sx={{
              ...noClickFx,
              fontSize: 12.5,
              minWidth: 0,
              px: 0,
              color: `${CYAN_HOVER} !important`,
              '&:hover': { bgcolor: 'transparent' }
            }}
          >
            Điều kiện
          </Button>
        </Box>
      </Box>

      <Box
        sx={{
          width: 104,
          flexShrink: 0,
          bgcolor: STUB_BG,
          borderLeft: '2px dashed #E7CF8A',
          pr: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          ...maskSx(solid('20px', 28), teeth('100%'), notch('0', '0'), notch('0', '100%'))
        }}
      >
        <Box sx={{ fontSize: 28, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1 }}>
          {value}
          {unit}
        </Box>
        <Box sx={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', color: C.muted, mt: 0.75 }}>
          {isPercent(promotion) ? 'GIẢM GIÁ' : 'GIẢM TIỀN'}
        </Box>
      </Box>
    </Box>
  );
}

// Chi tiết điều kiện của một voucher
export function ConditionDialog({ promotion, onClose }) {
  const [value, unit] = discountParts(promotion);
  const rows = [
    ['Đơn tối thiểu', money(promotion.minOrderValue)],
    isPercent(promotion) && ['Giảm tối đa', promotion.maxDiscountAmount ? money(promotion.maxDiscountAmount) : 'Không giới hạn'],
    ['Bắt đầu', formatDateTime(promotion.startDate)],
    ['Kết thúc', formatDateTime(promotion.endDate)],
    ['Áp dụng', 'Toàn bộ đơn hàng'],
    promotion.remaining != null && ['Lượt còn lại', promotion.remaining]
  ].filter(Boolean);

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: RADIUS.card,
            overflowY: 'auto',
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
            color: C.ink,
            fontFamily: SANS
          }
        }
      }}
    >
      <Box sx={{ position: 'relative', bgcolor: STUB_BG, textAlign: 'center', p: '32px 28px 24px' }}>
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', top: 14, right: 14, width: 34, height: 34, bgcolor: '#FFFFFF', '&:hover': { bgcolor: '#FFFFFF' } }}
        >
          <CloseOutlined style={{ fontSize: 12, color: C.muted }} />
        </IconButton>
        <Box sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', color: C.muted }}>
          {isPercent(promotion) ? 'GIẢM GIÁ' : 'GIẢM TIỀN'}
        </Box>
        <Box sx={{ fontSize: 56, fontWeight: 800, letterSpacing: '-2px', lineHeight: 1.1 }}>
          {value}
          {unit}
        </Box>
        <Box component="h2" sx={{ m: 0, mt: 0.5, fontSize: 18, fontWeight: 700 }}>
          {promotion.name}
        </Box>
        {promotion.description && <Box sx={{ mt: 0.75, fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>{promotion.description}</Box>}
      </Box>

      <Box sx={{ borderTop: '2px dashed #E7CF8A' }} />

      <Box sx={{ p: '8px 28px 28px' }}>
        {rows.map(([label, val], i) => (
          <Box
            key={label}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 2,
              py: 1.5,
              borderTop: i ? `1px solid ${C.line}` : 0,
              fontSize: 14
            }}
          >
            <Box component="span" sx={{ color: C.muted }}>
              {label}
            </Box>
            <Box component="span" sx={{ fontWeight: 600, textAlign: 'right' }}>
              {val}
            </Box>
          </Box>
        ))}
      </Box>
    </Dialog>
  );
}
