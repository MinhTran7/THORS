import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Alert, Box, Button, InputAdornment, Skeleton, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { C } from 'features/shop/storeTheme';
import { FIT_PREFERENCES, MEASURE_RANGES, sizeAdviceApi } from 'features/sizeAdvice/api';
import { accountsApi } from '../api';
import { useBodyMeasurements, useDebounced } from '../hooks';
import { storePanelSx, storePanelTitleSx } from './StoreAccount';

const FIELDS = ['heightCm', 'weightKg', 'footLengthCm'];
const EMPTY = { heightCm: '', weightKg: '', footLengthCm: '', fitPreference: 'REGULAR' };

const toText = (value) => (value == null ? '' : String(value));
const toNumber = (text) => (String(text).trim() === '' ? null : Number(text));

function fieldError(key, text) {
  const { min, max, unit, integer } = MEASURE_RANGES[key];
  if (String(text).trim() === '') return '';
  const n = Number(text);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n)))
    return `Nhập ${integer ? 'số nguyên ' : ''}từ ${min} đến ${max} ${unit}.`;
  return '';
}

function fromSaved(data) {
  if (!data) return EMPTY;
  return {
    heightCm: toText(data.heightCm),
    weightKg: toText(data.weightKg),
    footLengthCm: toText(data.footLengthCm),
    fitPreference: data.fitPreference || 'REGULAR'
  };
}

function SizeBox({ label, size, hint }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, textAlign: 'center', bgcolor: C.sand, borderRadius: '14px', py: 2, px: 1 }}>
      <Box sx={{ fontSize: 12, color: C.muted, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</Box>
      <Box sx={{ fontSize: 32, fontWeight: 800, mt: 0.5, lineHeight: 1.1, color: size ? C.ink : C.muted }}>{size || '—'}</Box>
      {!size && <Box sx={{ fontSize: 11.5, color: C.muted, mt: 0.5 }}>{hint}</Box>}
    </Box>
  );
}

/**
 * Thẻ "Gợi ý size" ở trang Hồ sơ của khách: số đo cơ thể, bàn chân và kiểu mặc ưa thích. Xem trước size
 * chung ngay khi nhập; lưu lại thì trang sản phẩm dùng để gợi ý size theo từng mẫu.
 */
