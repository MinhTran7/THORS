import { Box, Button, Chip, Typography } from '@mui/material';
import { money } from 'features/shop/ShopCommon';
import { C } from 'features/shop/storeTheme';
import { cardSx, outlineButtonSx } from 'features/customer/theme';
import { SLOT_LABELS, SLOTS, wornItems } from './fittingRoomReducer';
import { fitSummary } from 'features/fitting/fitText';
import { fitOf, sizeSupported, variantFor } from './wardrobeData';

const chipSx = (on) => ({
  fontWeight: 600,
  borderRadius: '10px',
  border: `1px solid ${on ? C.primary : C.line}`,
  bgcolor: on ? C.primary : '#fff',
  color: on ? '#fff' : C.ink,
  '&:hover': { bgcolor: on ? C.primaryDark : C.sand }
});

/** Trạng thái thử 3D của một món (không giả lập là đã mặc khi chưa có mô hình). */
function status(item) {
  if (!item.has3d) return 'Chưa hỗ trợ thử đồ 3D';
  if (!sizeSupported(item.model, item.size)) return `Size ${item.size} chưa có mô hình 3D`;
  return null;
}

/**
 * Bộ đang mặc: từng ô (áo khoác, áo, đầm, quần, giày) + tổng tiền. Bấm một món để đổi size / màu.
 * Món chưa có mô hình 3D (hoặc size chưa có): ghi rõ, không vẽ lên người mẫu.
 */
export default function CurrentOutfitPanel({ slots, selected, onSelect, onRemove, onClear, onChangeVariant, onSwap }) {
  const items = wornItems(slots);
  const total = items.reduce((sum, i) => sum + (Number(i.price) || 0), 0);

  const change = (item, size, color) => {
    const v = variantFor(item.variants ?? [], size, color);
    if (v) onChangeVariant(item.slot, { detailId: v.detailId, size: v.size, color: v.color, price: v.price, stock: v.stock });
  };

  return (
    <Box sx={{ ...cardSx, p: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography sx={{ fontWeight: 800 }}>Đang mặc</Typography>
        {items.length > 0 && (
          <Button color="inherit" onClick={onClear} size="small" sx={{ textTransform: 'none', color: C.muted, fontWeight: 600 }}>
            Cởi hết
          </Button>
        )}
      </Box>

      {SLOTS.map((slot) => {
        const item = slots[slot];
        const on = selected === slot && Boolean(item);
        const note = item && status(item);
        return (
          <Box key={slot} sx={{ borderTop: `1px solid ${C.line}`, ...(on && { bgcolor: C.cream }) }}>
            <Box
              sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 1, cursor: item ? 'pointer' : 'default' }}
              onClick={() => item && onSelect(on ? null : slot)}
            >
              <Box sx={{ width: 44, height: 56, flexShrink: 0, borderRadius: '10px', bgcolor: C.photo, overflow: 'hidden' }}>
                {item?.imageUrl && (
                  <Box
                    component="img"
                    src={item.imageUrl}
                    alt={item.productName}
                    sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 12, color: C.muted }}>{SLOT_LABELS[slot]}</Typography>
                {item ? (
                  <>
                    <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 700 }} title={item.productName}>
                      {item.productName}
                    </Typography>
                    <Typography sx={{ fontSize: 12.5, color: C.muted }}>
                      {[item.size && `Size ${item.size}`, item.color, item.price != null && money(item.price)].filter(Boolean).join(' · ')}
                    </Typography>
                    {note && <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.accent }}>{note}</Typography>}
                    {!note && item.stock === 0 && <Typography sx={{ fontSize: 12, color: C.muted }}>Biến thể này đang hết hàng</Typography>}
                    {fitOf(item.advice, item.size, fitSummary) && (
                      <Typography sx={{ fontSize: 12, color: C.muted }}>
                        {item.advice.recommendedSize && item.advice.recommendedSize !== item.size
                          ? `Gợi ý size ${item.advice.recommendedSize} · `
                          : ''}
                        {fitOf(item.advice, item.size, fitSummary)}
                      </Typography>
                    )}
                  </>
                ) : (
                  <Typography sx={{ fontSize: 13, color: '#9CA3AF' }}>Trống</Typography>
                )}
              </Box>
              {item && onSwap && item.role && (
                <Button
                  color="inherit"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSwap(slot);
                  }}
                  sx={{ ...outlineButtonSx, height: 32, px: 1.5, fontSize: 12.5, mr: 0.75 }}
                >
                  Đổi
                </Button>
              )}
              {item && (
                <Button
                  color="inherit"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(slot);
                  }}
                  sx={{ ...outlineButtonSx, height: 32, px: 1.5, fontSize: 12.5 }}
                >
                  Bỏ
                </Button>
              )}
            </Box>

            {/* Đổi size / màu của món đang chọn */}
            {on && item.variants?.length > 0 && (
              <Box sx={{ pb: 1.25, pl: 1 }}>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 0.75 }}>
                  {[...new Set(item.variants.map((v) => v.size))].map((s) => {
                    const ok = !item.has3d || sizeSupported(item.model, s);
                    return (
                      <Chip
                        key={s}
                        size="small"
                        label={ok ? s : `${s} (chưa có 3D)`}
                        disabled={!ok}
                        clickable={ok}
                        onClick={() => ok && change(item, s, item.color)}
                        sx={chipSx(item.size === s)}
                      />
                    );
                  })}
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {item.variants
                    .filter((v) => v.size === item.size)
                    .map((v) => (
                      <Chip
                        key={v.detailId}
                        size="small"
                        label={v.stock > 0 ? v.color : `${v.color} (hết hàng)`}
                        clickable
                        onClick={() => change(item, item.size, v.color)}
                        sx={chipSx(item.color === v.color)}
                      />
                    ))}
                </Box>
              </Box>
            )}
          </Box>
        );
      })}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.line}`, pt: 1.25 }}>
        <Typography sx={{ fontWeight: 700 }}>Tổng</Typography>
        <Typography sx={{ fontWeight: 800 }}>{money(total)}</Typography>
      </Box>
    </Box>
  );
}
