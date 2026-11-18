import { useEffect, useState } from 'react';
import { Box, Button, Card, Chip, Typography } from '@mui/material';
import { C, cardSx, primaryButtonSx } from 'features/customer/theme';
import { getOutfitOptions, getProductStyle, saveProductStyle } from './api';

const chipSx = (on) => ({
  fontWeight: 600,
  borderRadius: '10px',
  border: `1px solid ${on ? C.teal : C.border}`,
  bgcolor: on ? '#E6F9FB' : '#fff',
  color: on ? C.cyanInk : C.text
});

/**
 * Thẻ phối đồ của sản phẩm (trang chi tiết sản phẩm, phía quản trị): dịp mặc + phong cách.
 * Chưa gắn -> hiện thẻ hệ thống đoán theo tên (Owner sửa rồi lưu là xong).
 */
export default function ProductStyleEditor({ productId, canEdit }) {
  const [options, setOptions] = useState(null);
  const [occasions, setOccasions] = useState([]);
  const [styles, setStyles] = useState([]);
  const [guessed, setGuessed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const apply = (s) => {
    setOccasions(s.occasions);
    setStyles(s.styles);
    setGuessed(s.guessed);
  };

  useEffect(() => {
    getOutfitOptions()
      .then(setOptions)
      .catch(() => setOptions(null));
    getProductStyle(productId)
      .then(apply)
      .catch((e) => setMessage({ type: 'error', text: e.message }));
  }, [productId]);

  const toggle = (setter) => (code) => {
    if (!canEdit) return;
    setter((list) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]));
    setMessage({ type: '', text: '' });
  };

  const save = async () => {
    setSaving(true);
    try {
      apply(await saveProductStyle(productId, { occasions, styles }));
      setMessage({ type: 'success', text: 'Đã lưu thẻ phối đồ.' });
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Không lưu được.' });
    } finally {
      setSaving(false);
    }
  };

  if (!options) return null;

  const group = (title, entries, selected, onToggle) => (
    <>
      <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: C.text, mb: 1 }}>{title}</Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {Object.entries(entries).map(([code, label]) => (
          <Chip key={code} label={label} clickable={canEdit} onClick={() => onToggle(code)} sx={chipSx(selected.includes(code))} />
        ))}
      </Box>
    </>
  );

  return (
    <Card sx={{ ...cardSx, p: { xs: 2.5, sm: 3.5 }, mt: 2.5 }}>
      <Typography sx={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Phong cách &amp; dịp mặc</Typography>
      <Typography sx={{ fontSize: 13, color: C.muted, mt: 0.5, mb: 2 }}>
        Dùng cho tính năng &quot;Phối đồ cho bạn&quot; trên cửa hàng.
        {guessed && ' Đang dùng thẻ hệ thống tự đoán theo tên sản phẩm. Sửa lại cho đúng rồi bấm Lưu.'}
      </Typography>
      {group('Dịp mặc', options.occasions, occasions, toggle(setOccasions))}
      {group('Phong cách', options.styles, styles, toggle(setStyles))}
      {message.text && (
        <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: message.type === 'error' ? C.error : C.teal, mb: 1.5 }}>
          {message.text}
        </Typography>
      )}
      {canEdit && (
        <Button onClick={save} disabled={saving} sx={primaryButtonSx}>
          {saving ? 'Đang lưu…' : 'Lưu thẻ phối đồ'}
        </Button>
      )}
    </Card>
  );
}
