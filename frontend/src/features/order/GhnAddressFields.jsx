import { useEffect, useRef } from 'react';
import useSWR from 'swr';
import { Alert, Autocomplete, Box, CircularProgress, InputAdornment, MenuItem, TextField, Typography } from '@mui/material';
import { Stack } from 'features/account/components/Flex';
import { brand } from 'features/account/tokens';
import { ghnApi } from './api';

export const DEFAULT_WEIGHT_G = 500;

const swrOnce = { revalidateOnFocus: false, revalidateIfStale: false };
const fieldSx = { select: { sx: { borderRadius: '10px' } } };

/** So tên không phân biệt dấu / hoa thường, để gõ "vung tau" vẫn ra "Phường Vũng Tàu". */
const plain = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

/**
 * Chọn Tỉnh / Phường-Xã theo danh mục GHN (địa giới mới 2 cấp, không còn Quận/Huyện) và cân nặng kiện
 * hàng khi gửi đơn qua GHN. Hệ thống tự điền theo địa chỉ của khách, chủ shop kiểm tra lại.
 * value = { provinceId, wardId, weightG }.
 */
export default function GhnAddressFields({ orderId, value, onChange }) {
  const v = value ?? {};
  const set = (patch) => onChange({ ...v, ...patch });

  // Khoá "-2cap": không dùng lại danh mục 3 cấp cũ còn trong bộ nhớ đệm của trang (mã tỉnh cũ khác mã mới)
  const suggestion = useSWR(['ghn-suggest-2cap', orderId], () => ghnApi.suggest(orderId), swrOnce);
  const provinces = useSWR(['ghn-provinces-2cap'], () => ghnApi.provinces(), swrOnce);
  const wards = useSWR(v.provinceId ? ['ghn-wards-2cap', v.provinceId] : null, () => ghnApi.wards(v.provinceId), swrOnce);

  // Điền sẵn theo gợi ý một lần, khi chủ shop chưa tự chọn
  const filled = useRef(false);
  useEffect(() => {
    const s = suggestion.data;
    if (!s || filled.current) return;
    filled.current = true;
    onChange({
      provinceId: s.provinceId ?? '',
      wardId: s.wardId ?? '',
      weightG: v.weightG ?? DEFAULT_WEIGHT_G
    });
  }, [suggestion.data, onChange, v.weightG]);

  const loadError = provinces.error || wards.error;
  const weightInvalid = !(Number(v.weightG) > 0);
  const wardOptions = wards.data ?? [];
  const selectedWard = wardOptions.find((w) => String(w.id) === String(v.wardId)) ?? null;

  return (
    <Box sx={{ mt: 1.5, p: 1.5, border: `1px solid ${brand.line}`, borderRadius: '10px' }}>
      <Typography variant="body2" sx={{ fontWeight: 600, color: brand.ink }}>
        Địa chỉ theo GHN
      </Typography>
      <Typography variant="caption" sx={{ color: brand.muted, display: 'block', mb: 1 }}>
        Theo địa giới mới (Tỉnh/Thành và Phường/Xã). Hệ thống đã điền theo địa chỉ của khách, vui lòng kiểm tra trước khi gửi.
      </Typography>

      {suggestion.isLoading && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, color: brand.muted }}>
          <CircularProgress size={14} />
          <Typography variant="body2">Đang tìm địa chỉ tương ứng trên GHN…</Typography>
        </Stack>
      )}

      {suggestion.data && !suggestion.data.wardId && (
        <Alert severity="warning" sx={{ mb: 1, borderRadius: '8px' }}>
          Không tự tìm được {suggestion.data.provinceId ? 'Phường/Xã' : 'Tỉnh/Thành và Phường/Xã'} trên GHN, vui lòng chọn tay.
        </Alert>
      )}
      {(suggestion.error || loadError) && (
        <Alert severity="error" sx={{ mb: 1, borderRadius: '8px' }}>
          {(suggestion.error || loadError).message || 'Không tải được danh mục địa chỉ GHN.'}
        </Alert>
      )}

      <TextField
        select
        fullWidth
        margin="dense"
        size="small"
        label="Tỉnh / Thành phố"
        value={provinces.data ? String(v.provinceId ?? '') : ''}
        onChange={(e) => set({ provinceId: e.target.value, wardId: '' })}
        disabled={!provinces.data}
        slotProps={fieldSx}
      >
        {(provinces.data ?? []).map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.name}
          </MenuItem>
        ))}
      </TextField>

      <Autocomplete
        size="small"
        options={wardOptions}
        value={selectedWard}
        onChange={(_, next) => set({ wardId: next ? next.id : '' })}
        getOptionLabel={(option) => option?.name ?? ''}
        isOptionEqualToValue={(option, selected) => String(option.id) === String(selected.id)}
        filterOptions={(options, state) => options.filter((o) => plain(o.name).includes(plain(state.inputValue.trim())))}
        disabled={!v.provinceId || !wards.data}
        loading={wards.isLoading}
        noOptionsText="Không tìm thấy"
        loadingText="Đang tải…"
        renderInput={(params) => <TextField {...params} margin="dense" label="Phường / Xã" placeholder="Gõ để tìm…" />}
      />

      <TextField
        fullWidth
        margin="dense"
        size="small"
        type="number"
        label="Cân nặng kiện hàng"
        value={v.weightG ?? DEFAULT_WEIGHT_G}
        onChange={(e) => set({ weightG: e.target.value === '' ? '' : Number(e.target.value) })}
        error={weightInvalid}
        helperText={weightInvalid ? 'Nhập cân nặng lớn hơn 0.' : 'GHN sẽ cân lại khi lấy hàng; khai thiếu có thể bị tính thêm phí.'}
        slotProps={{ input: { endAdornment: <InputAdornment position="end">gram</InputAdornment> }, htmlInput: { min: 1, step: 50 } }}
      />
    </Box>
  );
}

/** Đã đủ thông tin để gửi GHN chưa. */
export const ghnReady = (v) => Boolean(v?.provinceId && v?.wardId && Number(v?.weightG) > 0);
