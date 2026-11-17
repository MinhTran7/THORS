import { useMemo } from 'react';
import { Box, TextField, Typography } from '@mui/material';
import { C } from '../customer/theme';
import {
  HIGHLIGHTS,
  HighlightIcon,
  MAX_HIGHLIGHTS,
  SPEC_FIELDS,
  parseDescription,
  serializeDescription
} from './productDescription';

/**
 * Ô nhập mô tả sản phẩm có cấu trúc (dùng ở trang Thêm và Sửa sản phẩm).
 * value / onChange là chuỗi lưu vào product.description (xem productDescription.jsx).
 */

const inputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2.5,
    fontSize: 13.5,
    bgcolor: '#FFFFFF',
    '& fieldset': { borderColor: C.border },
    '&:hover fieldset, &.Mui-focused fieldset': { borderColor: C.cyan }
  }
};

function Group({ title, hint, children }) {
  return (
    <Box sx={{ border: `1px solid ${C.border}`, borderRadius: 3, p: { xs: 2, sm: 2.5 }, bgcolor: '#FCFDFD' }}>
      <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>{title}</Typography>
      {hint && <Typography sx={{ fontSize: 12, color: C.muted, mt: 0.25 }}>{hint}</Typography>}
      <Box sx={{ mt: 1.75, display: 'flex', flexDirection: 'column', gap: 1.75 }}>{children}</Box>
    </Box>
  );
}

function Label({ children }) {
  return <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: C.text, mb: 0.5 }}>{children}</Typography>;
}

export default function ProductDescriptionFields({ value, onChange, disabled = false }) {
  const desc = useMemo(() => parseDescription(value), [value]);
  const set = (key, next) => onChange(serializeDescription({ ...desc, [key]: next }));
  const field = (key) => ({ value: desc[key], onChange: (e) => set(key, e.target.value), disabled, fullWidth: true, size: 'small', sx: inputSx });

  const toggleHighlight = (key) => {
    const on = desc.highlights.includes(key);
    if (!on && desc.highlights.length >= MAX_HIGHLIGHTS) return;
    set('highlights', on ? desc.highlights.filter((k) => k !== key) : [...desc.highlights, key]);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Label>Mô tả ngắn</Label>
        <TextField {...field('intro')} multiline minRows={3} placeholder="Giới thiệu ngắn về sản phẩm..." />
      </Box>

      <Group title="Điểm nổi bật" hint={`Bấm để chọn, tối đa ${MAX_HIGHLIGHTS}. Hiện thành biểu tượng trên website.`}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {HIGHLIGHTS.map((h) => {
            const on = desc.highlights.includes(h.key);
            const full = !on && desc.highlights.length >= MAX_HIGHLIGHTS;
            return (
              <Box
                key={h.key}
                component="button"
                type="button"
                aria-pressed={on}
                disabled={disabled || full}
                onClick={() => toggleHighlight(h.key)}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  px: 1.25,
                  py: 0.75,
                  borderRadius: 2,
                  border: `1.5px solid ${on ? C.teal : C.border}`,
                  bgcolor: on ? '#E6F9FB' : '#FFFFFF',
                  color: on ? C.cyanInk : C.text,
                  font: 'inherit',
                  fontSize: 13,
                  fontWeight: on ? 700 : 500,
                  cursor: 'pointer',
                  '&:disabled': { opacity: 0.45, cursor: 'not-allowed' },
                  '&:focus-visible': { outline: `2px solid ${C.teal}`, outlineOffset: 2 }
                }}
              >
                <HighlightIcon highlight={h} size={18} />
                {h.label}
              </Box>
            );
          })}
        </Box>
      </Group>

      <Group title="Chất liệu & kiểu dáng" hint="Để trống ô nào thì website ẩn dòng đó.">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.75 }}>
          {SPEC_FIELDS.map((f) => (
            <Box key={f.key} sx={{ gridColumn: f.multiline ? '1 / -1' : 'auto' }}>
              <Label>{f.label}</Label>
              <TextField {...field(f.key)} placeholder={f.placeholder} multiline={f.multiline} minRows={f.multiline ? 2 : undefined} />
            </Box>
          ))}
        </Box>
      </Group>

      <Group title="Bảo quản" hint="Mỗi dòng là một ý.">
        <TextField {...field('care')} multiline minRows={2} placeholder={'Giặt máy nhẹ - Sấy ở nhiệt độ thấp\nKhông dùng chất tẩy - Không giặt khô'} />
      </Group>

      <Group title="Đổi trả" hint="Mỗi dòng là một ý.">
        <TextField {...field('returns')} multiline minRows={2} placeholder="Ví dụ: Đổi size miễn phí trong 7 ngày nếu còn nguyên tem mác" />
      </Group>
    </Box>
  );
}
