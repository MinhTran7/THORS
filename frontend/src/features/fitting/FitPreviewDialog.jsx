import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, Dialog, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material';
import { CloseOutlined } from '@ant-design/icons';
import { C } from 'features/shop/storeTheme';
import { Link as RouterLink } from 'react-router-dom';
import { getBodyProfile } from './api';
import { describeFit } from './fitText';

// Thư viện 3D chỉ tải khi mở hộp thoại
const AvatarViewer = lazy(() => import('./avatar/AvatarViewer'));

// Màu độ vừa: vừa / lệch ít / chật / rộng
const COLORS = { FIT: '#1F9D62', SLIGHT: '#E0A21B', TIGHT: '#D64545', LOOSE: '#3B7DDD' };
const LEGEND = [
  ['FIT', 'Vừa'],
  ['SLIGHT', 'Hơi lệch'],
  ['TIGHT', 'Chật'],
  ['LOOSE', 'Rộng']
];
// Số đo trong bảng size -> vùng tô màu trên người mẫu 3D
const ZONES = [
  { measure: 'chest', zone: 'bust', label: 'Ngực' },
  { measure: 'waist', zone: 'waist', label: 'Eo' },
  { measure: 'hip', zone: 'hips', label: 'Hông' }
];

/**
 * "Thử trên dáng của bạn": hình 3D theo số đo đã lưu + vòng đo tô màu theo size đang chọn.
 * guide: dữ liệu GET /shop/products/{id}/size-guide (bảng size + gợi ý từng size).
 */
export default function FitPreviewDialog({ open, onClose, guide, initialSize, onChoose }) {
  const [profile, setProfile] = useState(null);
  const [size, setSize] = useState(initialSize);

  useEffect(() => {
    if (!open) return;
    setSize(initialSize);
    getBodyProfile()
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [open, initialSize]);

  const sizes = guide.chart.map((r) => r.sizeLabel);
  const current = guide.recommendation?.sizes?.find((s) => s.size === size);
  const row = guide.chart.find((r) => r.sizeLabel === size);
  const lines = useMemo(() => (current?.details ?? []).map((d) => ({ ...d, ...describeFit(d) })), [current]);
  // Vùng tô màu: số đo có trong bảng size của size này; khách chưa nhập -> nhãn xám, không tô
  const missing = ZONES.filter((z) => row?.[`${z.measure}Min`] != null && !lines.some((d) => d.measure === z.measure));
  const fit = useMemo(() => {
    const zones = {};
    for (const z of ZONES) {
      const d = lines.find((l) => l.measure === z.measure);
      if (d) zones[z.zone] = { color: COLORS[d.tone], text: d.text };
      else if (row?.[`${z.measure}Min`] != null) zones[z.zone] = { color: null, text: `${z.label}: chưa nhập số đo` };
    }
    return zones;
  }, [lines, row]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pr: 6 }}>
        Thử trên dáng của bạn
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 12, top: 12 }} aria-label="Đóng">
          <CloseOutlined />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 260px' }, gap: 2.5 }}>
          <Box
            sx={{
              height: { xs: 380, md: 500 },
              borderRadius: '14px',
              overflow: 'hidden',
              background: 'linear-gradient(180deg, #F7F5F2 0%, #ECE8E2 100%)'
            }}
          >
            {profile ? (
              <Suspense fallback={null}>
                <AvatarViewer profile={profile} fit={fit} />
              </Suspense>
            ) : (
              <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', color: C.muted, fontSize: 14 }}>Đang tải số đo…</Box>
            )}
          </Box>

          <Box>
            <Typography sx={{ fontWeight: 700, mb: 1 }}>Chọn size để thử</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              {sizes.map((s) => (
                <Chip
                  key={s}
                  label={s === guide.recommendation?.recommendedSize ? `${s} ★` : s}
                  clickable
                  onClick={() => setSize(s)}
                  sx={{
                    fontWeight: 700,
                    borderRadius: '10px',
                    border: `1px solid ${s === size ? C.ink : C.line}`,
                    bgcolor: s === size ? C.ink : '#fff',
                    color: s === size ? '#fff' : C.ink,
                    '&:hover': { bgcolor: s === size ? C.ink : C.sand }
                  }}
                />
              ))}
            </Box>

            <Typography sx={{ fontWeight: 700, mb: 1 }}>Size {size} trên người bạn</Typography>
            {lines.length ? (
              lines.map((d) => (
                <Box key={d.measure} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75, fontSize: 14 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: COLORS[d.tone], flexShrink: 0 }} />
                  {d.text}
                </Box>
              ))
            ) : (
              <Typography sx={{ fontSize: 13.5, color: C.muted }}>Chưa đủ số đo để so với size này.</Typography>
            )}
            {missing.length > 0 && (
              <Typography sx={{ fontSize: 13, color: C.muted, mt: 1 }}>
                Bạn chưa nhập {missing.map((z) => z.label.toLowerCase()).join(', ')} nên vùng đó chưa được tô màu.{' '}
                <Box component={RouterLink} to="/body-profile" sx={{ color: C.accent, fontWeight: 700 }}>
                  Nhập số đo
                </Box>
              </Typography>
            )}

            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 2, fontSize: 12, color: C.muted }}>
              {LEGEND.map(([tone, label]) => (
                <Box key={tone} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: COLORS[tone] }} />
                  {label}
                </Box>
              ))}
            </Box>
            <Typography sx={{ fontSize: 12, color: C.muted, mt: 1.5 }}>
              Hình 3D mô phỏng gần đúng theo số đo bạn đã lưu, không phải hình dáng chính xác.
            </Typography>

            <Button
              fullWidth
              variant="contained"
              disableElevation
              onClick={() => {
                onChoose(size);
                onClose();
              }}
              sx={{
                mt: 2.5,
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: '12px',
                bgcolor: C.ink,
                color: '#fff',
                '&:hover': { bgcolor: '#333', color: '#fff' }
              }}
            >
              Chọn size {size}
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
