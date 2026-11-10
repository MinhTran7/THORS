import { useEffect, useState } from 'react';
import { Autocomplete, Box, CircularProgress, TextField, Typography } from '@mui/material';
import { CheckCircleFilled, EnvironmentOutlined, ExclamationCircleFilled, InfoCircleFilled } from '@ant-design/icons';

import { fetchProvinces, fetchWards } from '../cart/vnAddress';
import { filterByName } from './addressParser';

// Màu theo Design System THORS
const C = {
  text: '#1E293B',
  muted: '#64748B',
  border: '#E2E8F0',
  cyan: '#8EECF5',
  error: '#EF4444'
};

const labelSx = { fontSize: 12.5, fontWeight: 600, color: C.text, mb: 0.5 };

const inputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px',
    fontSize: 12.5,
    bgcolor: '#fff',
    '& fieldset': { borderColor: C.border },
    '&:hover fieldset': { borderColor: C.cyan },
    '&.Mui-focused fieldset': { borderColor: C.cyan }
  },
  '& .MuiFormHelperText-root': { mx: 0.25, fontSize: 11 }
};

// Kết quả kiểm tra trên bản đồ => màu + nội dung hiển thị
const CHECK_VIEW = {
  HOUSE: { bg: '#E7F6F1', color: '#168B70', icon: <CheckCircleFilled />, text: 'Tìm thấy chính xác trên bản đồ.' },
  STREET: { bg: '#E7F6F1', color: '#168B70', icon: <CheckCircleFilled />, text: 'Tìm thấy tên đường trên bản đồ (chưa có số nhà).' },
  AREA: {
    bg: '#FFF7AE',
    color: '#713F12',
    icon: <InfoCircleFilled />,
    text: 'Chỉ khớp tới phường/xã — nên hỏi lại khách số nhà, tên đường cho rõ.'
  },
  NOT_FOUND: {
    bg: '#FEE2E2',
    color: '#B91C1C',
    icon: <ExclamationCircleFilled />,
    text: 'Không tìm thấy trên bản đồ. Owner sẽ không xác nhận được đơn — hãy kiểm tra lại với khách.'
  },
  UNAVAILABLE: {
    bg: '#F1F5F9',
    color: C.muted,
    icon: <InfoCircleFilled />,
    text: 'Dịch vụ bản đồ (Goong / OpenStreetMap) không phản hồi, chưa kiểm tra được. Vẫn tạo đơn được.'
  }
};

/**
 * Địa chỉ giao hàng 3 phần (Tỉnh/Thành phố → Phường/Xã → Số nhà, tên đường), cùng địa giới 2 cấp với
 * trang thanh toán web. value = { province, ward, street }; province/ward là { code, name } hoặc null.
 * check = kết quả kiểm tra bản đồ { status, precision, loading } do trang cha quản lý.
 */
export default function ShippingAddressFields({ value, onChange, showErrors, check }) {
  const { province, ward, street } = value;
  const [provinces, setProvinces] = useState([]);
  const [wards, setWards] = useState([]);
  const [loadingWards, setLoadingWards] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    fetchProvinces()
      .then((list) => active && setProvinces(list))
      .catch(() => active && setLoadError('Không tải được danh sách tỉnh/thành phố. Kiểm tra kết nối mạng.'));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setWards([]);
    if (!province?.code) return undefined;
    setLoadingWards(true);
    fetchWards(province.code)
      .then((list) => active && setWards(list))
      .catch(() => active && setLoadError('Không tải được danh sách phường/xã. Kiểm tra kết nối mạng.'))
      .finally(() => active && setLoadingWards(false));
    return () => {
      active = false;
    };
  }, [province?.code]);

  const provinceError = showErrors && !province;
  const wardError = showErrors && !ward;
  const streetError = showErrors && String(street ?? '').trim().length < 2;

  const view =
    check?.status === 'ERROR'
      ? { ...CHECK_VIEW.UNAVAILABLE, text: `Chưa kiểm tra được địa chỉ: ${check.message}` }
      : check?.status && (check.status === 'FOUND' ? CHECK_VIEW[check.precision] : CHECK_VIEW[check.status]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={labelSx}>
            Tỉnh / Thành phố{' '}
            <Box component="span" sx={{ color: C.error }}>
              *
            </Box>
          </Typography>
          <Autocomplete
            size="small"
            options={provinces}
            value={province}
            onChange={(_, next) => onChange({ province: next, ward: null, street })}
            getOptionLabel={(option) => option?.name ?? ''}
            isOptionEqualToValue={(option, selected) => option.code === selected.code}
            filterOptions={(options, state) => filterByName(options, state.inputValue)}
            noOptionsText="Không tìm thấy"
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Chọn tỉnh..."
                error={provinceError}
                helperText={provinceError ? 'Chọn tỉnh/thành phố' : ''}
                sx={inputSx}
              />
            )}
          />
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <Typography sx={labelSx}>
            Phường / Xã{' '}
            <Box component="span" sx={{ color: C.error }}>
              *
            </Box>
          </Typography>
          <Autocomplete
            size="small"
            options={wards}
            value={ward}
            disabled={!province}
            loading={loadingWards}
            onChange={(_, next) => onChange({ province, ward: next, street })}
            getOptionLabel={(option) => option?.name ?? ''}
            isOptionEqualToValue={(option, selected) => option.code === selected.code}
            filterOptions={(options, state) => filterByName(options, state.inputValue)}
            noOptionsText="Không tìm thấy"
            loadingText="Đang tải..."
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={province ? 'Chọn phường/xã...' : 'Chọn tỉnh trước'}
                error={wardError}
                helperText={wardError ? 'Chọn phường/xã' : ''}
                sx={inputSx}
              />
            )}
          />
        </Box>
      </Box>

      <Box>
        <Typography sx={labelSx}>
          Số nhà, tên đường{' '}
          <Box component="span" sx={{ color: C.error }}>
            *
          </Box>
        </Typography>
        <TextField
          fullWidth
          size="small"
          placeholder="VD: 12 Lê Lợi / Thôn Đông"
          value={street}
          onChange={(event) => onChange({ province, ward, street: event.target.value })}
          error={streetError}
          helperText={streetError ? 'Nhập số nhà, tên đường hoặc thôn/xóm' : ''}
          slotProps={{ htmlInput: { maxLength: 150 } }}
          sx={inputSx}
        />
      </Box>

      {loadError && <Typography sx={{ fontSize: 11.5, color: C.error }}>{loadError}</Typography>}

      {/* Kết quả kiểm tra trên bản đồ (tự chạy khi đủ 3 phần) */}
      {check?.loading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 11.5, color: C.muted }}>
          <CircularProgress size={12} sx={{ color: C.muted }} />
          Đang kiểm tra địa chỉ trên bản đồ...
        </Box>
      )}
      {!check?.loading && view && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 0.75,
            px: 1.25,
            py: 0.75,
            borderRadius: '8px',
            bgcolor: view.bg,
            color: view.color,
            fontSize: 11.5,
            fontWeight: 600,
            lineHeight: 1.45
          }}
        >
          <Box component="span" sx={{ fontSize: 13, lineHeight: 1, mt: '1px' }}>
            {view.icon}
          </Box>
          <Box component="span">
            {view.text}
            {check.matchedAddress && check.status === 'FOUND' && (
              <Box component="span" sx={{ display: 'block', fontWeight: 500, opacity: 0.85, mt: 0.25 }}>
                <EnvironmentOutlined /> {check.matchedAddress}
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}
