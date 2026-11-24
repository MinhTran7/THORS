import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Slider, Typography } from '@mui/material';
import { C } from 'features/shop/storeTheme';
import { cardSx, outlineButtonSx } from 'features/customer/theme';

const GENDERS = [
  ['FEMALE', 'Nữ'],
  ['MALE', 'Nam']
];

// Thanh kéo chỉnh dáng tạm thời (không lưu). Khoảng kéo nằm trong khoảng hợp lệ của "Số đo của tôi" (BodyProfileService),
// thu hẹp lại quanh vùng người mẫu co giãn được để dáng không bị méo.
const SLIDERS = [
  { key: 'heightCm', label: 'Chiều cao', unit: 'cm', min: 140, max: 200, fallback: 165 },
  { key: 'weightKg', label: 'Cân nặng', unit: 'kg', min: 35, max: 130, fallback: 58 },
  { key: 'chestCm', label: 'Vòng ngực', unit: 'cm', min: 65, max: 130, fallback: 88 },
  { key: 'waistCm', label: 'Vòng eo', unit: 'cm', min: 50, max: 120, fallback: 70 },
  { key: 'hipCm', label: 'Vòng hông', unit: 'cm', min: 70, max: 135, fallback: 94 }
];

const toNumber = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')));

/**
 * Số đo của người mẫu trong Phòng thử đồ: lấy từ "Số đo của tôi", kéo để thử dáng khác (chỉ trên trang này).
 * Muốn lưu hẳn thì sang trang Số đo của tôi - không lưu ở đây để khỏi trùng chức năng.
 */
export default function BodyProfilePanel({ measurements, hasSaved, changed, onChange, onReset }) {
  return (
    <Box sx={{ ...cardSx, p: 2.5 }}>
      <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Dáng người mẫu</Typography>
      <Typography sx={{ fontSize: 13, color: C.muted, mb: 2 }}>
        {hasSaved
          ? 'Theo số đo bạn đã lưu. Kéo để thử dáng khác (không lưu lại).'
          : 'Bạn chưa lưu số đo, người mẫu đang ở dáng chuẩn. Kéo để chỉnh cho giống bạn.'}
      </Typography>

      <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 1 }}>Giới tính</Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        {GENDERS.map(([key, label]) => {
          const on = measurements.gender === key;
          return (
            <Button
              color="inherit"
              key={key}
              onClick={() => onChange('gender', key)}
              aria-pressed={on}
              sx={{
                ...outlineButtonSx,
                height: 38,
                px: 2.5,
                ...(on && {
                  bgcolor: C.primary,
                  borderColor: C.primary,
                  color: '#fff',
                  '&:hover': { bgcolor: C.primaryDark, borderColor: C.primaryDark, color: '#fff' }
                })
              }}
            >
              {label}
            </Button>
          );
        })}
      </Box>

      {SLIDERS.map(({ key, label, unit, min, max, fallback }) => {
        const value = toNumber(measurements[key]);
        return (
          <Box key={key} sx={{ mb: 0.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
              <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 600 }}>
                {label}
              </Typography>
              <Typography component="span" sx={{ fontSize: 13.5, color: value === null ? C.muted : C.ink }}>
                {value === null ? 'chưa có (ước lượng)' : `${value} ${unit}`}
              </Typography>
            </Box>
            <Slider
              size="small"
              min={min}
              max={max}
              step={1}
              value={Math.min(max, Math.max(min, value ?? fallback))}
              onChange={(_, v) => onChange(key, v)}
              disabled={!measurements.gender}
              aria-label={label}
              sx={{ color: C.primary, py: 1.25 }}
            />
          </Box>
        );
      })}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
        {hasSaved && changed && (
          <Button color="inherit" onClick={onReset} sx={{ ...outlineButtonSx, height: 38, fontSize: 13.5 }}>
            Về số đo đã lưu
          </Button>
        )}
        <Button color="inherit" component={RouterLink} to="/body-profile" sx={{ ...outlineButtonSx, height: 38, fontSize: 13.5 }}>
          {hasSaved ? 'Sửa số đo của tôi' : 'Nhập số đo của tôi'}
        </Button>
      </Box>
    </Box>
  );
}
