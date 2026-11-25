import { useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Dialog, DialogContent, IconButton, Typography } from '@mui/material';
import { money } from 'features/shop/ShopCommon';
import { C, SERIF } from 'features/shop/storeTheme';
import { outfitAlternatives } from './api';

/**
 * "Đổi món": khách tự chọn món thay thế cho một món trong bộ (cùng vai trò: áo / quần / đầm / giày).
 * Danh sách đã lọc còn hàng, đúng giới tính, size theo số đo, bỏ màu khách tránh; món hợp dịp đứng trước.
 * Món làm cả bộ vượt ngân sách vẫn hiện (mờ, không chọn được) để khách biết.
 *
 * request: điều kiện phối đồ đang chọn, keepDetailIds = các món còn lại của bộ.
 * onChoose(món) = đổi sang món đó; onAuto() = để hệ thống tự chọn món khác.
 */
export default function SwapDialog({ item, request, budget, onClose, onChoose, onAuto }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    outfitAlternatives(request, item.role, item.productId)
      .then((l) => alive && setList(l))
      .catch((e) => {
        if (!alive) return;
        setList([]);
        setError(e.message);
      });
    return () => {
      alive = false;
    };
    // Chỉ tải lại khi đổi món khác
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.detailId]);

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogContent sx={{ p: { xs: 2, md: 3 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box>
            <Typography sx={{ fontFamily: SERIF, fontSize: 24 }}>Chọn {item.roleLabel.toLowerCase()} khác</Typography>
            <Typography sx={{ fontSize: 13.5, color: C.muted }}>
              Thay cho: {item.productName} ({money(item.price)}). Các món còn lại của bộ giữ nguyên.
            </Typography>
          </Box>
          <IconButton onClick={onClose} aria-label="Đóng">
            ✕
          </IconButton>
        </Box>

        {list === null ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress sx={{ color: C.ink }} />
          </Box>
        ) : list.length === 0 ? (
          <Typography sx={{ color: error ? C.accent : C.muted, py: 3 }}>
            {error || `Chưa có ${item.roleLabel.toLowerCase()} nào khác phù hợp (còn hàng, đúng size và màu bạn chọn).`}
          </Typography>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 2 }}>
            {list.map(({ item: alt, newTotal, withinBudget, matchesOccasion }) => (
              <Box
                key={alt.detailId}
                component="button"
                type="button"
                disabled={!withinBudget}
                onClick={() => onChoose(alt)}
                sx={{
                  p: 0,
                  border: `1px solid ${C.line}`,
                  borderRadius: '12px',
                  bgcolor: '#fff',
                  textAlign: 'left',
                  font: 'inherit',
                  cursor: withinBudget ? 'pointer' : 'not-allowed',
                  opacity: withinBudget ? 1 : 0.5,
                  overflow: 'hidden',
                  transition: 'border-color .15s',
                  '&:hover:enabled': { borderColor: C.ink }
                }}
              >
                <Box sx={{ aspectRatio: '3 / 4', bgcolor: C.photo, position: 'relative' }}>
                  {alt.imageUrl && (
                    <Box
                      component="img"
                      src={alt.imageUrl}
                      alt={alt.productName}
                      sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  )}
                  {matchesOccasion && (
                    <Typography
                      sx={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        bgcolor: C.ink,
                        color: '#fff',
                        fontSize: 10.5,
                        fontWeight: 700,
                        px: 0.75,
                        borderRadius: '6px'
                      }}
                    >
                      Hợp dịp
                    </Typography>
                  )}
                </Box>
                <Box sx={{ p: 1.25 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.3 }}>{alt.productName}</Typography>
                  <Typography sx={{ fontSize: 12, color: C.muted }}>
                    {alt.color} · {alt.sizeNote}
                  </Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: 13.5, mt: 0.5 }}>{money(alt.price)}</Typography>
                  <Typography sx={{ fontSize: 12, color: withinBudget ? C.muted : C.accent }}>
                    {withinBudget ? `Cả bộ: ${money(newTotal)}` : `Vượt ngân sách ${money(newTotal - budget)}`}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 1, mt: 2.5, flexWrap: 'wrap' }}>
          <Button
            onClick={onAuto}
            sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, px: 2.5, border: `1.5px solid ${C.ink}`, color: C.ink }}
          >
            Để hệ thống tự chọn
          </Button>
          <Button onClick={onClose} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 600, color: C.muted }}>
            Giữ món cũ
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
