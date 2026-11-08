import { useState } from 'react';
import { Box } from '@mui/material';
import { C } from 'features/shop/storeTheme';
import { FIT_OPTIONS, sizeAdviceApi } from './api';

const chipSx = (active) => ({
  px: 1.5,
  py: 0.4,
  fontSize: 12.5,
  fontFamily: 'inherit',
  fontWeight: active ? 700 : 500,
  borderRadius: '999px',
  border: `1px solid ${active ? C.ink : C.line}`,
  bgcolor: active ? C.ink : '#fff',
  color: active ? '#fff' : C.ink,
  cursor: 'pointer',
  '&:disabled': { opacity: 0.6, cursor: 'default' }
});

/**
 * Hỏi khách món này mặc Chật / Vừa / Rộng (dưới mỗi dòng sản phẩm của đơn đã nhận). Bấm lại lựa chọn
 * đang chọn để bỏ đánh giá. onSaved(orderItemId, fit) để trang cha cập nhật cache.
 */
export default function FitFeedback({ orderItemId, value, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function choose(fit) {
    const next = fit === value ? null : fit;
    setBusy(true);
    setError('');
    try {
      await sizeAdviceApi.saveFeedback(orderItemId, next);
      onSaved?.(orderItemId, next);
    } catch (e) {
      setError(e.message || 'Không lưu được đánh giá.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ mt: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
        <Box component="span" sx={{ fontSize: 12.5, color: C.muted, mr: 0.5 }}>
          Size mặc thấy:
        </Box>
        {FIT_OPTIONS.map((o) => (
          <Box
            key={o.value}
            component="button"
            type="button"
            disabled={busy}
            aria-pressed={value === o.value}
            onClick={() => choose(o.value)}
            sx={chipSx(value === o.value)}
          >
            {o.label}
          </Box>
        ))}
      </Box>
      {error && <Box sx={{ fontSize: 12, color: '#B42318', mt: 0.5 }}>{error}</Box>}
    </Box>
  );
}
