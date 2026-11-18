import { Box, MenuItem, TextField } from '@mui/material';
import { toYmd } from '../format';
import { brand, fs } from '../tokens';
import { FilterField, filterInputSx } from './Blocks';

/**
 * Bộ lọc ngày dùng chung cho MỌI trang danh sách (đồng bộ giao diện và cách chọn ngày).
 *
 *  - <DateRangeFilter>: ô chọn mốc nhanh (Hôm nay, 7 ngày qua...) + hai ô "Từ ngày / Đến ngày" luôn hiện sẵn bên cạnh.
 *    Giá trị dạng { preset, from, to }; from/to chỉ dùng khi preset = 'custom' (người dùng tự chọn ngày).
 *    Lấy khoảng ngày thực tế để gửi lên backend bằng resolveDateRange(value) -> { from, to } (chuỗi yyyy-MM-dd, '' = không giới hạn).
 *  - <DateRangeFields>: chỉ hai ô "Từ ngày / Đến ngày" (cho trang luôn cần một kỳ cụ thể, ví dụ báo cáo).
 */

export const DATE_PRESETS = [
  { value: 'all', label: 'Tất cả thời gian' },
  { value: 'today', label: 'Hôm nay' },
  { value: '7d', label: '7 ngày qua' },
  { value: '30d', label: '30 ngày qua' },
  { value: 'month', label: 'Tháng này' },
  { value: 'custom', label: 'Tùy chọn ngày…' }
];

export const ALL_TIME = { preset: 'all', from: '', to: '' };

const todayYmd = () => toYmd(new Date());

const daysAgo = (n) => {
  const today = new Date();
  return toYmd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n));
};

// "N ngày qua" tính cả hôm nay. Tính lại mỗi lần gọi nên qua nửa đêm vẫn đúng.
export function presetRange(preset) {
  switch (preset) {
    case 'today':
      return { from: daysAgo(0), to: daysAgo(0) };
    case '7d':
      return { from: daysAgo(6), to: daysAgo(0) };
    case '30d':
      return { from: daysAgo(29), to: daysAgo(0) };
    case 'month': {
      const today = new Date();
      return { from: toYmd(new Date(today.getFullYear(), today.getMonth(), 1)), to: daysAgo(0) };
    }
    default:
      return { from: '', to: '' };
  }
}

export const resolveDateRange = (value) => (value.preset === 'custom' ? { from: value.from, to: value.to } : presetRange(value.preset));

const dmy = (ymd) => ymd.split('-').reverse().join('/');

// Mô tả ngắn khoảng ngày đang lọc, ví dụ "Trong 7 ngày qua", "Từ 01/11/2026 đến 15/11/2026".
export function dateRangeCaption(value) {
  const { from, to } = resolveDateRange(value);
  if (value.preset === 'custom') {
    if (from && to) return `Từ ${dmy(from)} đến ${dmy(to)}`;
    if (from) return `Từ ${dmy(from)} đến nay`;
    if (to) return `Đến hết ${dmy(to)}`;
    return 'Toàn bộ thời gian';
  }
  if (value.preset === 'all') return 'Toàn bộ thời gian';
  if (value.preset === 'today') return 'Hôm nay';
  const label = DATE_PRESETS.find((option) => option.value === value.preset)?.label ?? '';
  return `Trong ${label.toLowerCase()}`;
}

// Kiểu cũ (nhãn nổi trong viền) cho các trang kho đang dùng giao diện MUI mặc định
const inlineInputSx = {
  '& .MuiOutlinedInput-root': { bgcolor: brand.surface, borderRadius: '10px', fontSize: fs.body, '& fieldset': { borderColor: brand.line } }
};

const WIDTH = { preset: 180, date: 160 };

/**
 * Hai ô "Từ ngày / Đến ngày". onChange nhận { from, to }. disableFuture: không cho chọn ngày sau hôm nay.
 * Mặc định nhãn nằm phía trên ô (kiểu thanh lọc trang Khuyến mãi); inline: nhãn nổi trong viền như ô MUI thường.
 */
export function DateRangeFields({ from, to, onChange, disableFuture = true, fromLabel = 'Từ ngày', toLabel = 'Đến ngày', inline = false }) {
  const today = disableFuture ? todayYmd() : '';
  // Gõ tay vẫn có thể vượt max của ô date nên chặn thêm ở đây
  const clamp = (value) => (today && value > today ? today : value);
  const fromMax = to && (!today || to < today) ? to : today;

  const field = (label, value, key, min, max) => {
    const input = (
      <TextField
        type="date"
        size="small"
        label={inline ? label : undefined}
        value={value}
        onChange={(event) => onChange({ from, to, [key]: clamp(event.target.value) })}
        slotProps={{
          inputLabel: { shrink: true },
          htmlInput: { min: min || undefined, max: max || undefined, 'aria-label': label }
        }}
        sx={{ ...(inline ? inlineInputSx : filterInputSx), width: WIDTH.date, flexShrink: 0 }}
      />
    );
    return inline ? input : <FilterField label={label}>{input}</FilterField>;
  };

  return (
    <>
      {field(fromLabel, from, 'from', undefined, fromMax)}
      {field(toLabel, to, 'to', from, today)}
    </>
  );
}

/**
 * Ô chọn mốc nhanh (Hôm nay, 7 ngày qua...) + hai ô "Từ ngày / Đến ngày" luôn hiện sẵn.
 * value = { preset, from, to }, onChange nhận giá trị mới cùng dạng.
 *  - Chọn mốc nhanh: hai ô ngày tự điền theo mốc đó để người dùng thấy đang lọc từ ngày nào.
 *  - Sửa trực tiếp ô ngày: chuyển sang 'custom' (ô mốc hiện "Tùy chọn ngày…"); xóa trống cả hai thì về "Tất cả thời gian".
 */
export function DateRangeFilter({ value, onChange, label = 'Thời gian', presets = DATE_PRESETS, disableFuture = true }) {
  const choosePreset = (preset) => onChange({ preset, ...presetRange(preset) });
  const changeDates = (range) => onChange(range.from || range.to ? { preset: 'custom', ...range } : ALL_TIME);
  // Mốc nhanh tính lại mỗi lần render nên qua nửa đêm ô ngày vẫn đúng
  const shown = resolveDateRange(value);

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: { xs: 1.5, lg: 2 }, flexShrink: 0 }}>
      <FilterField label={label}>
        <TextField
          select
          size="small"
          value={value.preset}
          onChange={(event) => choosePreset(event.target.value)}
          slotProps={{ htmlInput: { 'aria-label': label } }}
          sx={{ ...filterInputSx, width: WIDTH.preset, flexShrink: 0 }}
        >
          {presets.map((option) => (
            // "Tùy chọn ngày…" chỉ để hiển thị khi người dùng tự chọn ngày, không chọn được từ danh sách
            <MenuItem key={option.value} value={option.value} sx={{ fontSize: 13.5, ...(option.value === 'custom' && { display: 'none' }) }}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </FilterField>
      <DateRangeFields from={shown.from} to={shown.to} disableFuture={disableFuture} onChange={changeDates} />
    </Box>
  );
}
