import { useEffect, useState } from 'react';
import { Box, Typography, TextField, Button, Divider, IconButton, Autocomplete } from '@mui/material';
import { StarFilled, StarOutlined, EnvironmentOutlined, RightOutlined } from '@ant-design/icons';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { SANS } from 'features/shop/storeTheme';
import { fetchProvinces, fetchWards } from '../cart/vnAddress';
import { C, cardSx, outlineButtonSx, primaryButtonSx } from './theme';
import AddressMap, { fullAddress } from './AddressMap';

const EMPTY = { recipientName: '', phone: '', provinceCode: '', wardCode: '', addressDetail: '', isDefault: false };

const inputSx = (hasError) => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: '14px',
    minHeight: 46,
    bgcolor: '#FAFDFD',
    '& fieldset': { borderWidth: '1.5px' },
    '&.Mui-focused fieldset': { borderWidth: '1.5px' },
    '& fieldset': { borderColor: hasError ? C.error : C.border },
    '&:hover fieldset, &.Mui-focused fieldset': { borderColor: hasError ? C.error : C.cyan }
  }
});

function validate(form, province, ward) {
  const errors = {};
  const name = form.recipientName.trim();
  const detail = form.addressDetail.trim();
  if (name.length < 2 || name.length > 100) errors.recipientName = 'Họ và tên người nhận phải từ 2 đến 100 ký tự.';
  if (!/^0\d{9}$/.test(form.phone)) errors.phone = 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng số 0.';
  if (!province) errors.provinceCode = 'Vui lòng chọn Tỉnh/Thành phố.';
  if (!ward) errors.wardCode = 'Vui lòng chọn Phường/Xã.';
  if (detail.length < 2 || detail.length > 255) errors.addressDetail = 'Số nhà, tên đường phải từ 2 đến 255 ký tự.';
  return errors;
}

function Field({ label, error, children, ...props }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#374151', mb: 0.75 }}>{label}</Typography>
      <TextField
        fullWidth
        size="small"
        error={Boolean(error)}
        helperText={error}
        FormHelperTextProps={{ sx: { mx: 0.5, fontSize: 12 } }}
        sx={inputSx(error)}
        {...props}
      >
        {children}
      </TextField>
    </Box>
  );
}

