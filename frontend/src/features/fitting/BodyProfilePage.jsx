import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  TextField,
  Typography
} from '@mui/material';
import { useCrumbs } from 'layouts/crumbs';
import { StoreAccountShell } from 'features/account/components/StoreAccount';
import { C, cardSx, outlineButtonSx, primaryButtonSx } from 'features/customer/theme';
import { deleteBodyProfile, getBodyProfile, saveBodyProfile } from './api';

// Thư viện 3D khá nặng: chỉ tải khi mở trang này (không làm chậm trang cửa hàng)
const AvatarViewer = lazy(() => import('./avatar/AvatarViewer'));

// Khoảng hợp lệ: giống hệt BodyProfileService (backend) để báo lỗi ngay khi gõ, không phải đợi máy chủ
const FIELDS = [
  { key: 'heightCm', label: 'Chiều cao', unit: 'cm', min: 120, max: 220, required: true },
  { key: 'weightKg', label: 'Cân nặng', unit: 'kg', min: 30, max: 200, required: true },
  { key: 'chestCm', label: 'Vòng ngực', unit: 'cm', min: 60, max: 150, hint: 'Đo vòng quanh chỗ rộng nhất của ngực' },
  { key: 'waistCm', label: 'Vòng eo', unit: 'cm', min: 50, max: 150, hint: 'Đo vòng quanh chỗ nhỏ nhất của eo' },
  { key: 'hipCm', label: 'Vòng hông', unit: 'cm', min: 60, max: 160, hint: 'Đo vòng quanh chỗ rộng nhất của mông' },
  // Dùng để gợi ý size giày dép
  {
    key: 'footLengthCm',
    label: 'Chiều dài bàn chân',
    unit: 'cm',
    min: 9,
    max: 35,
    hint: 'Đứng lên tờ giấy, đo từ gót tới đầu ngón chân dài nhất'
  }
];
const GENDERS = [
  ['MALE', 'Nam'],
  ['FEMALE', 'Nữ']
];
const FITS = [
  ['SLIM', 'Ôm'],
  ['REGULAR', 'Vừa'],
  ['LOOSE', 'Rộng']
];
const EMPTY = { gender: '', heightCm: '', weightKg: '', chestCm: '', waistCm: '', hipCm: '', footLengthCm: '', fitPreference: 'REGULAR' };

const inputSx = (hasError) => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: '14px',
    bgcolor: '#FAFDFD',
    '& fieldset': { borderWidth: '1.5px', borderColor: hasError ? C.error : C.border },
    '&:hover fieldset, &.Mui-focused fieldset': { borderColor: hasError ? C.error : C.cyan }
  }
});

// Nhóm nút chọn một (giới tính, kiểu mặc)
function Choice({ options, value, onChange }) {
  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      {options.map(([key, label]) => (
        <Button
          key={key}
          onClick={() => onChange(key)}
          sx={{ ...outlineButtonSx, height: 40, px: 2.5, ...(value === key && { bgcolor: C.cyan, borderColor: C.cyan, color: C.cyanInk }) }}
        >
          {label}
        </Button>
      ))}
    </Box>
  );
}

// "170,5" hoặc "170.5" -> 170.5 ; ô trống -> null
const toNumber = (text) => (String(text).trim() === '' ? null : Number(String(text).replace(',', '.')));

function validate(form) {
  const errors = {};
  if (!form.gender) errors.gender = 'Vui lòng chọn giới tính.';
  FIELDS.forEach(({ key, label, unit, min, max, required }) => {
    const n = toNumber(form[key]);
    if (n === null) {
      if (required) errors[key] = `${label} là bắt buộc.`;
    } else if (Number.isNaN(n) || n < min || n > max) {
      errors[key] = `${label} phải từ ${min} đến ${max} ${unit}.`;
    }
  });
  return errors;
}