export default function SizeAdvisor() {
  const { data, error: loadError, isLoading, mutate } = useBodyMeasurements();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { severity, text }

  // Điền số đo đã lưu khi tải xong.
  useEffect(() => {
    if (data) setForm(fromSaved(data));
  }, [data]);

  const errors = Object.fromEntries(FIELDS.map((key) => [key, fieldError(key, form[key])]));
  const hasError = FIELDS.some((key) => errors[key]);
  const dirty = JSON.stringify(fromSaved(data)) !== JSON.stringify(form);

  // Xem trước: hỏi backend sau khi ngừng gõ 300 ms. Debounce chuỗi JSON (không phải object) để giá trị
  // ổn định giữa các lần render, tránh vòng lặp cập nhật.
  const paramsKey = useDebounced(
    hasError
      ? ''
      : JSON.stringify({
          heightCm: toNumber(form.heightCm),
          weightKg: toNumber(form.weightKg),
          footLengthCm: toNumber(form.footLengthCm),
          fitPreference: form.fitPreference
        })
  );
  const { data: preview } = useSWR(paramsKey ? ['size-general', paramsKey] : null, () => sizeAdviceApi.general(JSON.parse(paramsKey)), {
    keepPreviousData: true,
    revalidateOnFocus: false
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save() {
    if (saving || hasError) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await accountsApi.updateBodyMeasurements({
        heightCm: toNumber(form.heightCm),
        weightKg: toNumber(form.weightKg),
        footLengthCm: toNumber(form.footLengthCm),
        fitPreference: form.fitPreference
      });
      await mutate(result, { revalidate: false });
      setMessage({ severity: 'success', text: 'Đã lưu. Trang sản phẩm sẽ gợi ý size theo số đo này.' });
    } catch (e) {
      setMessage({ severity: 'error', text: e.message || 'Không lưu được số đo. Vui lòng thử lại.' });
    } finally {
      setSaving(false);
    }
  }

  const input = (key) => {
    const { label, unit, integer } = MEASURE_RANGES[key];
    return (
      <TextField
        key={key}
        label={label}
        value={form[key]}
        onChange={set(key)}
        error={Boolean(errors[key])}
        helperText={errors[key] || ' '}
        type="number"
        size="small"
        fullWidth
        inputProps={{ inputMode: integer ? 'numeric' : 'decimal', step: integer ? 1 : 0.5 }}
        InputProps={{ endAdornment: <InputAdornment position="end">{unit}</InputAdornment> }}
      />
    );
  };

  // Database chưa chạy migration gợi ý size: ẩn cả thẻ, trang Hồ sơ trông như trước khi có tính năng.
  if (loadError?.code === 'SIZE_ADVICE_UNAVAILABLE') return null;

  return (
    <Box component="section" sx={{ ...storePanelSx, p: { xs: 3, sm: 4 } }}>
      <Box component="h2" sx={{ ...storePanelTitleSx, mb: 0.75 }}>
        Số đo & gợi ý size
      </Box>
      <Box sx={{ fontSize: 13, color: C.muted, mb: 2.5, lineHeight: 1.55 }}>
        Lưu số đo một lần, mỗi trang sản phẩm sẽ gợi ý size hợp với bạn. Gợi ý càng chính xác khi bạn đánh giá Chật / Vừa / Rộng cho các món
        đã nhận trong trang đơn hàng.
      </Box>

      {loadError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Chưa tải được số đo đã lưu. Bạn vẫn có thể nhập để xem gợi ý.
        </Alert>
      )}

      {isLoading && !data && !loadError ? (
        <Skeleton variant="rounded" height={120} />
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>{FIELDS.map(input)}</Box>
          <Box sx={{ fontSize: 12, color: C.muted, mt: -0.5, mb: 2, lineHeight: 1.5 }}>
            Đo bàn chân: đứng lên tờ giấy, đánh dấu gót và đầu ngón dài nhất rồi đo khoảng cách.
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
            <Box sx={{ fontSize: 14, color: C.muted }}>Bạn thích mặc áo</Box>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={form.fitPreference}
              onChange={(_, value) => value && setForm((f) => ({ ...f, fitPreference: value }))}
            >
              {FIT_PREFERENCES.map((p) => (
                <ToggleButton key={p.value} value={p.value} sx={{ px: 2.25, textTransform: 'none' }}>
                  {p.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        </>
      )}

      <Box sx={{ display: 'flex', gap: { xs: 1, sm: 2 } }}>
        <SizeBox label="Áo" size={preview?.top} hint="Cần chiều cao, cân nặng" />
        <SizeBox label="Quần" size={preview?.bottom} hint="Cần cân nặng" />
        <SizeBox label="Giày dép" size={preview?.shoe} hint="Cần số đo bàn chân" />
      </Box>
      {preview?.note && <Box sx={{ fontSize: 13, color: C.muted, mt: 1.5, lineHeight: 1.55 }}>{preview.note}</Box>}
      <Box sx={{ fontSize: 12, color: C.muted, mt: 1.5 }}>
        Đây là size theo bảng chung. Ở từng sản phẩm, gợi ý còn tính thêm form của mẫu và đánh giá của khách khác.
      </Box>

      {message && (
        <Alert severity={message.severity} sx={{ mt: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2.5 }}>
        <Button variant="contained" onClick={save} disabled={saving || !dirty || hasError} sx={{ px: 3 }}>
          {saving ? 'Đang lưu…' : 'Lưu số đo'}
        </Button>
      </Box>
    </Box>
  );
}
