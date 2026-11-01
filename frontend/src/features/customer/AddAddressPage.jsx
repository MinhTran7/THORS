import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  Button,
  Divider,
  IconButton
} from '@mui/material';
import {
  ArrowLeftOutlined,
  StarFilled,
  StarOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useCrumbs } from '../../layouts/crumbs';
import { createShippingAddress, validateShippingAddressForm } from '../../services/shippingAddressService';
import { fetchAdministrativeUnits } from '../../services/vietnamAddressService';

const C = {
  cyan: '#8EECF5',
  cyanHover: '#76dced',
  cream: '#FFF7AE',
  creamBg: '#FFFDE7',
  creamBorder: '#FDE047',
  creamText: '#713F12',
  text: '#1E293B',
  muted: '#64748B',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  surface: '#FFFFFF',
  bg: '#F8FAFC'
};

const selectMenuProps = {
  variant: 'menu',
  autoFocus: false,
  disableAutoFocusItem: true,
  disableAutoFocus: true,
  anchorOrigin: {
    vertical: 'bottom',
    horizontal: 'left'
  },
  transformOrigin: {
    vertical: 'top',
    horizontal: 'left'
  },
  MenuListProps: {
    autoFocusItem: false
  },
  PaperProps: {
    sx: {
      maxHeight: 280,
      borderRadius: 2.5,
      mt: 0.5,
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)'
    }
  }
};