/** Khách nhập / sửa / xóa số đo cơ thể (dùng cho gợi ý size và avatar 3D ở các phase sau). */
export default function BodyProfilePage() {
  useCrumbs(['Tài khoản', 'Số đo của tôi']);
  const [form, setForm] = useState(EMPTY);
  const [saved, setSaved] = useState(null); // hồ sơ đang lưu trên máy chủ (null = chưa có)
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fill = (p) => setForm(p ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, p[k] ?? ''])) : EMPTY);

  useEffect(() => {
    getBodyProfile()
      .then((p) => {
        setSaved(p);
        fill(p);
      })
      .catch((e) => setMessage({ type: 'error', text: e.message }))
      .finally(() => setLoading(false));
  }, []);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setMessage({ type: '', text: '' });
  };

  const save = async () => {
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const body = { gender: form.gender, fitPreference: form.fitPreference };
      FIELDS.forEach(({ key }) => (body[key] = toNumber(form[key])));
      const p = await saveBodyProfile(body);
      setSaved(p);
      fill(p);
      setMessage({ type: 'success', text: 'Đã lưu số đo.' });
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Không lưu được số đo.' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await deleteBodyProfile();
      setSaved(null);
      fill(null);
      setConfirmDelete(false);
      setMessage({ type: 'success', text: 'Đã xóa số đo.' });
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Không xóa được số đo.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <StoreAccountShell title="Số đo của tôi" subtitle="Dùng để gợi ý size phù hợp khi bạn mua quần áo. Chỉ bạn xem được số đo này.">
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress size={36} sx={{ color: C.cyan }} />
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 640px) minmax(280px, 1fr)' },
            gap: 3,
            alignItems: 'start'
          }}
        >
          <Box sx={{ ...cardSx, p: { xs: 2.5, md: 4 } }}>
            <Typography sx={{ fontWeight: 700, mb: 1 }}>Giới tính</Typography>
            <Choice options={GENDERS} value={form.gender} onChange={(v) => set('gender', v)} />
            {errors.gender && <Typography sx={{ color: C.error, fontSize: 13, mt: 0.5 }}>{errors.gender}</Typography>}

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 3 }}>
              {FIELDS.map(({ key, label, unit, required, hint }) => (
                <TextField
                  key={key}
                  label={required ? label : `${label} (không bắt buộc)`}
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value.replace(/[^\d.,]/g, ''))}
                  error={Boolean(errors[key])}
                  helperText={errors[key] || hint || ' '}
                  autoComplete="off"
                  sx={inputSx(errors[key])}
                  slotProps={{
                    htmlInput: { inputMode: 'decimal', maxLength: 5 },
                    input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> }
                  }}
                />
              ))}
            </Box>

            <Typography sx={{ fontWeight: 700, mt: 2, mb: 1 }}>Bạn thích mặc</Typography>
            <Choice options={FITS} value={form.fitPreference} onChange={(v) => set('fitPreference', v)} />

            {message.text && (
              <Typography sx={{ mt: 2.5, fontSize: 13.5, fontWeight: 600, color: message.type === 'error' ? C.error : C.teal }}>
                {message.text}
              </Typography>
            )}

            <Box sx={{ display: 'flex', gap: 1.5, mt: 3, flexWrap: 'wrap' }}>
              <Button onClick={save} disabled={saving} sx={primaryButtonSx}>
                {saving ? 'Đang lưu…' : 'Lưu số đo'}
              </Button>
              {saved && (
                <Button onClick={() => setConfirmDelete(true)} disabled={saving} sx={{ ...outlineButtonSx, color: C.error }}>
                  Xóa số đo
                </Button>
              )}
            </Box>
          </Box>

          {/* Hình 3D xem trước: đổi dáng ngay khi gõ số đo (chưa cần bấm Lưu) */}
          <Box
            sx={{
              ...cardSx,
              height: { xs: 420, md: 560 },
              overflow: 'hidden',
              background: 'linear-gradient(180deg, #F7F5F2 0%, #ECE8E2 100%)'
            }}
          >
            <Suspense fallback={null}>
              <AvatarViewer profile={form} />
            </Suspense>
          </Box>
        </Box>
      )}

      <Dialog open={confirmDelete} onClose={() => !saving && setConfirmDelete(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Xóa số đo?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: C.muted, fontSize: 14 }}>Bạn sẽ không nhận được gợi ý size cho đến khi nhập lại.</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setConfirmDelete(false)} disabled={saving} sx={outlineButtonSx}>
            Quay lại
          </Button>
          <Button
            onClick={remove}
            disabled={saving}
            sx={{ ...primaryButtonSx, bgcolor: C.error, color: '#fff', '&:hover': { bgcolor: '#B83737' } }}
          >
            Xóa
          </Button>
        </DialogActions>
      </Dialog>
    </StoreAccountShell>
  );
}
