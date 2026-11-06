import { useEffect, useState } from 'react';
import { Box, Typography, TextField, MenuItem, Button, Divider, IconButton } from '@mui/material';
import { ArrowLeftOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { fetchProvinces, fetchWards } from '../cart/vnAddress';
import { C, cardSx, outlineButtonSx, primaryButtonSx } from './theme';
import AddressMap, { fullAddress } from './AddressMap';

const EMPTY = { recipientName: '', phone: '', provinceCode: '', wardCode: '', addressDetail: '', isDefault: false };

const menuProps = {
  autoFocus: false,
  disableAutoFocusItem: true,
  PaperProps: { sx: { maxHeight: 280, borderRadius: 2.5, mt: 0.5 } }
};

const inputSx = (hasError) => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: 2.5,
    minHeight: 44,
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
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>{label}</Typography>
      <TextField
        fullWidth
        size="small"
        error={Boolean(error)}
        helperText={error}
        FormHelperTextProps={{ sx: { mx: 0.5, fontSize: 12 } }}
        SelectProps={{ MenuProps: menuProps }}
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

  function change(name, value) {
    setForm((f) => ({ ...f, [name]: value, ...(name === 'provinceCode' && { wardCode: '' }) }));
    setErrors((e) => ({ ...e, [name]: '' }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const found = validate(form, province, ward);
    setErrors(found);
    if (Object.keys(found).length) return;

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
    <Box sx={{ maxWidth: 880, mx: 'auto', color: C.text, pb: 6 }}>
      <Box sx={{ mb: 3 }}>
        <Button
          startIcon={<ArrowLeftOutlined />}
          onClick={() => navigate('/addresses')}
          sx={{ textTransform: 'none', fontSize: 13, color: C.muted, mb: 1.5, p: 0, '&:hover': { bgcolor: 'transparent', color: C.text } }}
        >
          Quay lại danh sách địa chỉ
        </Button>
        <Typography variant="h3" sx={{ fontWeight: 800, fontSize: { xs: 24, sm: 28 } }}>
          {title}
        </Typography>
        <Typography sx={{ color: C.muted, mt: 0.5, fontSize: 14 }}>{subtitle}</Typography>
      </Box>

      <Box component="form" noValidate onSubmit={handleSubmit} sx={{ ...cardSx, p: { xs: 2.5, sm: 4 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 16 }}>Thông tin giao hàng</Typography>
          <Typography sx={{ fontSize: 12.5, color: C.muted }}>* Thông tin bắt buộc</Typography>
        </Box>

        {/* Người nhận */}
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

        {/* Địa chỉ nhận hàng */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5, mb: 2.5 }}>
          <Field
            select
            label="Tỉnh/Thành phố *"
            value={province ? form.provinceCode : ''}
            onChange={(e) => change('provinceCode', e.target.value)}
            disabled={!provinces.length}
            error={errors.provinceCode}
          >
            <MenuItem value="" disabled>
              {provinces.length ? 'Chọn Tỉnh/Thành phố' : 'Đang tải...'}
            </MenuItem>
            {provinces.map((p) => (
              <MenuItem key={p.code} value={p.code}>
                {p.name}
              </MenuItem>
            ))}
          </Field>
          <Field
            select
            label="Phường/Xã *"
            value={ward ? form.wardCode : ''}
            onChange={(e) => change('wardCode', e.target.value)}
            disabled={!wards.length}
            error={errors.wardCode}
          >
            <MenuItem value="" disabled>
              Chọn Phường/Xã
            </MenuItem>
            {wards.map((w) => (
              <MenuItem key={w.code} value={w.code}>
                {w.name}
              </MenuItem>
            ))}
          </Field>
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

        {/* Mặc định */}
        <Box
          sx={{
            my: 4,
            p: 2,
            borderRadius: 2.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            border: form.isDefault ? '1.5px solid #FDE047' : `1px solid ${C.border}`,
            bgcolor: form.isDefault ? '#FFFDE7' : '#F8FAFC'
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