export default function AddAddressPage() {
  useCrumbs(['Tài khoản', 'Địa chỉ của tôi', 'Thêm địa chỉ']);
  const navigate = useNavigate();

  // Danh mục hành chính VN
  const [provinces, setProvinces] = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(true);

  // Form state
  const [recipientName, setRecipientName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedProvinceCode, setSelectedProvinceCode] = useState('');
  const [selectedDistrictCode, setSelectedDistrictCode] = useState('');
  const [selectedWardCode, setSelectedWardCode] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  // Field validation errors
  const [fieldErrors, setFieldErrors] = useState({});

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Tải danh mục tỉnh thành
  useEffect(() => {
    async function loadUnits() {
      try {
        setLoadingUnits(true);
        const data = await fetchAdministrativeUnits();
        setProvinces(data);
      } catch (err) {
        console.error('Lỗi tải danh mục hành chính:', err);
      } finally {
        setLoadingUnits(false);
      }
    }
    loadUnits();
  }, []);

  // Danh sách Quận/Huyện theo Tỉnh đã chọn
  const currentProvince = provinces.find((p) => String(p.code) === String(selectedProvinceCode));
  const districts = currentProvince?.districts || [];

  // Danh sách Phường/Xã theo Huyện đã chọn
  const currentDistrict = districts.find((d) => String(d.code) === String(selectedDistrictCode));
  const wards = currentDistrict?.wards || [];

  const currentWard = wards.find((w) => String(w.code) === String(selectedWardCode));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const validationErrors = validateShippingAddressForm({
      recipientName,
      phone,
      selectedProvinceCode,
      selectedDistrictCode,
      selectedWardCode,
      addressDetail
    });

    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);

      const fieldOrder = [
        { key: 'recipientName', id: 'field-recipientName' },
        { key: 'phone', id: 'field-phone' },
        { key: 'selectedProvinceCode', id: 'field-province' },
        { key: 'selectedDistrictCode', id: 'field-district' },
        { key: 'selectedWardCode', id: 'field-ward' },
        { key: 'addressDetail', id: 'field-addressDetail' }
      ];

      const firstInvalid = fieldOrder.find((item) => validationErrors[item.key]);
      if (firstInvalid) {
        setTimeout(() => {
          const el = document.getElementById(firstInvalid.id);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const input = el.querySelector('input') || el;
            if (input && typeof input.focus === 'function') {
              input.focus({ preventScroll: true });
            }
          }
        }, 50);
      }
      return;
    }

    try {
      setSaving(true);
      await createShippingAddress({
        recipientName: recipientName.trim(),
        phone: phone.trim().replace(/[\s.-]/g, ''),
        provinceCode: currentProvince ? String(currentProvince.code) : String(selectedProvinceCode),
        provinceName: currentProvince?.name || '',
        districtCode: currentDistrict ? String(currentDistrict.code) : String(selectedDistrictCode),
        districtName: currentDistrict?.name || '',
        wardCode: currentWard ? String(currentWard.code) : String(selectedWardCode),
        wardName: currentWard?.name || '',
        addressDetail: addressDetail.trim(),
        isDefault
      });
      navigate('/addresses');
    } catch (err) {
      console.error('Lỗi lưu địa chỉ:', err);
      setError(err.message || 'Không thể tạo địa chỉ giao hàng.');
      setTimeout(() => {
        const errEl = document.getElementById('form-error-msg');
        if (errEl) {
          errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ maxWidth: 880, mx: 'auto', color: C.text, pb: 6 }}>
      {/* ─── TIÊU ĐỀ TRÊN CÙNG (ẢNH 4) ─── */}
      <Box sx={{ mb: 3 }}>
        <Button
          startIcon={<ArrowLeftOutlined />}
          onClick={() => navigate('/addresses')}
          sx={{
            textTransform: 'none',
            fontSize: 13,
            color: C.muted,
            mb: 1.5,
            p: 0,
            '&:hover': { bgcolor: 'transparent', color: C.text }
          }}
        >
          Quay lại danh sách địa chỉ
        </Button>
        <Typography variant="h3" sx={{ fontWeight: 800, color: C.text, fontSize: { xs: 24, sm: 28 } }}>
          Thêm địa chỉ giao hàng
        </Typography>
        <Typography variant="body2" sx={{ color: C.muted, mt: 0.5, fontSize: 14 }}>
          Lưu một điểm nhận hàng mới cho những lần mua sắm tiếp theo.
        </Typography>
      </Box>

      {/* ─── FORM CARD (ẢNH 4) ─── */}
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          bgcolor: C.surface,
          borderRadius: 3.5,
          border: `1px solid ${C.border}`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          p: { xs: 2.5, sm: 4 }
        }}
      >
        {/* Header Thông tin giao hàng */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 16, color: C.text }}>
            Thông tin giao hàng
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: C.muted }}>
            * Thông tin bắt buộc
          </Typography>
        </Box>

        {/* Nhóm: Người nhận hàng */}
        <Typography sx={{ fontWeight: 700, fontSize: 13.5, color: C.text, mb: 1.5 }}>
          Người nhận hàng
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 2.5,
            mb: 1
          }}
        >
          <Box id="field-recipientName">
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
              Tên người nhận *
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="Nhập họ và tên người nhận"
              value={recipientName}
              onChange={(e) => {
                setRecipientName(e.target.value);
                if (fieldErrors.recipientName) {
                  setFieldErrors((prev) => ({ ...prev, recipientName: '' }));
                }
              }}
              error={Boolean(fieldErrors.recipientName)}
              helperText={fieldErrors.recipientName}
              FormHelperTextProps={{ sx: { mx: 0.5, mt: 0.5, fontSize: 12, color: '#EF4444' } }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2.5,
                  minHeight: 44,
                  '& fieldset': { borderColor: fieldErrors.recipientName ? '#EF4444' : C.border },
                  '&:hover fieldset': { borderColor: fieldErrors.recipientName ? '#EF4444' : C.cyan },
                  '&.Mui-focused fieldset': { borderColor: fieldErrors.recipientName ? '#EF4444' : C.cyan }
                }
              }}
            />
          </Box>

          <Box id="field-phone">
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
              Số điện thoại *
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="Nhập số điện thoại (10 chữ số)"
              value={phone}
              onChange={(e) => {
                const filtered = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
                setPhone(filtered);
                if (fieldErrors.phone) {
                  setFieldErrors((prev) => ({ ...prev, phone: '' }));
                }
              }}
              error={Boolean(fieldErrors.phone)}
              helperText={fieldErrors.phone}
              FormHelperTextProps={{ sx: { mx: 0.5, mt: 0.5, fontSize: 12, color: '#EF4444' } }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2.5,
                  minHeight: 44,
                  '& fieldset': { borderColor: fieldErrors.phone ? '#EF4444' : C.border },
                  '&:hover fieldset': { borderColor: fieldErrors.phone ? '#EF4444' : C.cyan },
                  '&.Mui-focused fieldset': { borderColor: fieldErrors.phone ? '#EF4444' : C.cyan }
                }
              }}
            />
          </Box>
        </Box>

        <Typography sx={{ fontSize: 12.5, color: C.muted, mb: 3 }}>
          Đơn vị vận chuyển sẽ liên hệ số điện thoại này khi giao hàng.
        </Typography>

        <Divider sx={{ my: 3, borderColor: C.borderLight }} />

        {/* Nhóm: Địa chỉ nhận hàng */}
        <Typography sx={{ fontWeight: 700, fontSize: 13.5, color: C.text, mb: 1.5 }}>
          Địa chỉ nhận hàng
        </Typography>

        {/* 3 Dropdown hành chính */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' },
            gap: 2,
            mb: 1
          }}
        >
          {/* Tỉnh/Thành phố */}
          <Box id="field-province">
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
              Tỉnh/Thành phố *
            </Typography>
            <TextField
              select
              fullWidth
              size="small"
              value={selectedProvinceCode}
              onChange={(e) => {
                setSelectedProvinceCode(e.target.value);
                setSelectedDistrictCode('');
                setSelectedWardCode('');
                if (fieldErrors.selectedProvinceCode) {
                  setFieldErrors((prev) => ({
                    ...prev,
                    selectedProvinceCode: '',
                    selectedDistrictCode: '',
                    selectedWardCode: ''
                  }));
                }
              }}
              disabled={loadingUnits}
              SelectProps={{ MenuProps: selectMenuProps }}
              error={Boolean(fieldErrors.selectedProvinceCode)}
              helperText={fieldErrors.selectedProvinceCode}
              FormHelperTextProps={{ sx: { mx: 0.5, mt: 0.5, fontSize: 12, color: '#EF4444' } }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2.5,
                  minHeight: 44,
                  '& fieldset': { borderColor: fieldErrors.selectedProvinceCode ? '#EF4444' : C.border },
                  '&:hover fieldset': { borderColor: fieldErrors.selectedProvinceCode ? '#EF4444' : C.cyan },
                  '&.Mui-focused fieldset': { borderColor: fieldErrors.selectedProvinceCode ? '#EF4444' : C.cyan }
                }
              }}
            >
              <MenuItem value="" disabled>
                {loadingUnits ? 'Đang tải danh mục...' : 'Chọn Tỉnh/Thành phố'}
              </MenuItem>
              {provinces.map((p) => (
                <MenuItem key={p.code} value={String(p.code)}>
                  {p.name}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {/* Quận/Huyện */}
          <Box id="field-district">
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
              Quận/Huyện *
            </Typography>
            <TextField
              select
              fullWidth
              size="small"
              value={selectedDistrictCode}
              onChange={(e) => {
                setSelectedDistrictCode(e.target.value);
                setSelectedWardCode('');
                if (fieldErrors.selectedDistrictCode) {
                  setFieldErrors((prev) => ({
                    ...prev,
                    selectedDistrictCode: '',
                    selectedWardCode: ''
                  }));
                }
              }}
              disabled={!selectedProvinceCode || districts.length === 0}
              SelectProps={{ MenuProps: selectMenuProps }}
              error={Boolean(fieldErrors.selectedDistrictCode)}
              helperText={fieldErrors.selectedDistrictCode}
              FormHelperTextProps={{ sx: { mx: 0.5, mt: 0.5, fontSize: 12, color: '#EF4444' } }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2.5,
                  minHeight: 44,
                  '& fieldset': { borderColor: fieldErrors.selectedDistrictCode ? '#EF4444' : C.border },
                  '&:hover fieldset': { borderColor: fieldErrors.selectedDistrictCode ? '#EF4444' : C.cyan },
                  '&.Mui-focused fieldset': { borderColor: fieldErrors.selectedDistrictCode ? '#EF4444' : C.cyan }
                }
              }}
            >
              <MenuItem value="" disabled>
                Chọn Quận/Huyện
              </MenuItem>
              {districts.map((d) => (
                <MenuItem key={d.code} value={String(d.code)}>
                  {d.name}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {/* Phường/Xã */}
          <Box id="field-ward">
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
              Phường/Xã *
            </Typography>
            <TextField
              select
              fullWidth
              size="small"
              value={selectedWardCode}
              onChange={(e) => {
                setSelectedWardCode(e.target.value);
                if (fieldErrors.selectedWardCode) {
                  setFieldErrors((prev) => ({ ...prev, selectedWardCode: '' }));
                }
              }}
              disabled={!selectedDistrictCode || wards.length === 0}
              SelectProps={{ MenuProps: selectMenuProps }}
              error={Boolean(fieldErrors.selectedWardCode)}
              helperText={fieldErrors.selectedWardCode}
              FormHelperTextProps={{ sx: { mx: 0.5, mt: 0.5, fontSize: 12, color: '#EF4444' } }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2.5,
                  minHeight: 44,
                  '& fieldset': { borderColor: fieldErrors.selectedWardCode ? '#EF4444' : C.border },
                  '&:hover fieldset': { borderColor: fieldErrors.selectedWardCode ? '#EF4444' : C.cyan },
                  '&.Mui-focused fieldset': { borderColor: fieldErrors.selectedWardCode ? '#EF4444' : C.cyan }
                }
              }}
            >
              <MenuItem value="" disabled>
                Chọn Phường/Xã
              </MenuItem>
              {wards.map((w) => (
                <MenuItem key={w.code} value={String(w.code)}>
                  {w.name}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </Box>

        <Typography sx={{ fontSize: 12.5, color: C.muted, mb: 2.5 }}>
          Chọn Tỉnh/Thành phố trước, sau đó chọn Quận/Huyện và Phường/Xã.
        </Typography>

        {/* Số nhà, ngõ/đường */}
        <Box id="field-addressDetail" sx={{ mb: 2.5 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
            Số nhà, ngõ/đường *
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Ví dụ: Số 186, đường 72"
            value={addressDetail}
            onChange={(e) => {
              setAddressDetail(e.target.value);
              if (fieldErrors.addressDetail) {
                setFieldErrors((prev) => ({ ...prev, addressDetail: '' }));
              }
            }}
            error={Boolean(fieldErrors.addressDetail)}
            helperText={fieldErrors.addressDetail}
            FormHelperTextProps={{ sx: { mx: 0.5, mt: 0.5, fontSize: 12, color: '#EF4444' } }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2.5,
                minHeight: 44,
                '& fieldset': { borderColor: fieldErrors.addressDetail ? '#EF4444' : C.border },
                '&:hover fieldset': { borderColor: fieldErrors.addressDetail ? '#EF4444' : C.cyan },
                '&.Mui-focused fieldset': { borderColor: fieldErrors.addressDetail ? '#EF4444' : C.cyan }
              }
            }}
          />
        </Box>

        {/* KHUNG ĐẶT LÀM MẶC ĐỊNH: BỎ CHECKBOX, THAY BẰNG NGÔI SAO RỖNG / ĐẦY (CLICK VÀO NGÔI SAO THÔI) */}
        <Box
          sx={{
            p: 2,
            borderRadius: 2.5,
            border: isDefault ? `1.5px solid ${C.creamBorder}` : `1px solid ${C.border}`,
            bgcolor: isDefault ? C.creamBg : '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            mb: 4,
            transition: 'all 0.2s ease'
          }}
        >
          {/* Nút Ngôi sao tương tác (Chỉ click vào ngôi sao mới đổi trạng thái) */}
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              setIsDefault((prev) => !prev);
            }}
            sx={{
              p: 0.5,
              color: isDefault ? '#EAB308' : '#94A3B8',
              cursor: 'pointer',
              '&:hover': {
                bgcolor: 'transparent',
                transform: 'scale(1.15)'
              }
            }}
          >
            {isDefault ? (
              <StarFilled style={{ fontSize: 24, color: '#EAB308' }} />
            ) : (
              <StarOutlined style={{ fontSize: 24, color: '#94A3B8' }} />
            )}
          </IconButton>

          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: 13.5, color: C.text }}>
              Đặt làm địa chỉ mặc định
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: isDefault ? C.creamText : C.muted, mt: 0.25 }}>
              {isDefault
                ? 'Địa chỉ này sẽ được ưu tiên khi bạn thanh toán đơn hàng mới.'
                : 'Click vào ngôi sao để đặt địa chỉ này làm mặc định khi thanh toán.'}
            </Typography>
          </Box>
        </Box>

        {/* Footer Bar: Kiểm tra lại thông tin + Nút Hủy & Thêm địa chỉ */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            pt: 2,
            borderTop: `1px solid ${C.borderLight}`,
            flexWrap: 'wrap',
            gap: 2
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography sx={{ fontSize: 13, color: C.muted }}>
              Kiểm tra lại thông tin trước khi lưu.
            </Typography>
            {error && (
              <Typography id="form-error-msg" sx={{ color: '#EF4444', fontSize: 13, fontWeight: 600 }}>
                {error}
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Button
              type="button"
              onClick={() => navigate('/addresses')}
              disabled={saving}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                fontSize: 13.5,
                color: C.text,
                px: 2.5,
                height: 42,
                borderRadius: 2.5,
                border: `1px solid ${C.border}`,
                '&:hover': { bgcolor: '#F1F5F9' }
              }}
            >
              Hủy
            </Button>

            <Button
              type="submit"
              disabled={saving}
              sx={{
                bgcolor: C.cyan,
                color: '#0F172A',
                fontWeight: 700,
                fontSize: 13.5,
                px: 3,
                height: 42,
                borderRadius: 2.5,
                textTransform: 'none',
                boxShadow: 'none',
                '&:hover': {
                  bgcolor: C.cyanHover,
                  boxShadow: '0 2px 8px rgba(142, 236, 245, 0.4)'
                }
              }}
            >
              {saving ? 'Đang lưu...' : 'Thêm địa chỉ'}
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
