import { useEffect, useState } from 'react';
import { Box, Button, Chip, TextField, Typography } from '@mui/material';
import { C, cardSx, primaryButtonSx } from 'features/customer/theme';
import { getOutfitOptions, getStyleProfile, saveStyleProfile } from './api';

const chipSx = (on) => ({
  fontWeight: 600,
  borderRadius: '10px',
  border: `1.5px solid ${on ? C.cyan : C.border}`,
  bgcolor: on ? C.cyan : '#fff',
  color: on ? C.cyanInk : C.text
});

/**
 * Hồ sơ phong cách (trang "Số đo của tôi"): năm sinh, nghề nghiệp, phong cách thích, màu tránh.
 * Dùng khi phối đồ / tư vấn. Lưu được sau khi đã lưu số đo (cùng một hồ sơ). hasBodyProfile = đã lưu số đo.
 */
export default function StyleProfileCard({ hasBodyProfile }) {
  const [options, setOptions] = useState(null);
  const [form, setForm] = useState({ birthYear: '', occupation: '', preferredStyles: [], avoidText: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const fill = (p) =>
    setForm({
      birthYear: p.birthYear ?? '',
      occupation: p.occupation ?? '',
      preferredStyles: p.preferredStyles ?? [],
      avoidText: (p.avoidColors ?? []).join(', ')
    });

  useEffect(() => {
    getOutfitOptions()
      .then(setOptions)
      .catch(() => setOptions(null));
    getStyleProfile()
      .then(fill)
      .catch(() => {});
  }, [hasBodyProfile]);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setMessage({ type: '', text: '' });
  };

  const save = async () => {
    setSaving(true);
    try {
      fill(
        await saveStyleProfile({
          birthYear: form.birthYear === '' ? null : Number(form.birthYear),
          occupation: form.occupation,
          preferredStyles: form.preferredStyles,
          avoidColors: form.avoidText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        })
      );
      setMessage({ type: 'success', text: 'Đã lưu phong cách.' });
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Không lưu được.' });
    } finally {
      setSaving(false);
    }
  };

  if (!options) return null;

  return (
    <Box sx={{ ...cardSx, p: { xs: 2.5, md: 4 }, mt: 3 }}>
      <Typography sx={{ fontWeight: 800, fontSize: 16 }}>Phong cách của bạn</Typography>
      <Typography sx={{ fontSize: 13, color: C.muted, mt: 0.5, mb: 2 }}>Giúp THORS phối đồ hợp với bạn hơn. Đều không bắt buộc.</Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 2 }}>
        <TextField
          label="Năm sinh"
          size="small"
          value={form.birthYear}
          onChange={(e) => set('birthYear', e.target.value.replace(/\D/g, '').slice(0, 4))}
          autoComplete="off"
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
        />
        <TextField
          label="Nghề nghiệp"
          size="small"
          placeholder="vd: nhân viên văn phòng"
          value={form.occupation}
          onChange={(e) => set('occupation', e.target.value.slice(0, 60))}
          autoComplete="off"
        />
      </Box>

      <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 1 }}>Phong cách bạn thích</Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {Object.entries(options.styles).map(([code, label]) => (
          <Chip
            key={code}
            label={label}
            clickable
            onClick={() =>
              set(
                'preferredStyles',
                form.preferredStyles.includes(code) ? form.preferredStyles.filter((c) => c !== code) : [...form.preferredStyles, code]
              )
            }
            sx={chipSx(form.preferredStyles.includes(code))}
          />
        ))}
      </Box>

      <TextField
        fullWidth
        label="Màu muốn tránh"
        size="small"
        placeholder="vd: đỏ, vàng"
        value={form.avoidText}
        onChange={(e) => set('avoidText', e.target.value)}
        autoComplete="off"
      />

      {message.text && (
        <Typography sx={{ mt: 2, fontSize: 13.5, fontWeight: 600, color: message.type === 'error' ? C.error : C.teal }}>
          {message.text}
        </Typography>
      )}
      <Box sx={{ mt: 2.5 }}>
        <Button onClick={save} disabled={saving || !hasBodyProfile} sx={primaryButtonSx}>
          {saving ? 'Đang lưu…' : 'Lưu phong cách'}
        </Button>
        {!hasBodyProfile && (
          <Typography component="span" sx={{ ml: 1.5, fontSize: 13, color: C.muted }}>
            Hãy lưu số đo trước.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
