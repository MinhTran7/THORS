import { useState } from 'react';
import { Autocomplete, Box, Button, Divider, IconButton, TextField, Typography } from '@mui/material';
import { EnvironmentOutlined, RightOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { C as STORE, SANS } from 'features/shop/storeTheme';
import { useDebounced } from 'features/account/hooks';
import { useProvinces } from '../hooks';
import { C, cardSx, inputSx, outlineButtonSx, primaryButtonSx } from '../theme';
import { EMPTY_ADDRESS, fullAddress, toRequest, validateAddress } from '../utils';

const helperTextSlot = { formHelperText: { sx: { mx: 0.5, fontSize: 12 } } };

const paperSlot = { paper: { sx: { borderRadius: '14px', mt: 0.5, boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.1)' } } };

function Label({ children }) {
  return <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#374151', mb: 0.75 }}>{children}</Typography>;
}

function Field({ label, error, htmlInput, ...props }) {
  return (
    <Box>
      <Label>{label}</Label>
      <TextField
        fullWidth
        size="small"
        error={Boolean(error)}
        helperText={error}
        slotProps={{ ...helperTextSlot, htmlInput }}
        sx={inputSx(error)}
        {...props}
      />
    </Box>
  );
}

// Ô chọn có gõ tìm (Tỉnh/Thành phố, Phường/Xã); value/onChange theo mã code
function SelectField({ label, options, code, onChange, placeholder, error, ...props }) {
  return (
    <Box>
      <Label>{label}</Label>
      <Autocomplete
        disableClearable
        options={options}
        value={options.find((o) => o.code === code) || null}
        getOptionLabel={(option) => option?.name ?? ''}
        isOptionEqualToValue={(option, val) => option.code === val.code}
        loadingText="Đang tải..."
        onChange={(_, val) => onChange(val.code)}
        slotProps={paperSlot}
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            placeholder={placeholder}
            error={Boolean(error)}
            helperText={error}
            slotProps={{ ...params.slotProps, ...helperTextSlot }}
            sx={inputSx(error)}
          />
        )}
        {...props}
      />
    </Box>
  );
}

function AddressMap({ query }) {
  return (
    <Box
      component="iframe"
      title="Bản đồ địa chỉ"
      src={`https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=16&output=embed`}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      sx={{ display: 'block', width: '100%', height: 260, border: `1px solid ${C.border}`, borderRadius: 2.5 }}
    />
  );
}

// lockDefault: địa chỉ đang là mặc định thì không cho bỏ mặc định (phải chọn địa chỉ khác làm mặc định)
export default function AddressForm({ title, submitLabel, initial, lockDefault = false, onSubmit }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ ...EMPTY_ADDRESS, ...initial });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const { provinces, wards, error: loadError } = useProvinces(form.provinceCode);

  const province = provinces.find((p) => p.code === form.provinceCode);
  const ward = wards.find((w) => w.code === form.wardCode);
  // Chỉ cập nhật bản đồ khi người dùng ngừng gõ 0,7 giây, tránh tải lại iframe liên tục
  const mapQuery = useDebounced(province && ward ? fullAddress(form.addressDetail.trim(), ward.name, province.name) : '', 700);
  const error = submitError || loadError;

  // Sửa ô nào thì xóa lỗi của ô đó
  const change = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      Object.keys(patch).forEach((key) => delete next[key]);
      return next;
    });
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validateAddress(form, province, ward);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    setSubmitError('');
    try {
      await onSubmit(toRequest(form, province, ward));
      navigate('/addresses');
    } catch (err) {
      setSubmitError(err.message || 'Không thể lưu địa chỉ giao hàng.');
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
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            color: '#1E293B',
            textDecoration: 'none',
            fontSize: 15,
            fontWeight: 600
          }}
        >
          <EnvironmentOutlined style={{ fontSize: 16, color: '#475569' }} />
          <span>Địa chỉ giao hàng</span>
        </Box>
        <RightOutlined style={{ fontSize: 11, color: '#64748B', margin: '0 2px' }} />
        <Typography component="span" sx={{ color: STORE.accent, fontWeight: 700, fontSize: 15 }}>
          {title}
        </Typography>
      </Box>
      <Box
        component="form"
        noValidate
        onSubmit={handleSubmit}
        sx={{ ...cardSx, boxShadow: 'none', border: `1px solid ${C.border}`, p: { xs: 2.5, sm: 4 } }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 16 }}>Thông tin giao hàng</Typography>
          <Typography sx={{ fontSize: 12.5, color: C.muted }}>* Thông tin bắt buộc</Typography>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
          <Field
            label="Tên người nhận *"
            placeholder="Nhập họ và tên người nhận"
            value={form.recipientName}
            onChange={(e) => change({ recipientName: e.target.value })}
            error={errors.recipientName}
          />
          <Field
            label="Số điện thoại *"
            placeholder="Nhập số điện thoại (10 chữ số)"
            value={form.phone}
            onChange={(e) => change({ phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
            error={errors.phone}
            htmlInput={{ inputMode: 'numeric' }}
          />
        </Box>

        <Divider sx={{ my: 3, borderColor: C.borderLight }} />

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5, mb: 2.5 }}>
          <SelectField
            label="Tỉnh/Thành phố *"
            options={provinces}
            code={form.provinceCode}
            onChange={(provinceCode) => change({ provinceCode, wardCode: '' })}
            placeholder="Chọn hoặc gõ tìm Tỉnh/Thành phố"
            noOptionsText="Không tìm thấy"
            loading={!provinces.length}
            error={errors.provinceCode}
          />
          <SelectField
            label="Phường/Xã *"
            options={wards}
            code={form.wardCode}
            onChange={(wardCode) => change({ wardCode })}
            placeholder={form.provinceCode ? 'Chọn hoặc gõ tìm Phường/Xã' : 'Chọn Tỉnh/Thành phố trước'}
            noOptionsText={form.provinceCode ? 'Không tìm thấy' : 'Vui lòng chọn Tỉnh/Thành phố trước'}
            disabled={!form.provinceCode}
            error={errors.wardCode}
          />
        </Box>

        <Field
          label="Số nhà, tên đường *"
          placeholder="Ví dụ: Số 186, đường 72"
          value={form.addressDetail}
          onChange={(e) => change({ addressDetail: e.target.value })}
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
            border: form.isDefault ? '1.5px solid #FDE047' : `1.5px solid ${C.border}`,
            bgcolor: form.isDefault ? '#FEF9C3' : '#FAFDFD'
          }}
        >
          <IconButton
            size="small"
            disableRipple
            disabled={lockDefault}
            onClick={() => change({ isDefault: !form.isDefault })}
            sx={{ '&:hover': { bgcolor: 'transparent' } }}
          >
            {form.isDefault ? (
              <StarFilled style={{ fontSize: 24, color: '#EAB308' }} />
            ) : (
              <StarOutlined style={{ fontSize: 24, color: '#94A3B8' }} />
            )}
          </IconButton>
          <Typography sx={{ fontWeight: 700, fontSize: 13.5, color: form.isDefault ? '#854D0E' : 'inherit' }}>
            Đặt làm địa chỉ mặc định
          </Typography>
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
            <Button color="inherit" onClick={() => navigate('/addresses')} disabled={saving} sx={outlineButtonSx}>
              Hủy
            </Button>
            <Button color="inherit" type="submit" disabled={saving} sx={primaryButtonSx}>
              {saving ? 'Đang lưu...' : submitLabel}
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