export default function AddressForm({ title, subtitle, submitLabel, initial, lockDefault = false, onSubmit }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ ...EMPTY, ...initial });
  const [provinces, setProvinces] = useState([]);
  const [wards, setWards] = useState([]);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [mapQuery, setMapQuery] = useState('');

  const province = provinces.find((p) => p.code === form.provinceCode);
  const ward = wards.find((w) => w.code === form.wardCode);

  useEffect(() => {
    fetchProvinces()
      .then(setProvinces)
      .catch(() => setError('Không tải được danh sách Tỉnh/Thành phố.'));
  }, []);

  const provinceCode = province?.code;
  const query = province && ward ? fullAddress(form.addressDetail.trim(), ward.name, province.name) : '';

  useEffect(() => {
    const timer = setTimeout(() => setMapQuery(query), 700);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setWards([]);
    if (!provinceCode) return undefined;
    let alive = true;
    fetchWards(provinceCode)
      .then((list) => alive && setWards(list))
      .catch(() => alive && setError('Không tải được danh sách Phường/Xã.'));
    return () => {
      alive = false;
    };
  }, [provinceCode]);

  const change = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate(form, province, ward);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    setError('');
    try {
      await onSubmit({
        recipientName: form.recipientName.trim(),
        phone: form.phone,
        provinceCode: province.code,
        provinceName: province.name,
        wardCode: ward.code,
        wardName: ward.name,
        addressDetail: form.addressDetail.trim(),
        isDefault: form.isDefault
      });
      navigate('/addresses');
    } catch (err) {
      setError(err.message || 'Không thể lưu địa chỉ giao hàng.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ fontFamily: SANS, color: C.text }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 3 }}>
        <Box
          component={RouterLink}
          to="/addresses"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 1,
            color: "#1E293B",
            textDecoration: "none",
            fontSize: 15,
            fontWeight: 600
          }}
        >
          <EnvironmentOutlined style={{ fontSize: 16, color: "#475569" }} />
          <span>Địa chỉ giao hàng</span>
        </Box>
        <RightOutlined style={{ fontSize: 11, color: '#64748B', margin: '0 2px' }} />
        <Typography component="span" sx={{ color: '#D7428B', fontWeight: 700, fontSize: 15 }}>
          {title}
        </Typography>
      </Box>
      <Box component="form" noValidate onSubmit={handleSubmit} sx={{ ...cardSx, boxShadow: 'none', border: `1px solid ${C.border}`, p: { xs: 2.5, sm: 4 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 16 }}>Thông tin giao hàng</Typography>
          <Typography sx={{ fontSize: 12.5, color: C.muted }}>* Thông tin bắt buộc</Typography>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
          <Field
            label="Tên người nhận *"
            placeholder="Nhập họ và tên người nhận"
            value={form.recipientName}
            onChange={(e) => change('recipientName', e.target.value)}
            error={errors.recipientName}
          />
          <Field
            label="Số điện thoại *"
            placeholder="Nhập số điện thoại (10 chữ số)"
            value={form.phone}
            onChange={(e) => change('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
            error={errors.phone}
            inputProps={{ inputMode: 'numeric' }}
          />
        </Box>

        <Divider sx={{ my: 3, borderColor: C.borderLight }} />

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5, mb: 2.5 }}>
          <Box>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#374151', mb: 0.75 }}>
              Tỉnh/Thành phố *
            </Typography>
            <Autocomplete
              options={provinces}
              value={province || null}
              getOptionLabel={(option) => (option ? option.name : '')}
              isOptionEqualToValue={(option, val) => option?.code === val?.code}
              noOptionsText="Không tìm thấy"
              loadingText="Đang tải..."
              loading={!provinces.length}
              onChange={(_, val) => {
                setForm((f) => ({ ...f, provinceCode: val ? val.code : '', wardCode: '' }));
                if (errors.provinceCode) setErrors((e) => ({ ...e, provinceCode: undefined, wardCode: undefined }));
              }}
              slotProps={{ paper: { sx: { borderRadius: '14px', mt: 0.5, boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.1)' } } }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  placeholder="Chọn hoặc gõ tìm Tỉnh/Thành phố"
                  error={Boolean(errors.provinceCode)}
                  helperText={errors.provinceCode}
                  FormHelperTextProps={{ sx: { mx: 0.5, fontSize: 12 } }}
                  sx={inputSx(errors.provinceCode)}
                />
              )}
            />
          </Box>

          <Box>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#374151', mb: 0.75 }}>
              Phường/Xã *
            </Typography>
            <Autocomplete
              options={wards}
              value={ward || null}
              disabled={!form.provinceCode}
              getOptionLabel={(option) => (option ? option.name : '')}
              isOptionEqualToValue={(option, val) => option?.code === val?.code}
              noOptionsText={form.provinceCode ? 'Không tìm thấy' : 'Vui lòng chọn Tỉnh/Thành phố trước'}
              loadingText="Đang tải..."
              onChange={(_, val) => {
                setForm((f) => ({ ...f, wardCode: val ? val.code : '' }));
                if (errors.wardCode) setErrors((e) => ({ ...e, wardCode: undefined }));
              }}
              slotProps={{ paper: { sx: { borderRadius: '14px', mt: 0.5, boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.1)' } } }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  placeholder={form.provinceCode ? 'Chọn hoặc gõ tìm Phường/Xã' : 'Chọn Tỉnh/Thành phố trước'}
                  error={Boolean(errors.wardCode)}
                  helperText={errors.wardCode}
                  FormHelperTextProps={{ sx: { mx: 0.5, fontSize: 12 } }}
                  sx={inputSx(errors.wardCode)}
                />
              )}
            />
          </Box>
        </Box>

        <Field
          label="Số nhà, tên đường *"
          placeholder="Ví dụ: Số 186, đường 72"
          value={form.addressDetail}
          onChange={(e) => change('addressDetail', e.target.value)}
          error={errors.addressDetail}
        />

        {mapQuery && (
          <Box sx={{ mt: 2.5 }}>
            <Typography sx={{ fontSize: 12.5, color: C.muted, mb: 1 }}>
              Vị trí trên bản đồ. Nếu chưa đúng, hãy ghi rõ số nhà, tên đường.
            </Typography>
            <AddressMap query={mapQuery} />
          </Box>
        )}

        <Box
          sx={{
            my: 4,
            p: 2,
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            border: form.isDefault ? '1.5px solid #F2E3B0' : `1.5px solid ${C.border}`,
            bgcolor: form.isDefault ? '#FFF6DA' : '#FAFDFD'
          }}
        >
          <IconButton size="small" disabled={lockDefault} onClick={() => change('isDefault', !form.isDefault)}>
            {form.isDefault ? (
              <StarFilled style={{ fontSize: 24, color: '#EAB308' }} />
            ) : (
              <StarOutlined style={{ fontSize: 24, color: '#94A3B8' }} />
            )}
          </IconButton>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>Đặt làm địa chỉ mặc định</Typography>
            <Typography sx={{ fontSize: 12.5, color: form.isDefault ? '#713F12' : C.muted, mt: 0.25 }}>
              {lockDefault
                ? 'Đây là địa chỉ mặc định hiện tại, được ưu tiên khi thanh toán.'
                : 'Bấm vào ngôi sao để ưu tiên địa chỉ này khi thanh toán.'}
            </Typography>
          </Box>
        </Box>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 2,
            pt: 2,
            borderTop: `1px solid ${C.borderLight}`
          }}
        >
          <Typography sx={{ fontSize: 13, fontWeight: error ? 600 : 400, color: error ? C.error : C.muted }}>
            {error || 'Kiểm tra lại thông tin trước khi lưu.'}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button onClick={() => navigate('/addresses')} disabled={saving} sx={outlineButtonSx}>
              Hủy
            </Button>
            <Button type="submit" disabled={saving} sx={primaryButtonSx}>
              {saving ? 'Đang lưu...' : submitLabel}
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
