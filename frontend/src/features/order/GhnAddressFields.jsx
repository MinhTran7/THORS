import { useEffect, useRef } from 'react';
import useSWR from 'swr';
import { Alert, Box, CircularProgress, InputAdornment, MenuItem, TextField, Typography } from '@mui/material';
import { Stack } from 'features/account/components/Flex';
import { brand } from 'features/account/tokens';
import { ghnApi } from './api';

export const DEFAULT_WEIGHT_G = 500;

const swrOnce = { revalidateOnFocus: false, revalidateIfStale: false };
const fieldSx = { select: { sx: { borderRadius: '10px' } } };

/**
 * Chọn Tỉnh / Quận-Huyện / Phường-Xã theo danh mục GHN và cân nặng kiện hàng khi gửi đơn qua GHN.
 * GHN vẫn dùng địa giới 3 cấp cũ, còn khách nhập địa chỉ 2 cấp mới, nên hệ thống tự gợi ý theo tên
 * và chủ shop kiểm tra lại. value = { provinceId, districtId, wardCode, weightG }.
 */
export default function GhnAddressFields({ orderId, value, onChange }) {
  const v = value ?? {};
  const set = (patch) => onChange({ ...v, ...patch });

  const suggestion = useSWR(['ghn-suggest', orderId], () => ghnApi.suggest(orderId), swrOnce);
  const provinces = useSWR(['ghn-provinces'], () => ghnApi.provinces(), swrOnce);
  const districts = useSWR(v.provinceId ? ['ghn-districts', v.provinceId] : null, () => ghnApi.districts(v.provinceId), swrOnce);
  const wards = useSWR(v.districtId ? ['ghn-wards', v.districtId] : null, () => ghnApi.wards(v.districtId), swrOnce);

  // Điền sẵn theo gợi ý một lần, khi chủ shop chưa tự chọn
  const filled = useRef(false);
  useEffect(() => {
    const s = suggestion.data;
    if (!s || filled.current) return;
    filled.current = true;
    onChange({
      provinceId: s.provinceId ?? '',
      districtId: s.districtId ?? '',
      wardCode: s.wardCode ?? '',
      weightG: v.weightG ?? DEFAULT_WEIGHT_G
    });
  }, [suggestion.data, onChange, v.weightG]);

  const candidates = suggestion.data?.candidates ?? [];
  const loadError = provinces.error || districts.error || wards.error;
  const weightInvalid = !(Number(v.weightG) > 0);

  return (
    <Box sx={{ mt: 1.5, p: 1.5, border: `1px solid ${brand.line}`, borderRadius: '10px' }}>
      <Typography variant="body2" sx={{ fontWeight: 600, color: brand.ink }}>
        Địa chỉ theo GHN
      </Typography>
      <Typography variant="caption" sx={{ color: brand.muted, display: 'block', mb: 1 }}>
        GHN vẫn dùng Quận/Huyện cũ. Hệ thống đã gợi ý theo địa chỉ của khách, vui lòng kiểm tra trước khi gửi.
      </Typography>

      {suggestion.isLoading && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, color: brand.muted }}>
          <CircularProgress size={14} />
          <Typography variant="body2">Đang tìm địa chỉ tương ứng trên GHN…</Typography>
        </Stack>
      )}

      {suggestion.data && !suggestion.data.wardCode && candidates.length > 1 && (
        <Alert severity="info" sx={{ mb: 1, borderRadius: '8px' }}>
          Có {candidates.length} xã/phường trùng tên: {candidates.map((c) => `${c.wardName} (${c.districtName})`).join(', ')}. Vui lòng chọn đúng
          Quận/Huyện.
        </Alert>
      )}
      {suggestion.data && !suggestion.data.wardCode && candidates.length <= 1 && (
        <Alert severity="warning" sx={{ mb: 1, borderRadius: '8px' }}>
          Không tự tìm được Phường/Xã trên GHN, vui lòng chọn tay.
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
        onChange={(e) => set({ provinceId: e.target.value, districtId: '', wardCode: '' })}
        disabled={!provinces.data}
        slotProps={fieldSx}
      >
        {(provinces.data ?? []).map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.name}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        select
        fullWidth
        margin="dense"
        size="small"
        label="Quận / Huyện"
        value={districts.data ? String(v.districtId ?? '') : ''}
        onChange={(e) => set({ districtId: e.target.value, wardCode: '' })}
        disabled={!v.provinceId || !districts.data}
        slotProps={fieldSx}
      >
        {(districts.data ?? []).map((d) => (
          <MenuItem key={d.id} value={d.id}>
            {d.name}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        select
        fullWidth
        margin="dense"
        size="small"
        label="Phường / Xã"
        value={wards.data ? String(v.wardCode ?? '') : ''}
        onChange={(e) => set({ wardCode: e.target.value })}
        disabled={!v.districtId || !wards.data}
        slotProps={fieldSx}
      >
        {(wards.data ?? []).map((w) => (
          <MenuItem key={w.id} value={w.id}>
            {w.name}
          </MenuItem>
        ))}
      </TextField>

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
export const ghnReady = (v) => Boolean(v?.districtId && v?.wardCode && Number(v?.weightG) > 0);
