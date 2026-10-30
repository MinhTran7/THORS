import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';

import { SaveOutlined } from '@ant-design/icons';

import { createPromotion } from 'services/promotionService';

const COLORS = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5E7E3',
  cyan: '#8DE9F2',
  cyanHover: '#6DDDE9',
  background: '#FAFAF8'
};

const cardSx = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 2.5,
  boxShadow: 'none',
  bgcolor: '#fff'
};

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 1.5
  }
};

const initialForm = {
  name: '',
  description: '',
  discountType: 'PERCENT',
  discountValue: '',
  minOrderValue: '0',
  maxDiscountAmount: '',
  usageLimit: '',
  startDate: '',
  endDate: ''
};

function SectionTitle({ children }) {
  return (
    <Typography
      sx={{
        mb: 2,
        color: COLORS.text,
        fontSize: 15,
        fontWeight: 700
      }}
    >
      {children}
    </Typography>
  );
}

function validateForm(form) {
  const name = form.name.trim();
  const discountValue = Number(form.discountValue);
  const minOrderValue = Number(form.minOrderValue || 0);
  const maxDiscountAmount = form.maxDiscountAmount === '' ? null : Number(form.maxDiscountAmount);
  const usageLimit = form.usageLimit === '' ? null : Number(form.usageLimit);

  if (!name) {
    return 'Vui lòng nhập tên khuyến mãi.';
  }

  if (form.discountValue === '' || !Number.isFinite(discountValue) || discountValue <= 0) {
    return 'Giá trị giảm giá phải lớn hơn 0.';
  }

  if (form.discountType === 'PERCENT' && discountValue > 100) {
    return 'Mức giảm theo phần trăm không được vượt quá 100%.';
  }

  if (!form.startDate || !form.endDate) {
    return 'Vui lòng chọn thời gian bắt đầu và kết thúc.';
  }

  const now = new Date();
  const start = new Date(form.startDate);
  const end = new Date(form.endDate);

  if (Number.isNaN(start.getTime()) || start.getTime() < now.getTime()) {
    return 'Thời gian bắt đầu không được ở trong quá khứ.';
  }

  if (Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return 'Thời gian kết thúc phải sau thời gian bắt đầu.';
  }

  if (!Number.isFinite(minOrderValue) || minOrderValue < 0) {
    return 'Giá trị đơn hàng tối thiểu không được âm.';
  }

  if (maxDiscountAmount !== null && (!Number.isFinite(maxDiscountAmount) || maxDiscountAmount < 0)) {
    return 'Số tiền giảm tối đa không được âm.';
  }

  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit <= 0)) {
    return 'Giới hạn lượt sử dụng phải là số nguyên lớn hơn 0.';
  }

  return '';
}

export default function AddPromotionPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const updateField = (field) => (event) => {
    setForm((previous) => ({
      ...previous,
      [field]: event.target.value
    }));

    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = validateForm(form);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSaving(true);

    try {
      await createPromotion({
        ...form,
        name: form.name.trim(),
        description: form.description.trim(),
        discountValue: Number(form.discountValue),
        minOrderValue: Number(form.minOrderValue || 0),
        maxDiscountAmount: form.maxDiscountAmount === '' ? null : Number(form.maxDiscountAmount),
        usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit)
      });

      navigate('/promotions', {
        state: {
          successMessage: 'Tạo khuyến mãi thành công.'
        }
      });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Không thể tạo khuyến mãi. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100%',
        p: { xs: 2, md: 3 },
        bgcolor: COLORS.background
      }}
    >
      {/* Điều hướng và tiêu đề trang */}
      <Box sx={{ mb: 3 }}>
        <Breadcrumbs
          separator="/"
          aria-label="đường dẫn"
          sx={{
            mb: 1.5,
            fontSize: 13,
            fontWeight: 500,
            '& .MuiBreadcrumbs-separator': {
              mx: 1,
              color: COLORS.muted
            }
          }}
        >
          <Link
            component="button"
            type="button"
            underline="none"
            onClick={() => navigate('/promotions')}
            sx={{
              color: COLORS.muted,
              fontSize: 'inherit',
              fontWeight: 'inherit',
              cursor: 'pointer',
              '&:hover': {
                color: COLORS.text
              }
            }}
          >
            Danh sách khuyến mãi
          </Link>

          <Typography
            sx={{
              color: COLORS.text,
              fontSize: 'inherit',
              fontWeight: 'inherit'
            }}
          >
            Thêm khuyến mãi
          </Typography>
        </Breadcrumbs>

        <Typography
          sx={{
            color: COLORS.text,
            fontSize: { xs: 30, md: 40 },
            fontWeight: 500,
            lineHeight: 1.3
          }}
        >
          Thêm khuyến mãi
        </Typography>

      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit}>
        <Stack spacing={2.5}>
          {/* Thông tin cơ bản */}
          <Card sx={cardSx}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <SectionTitle>Thông tin cơ bản</SectionTitle>

              <Stack spacing={2}>
                <TextField
                  label="Tên khuyến mãi"
                  value={form.name}
                  onChange={updateField('name')}
                  required
                  fullWidth
                  inputProps={{ maxLength: 100 }}
                  sx={fieldSx}
                />

                <TextField
                  label="Mô tả"
                  value={form.description}
                  onChange={updateField('description')}
                  multiline
                  minRows={3}
                  fullWidth
                  sx={fieldSx}
                />
              </Stack>
            </CardContent>
          </Card>

          {/* Thiết lập giảm giá */}
          <Card sx={cardSx}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <SectionTitle>Thiết lập giảm giá</SectionTitle>

              <Stack spacing={2}>
                <TextField
                  select
                  label="Loại giảm giá"
                  value={form.discountType}
                  onChange={updateField('discountType')}
                  fullWidth
                  sx={fieldSx}
                >
                  <MenuItem value="PERCENT">Theo phần trăm (%)</MenuItem>
                  <MenuItem value="FIXED">Số tiền cố định (VNĐ)</MenuItem>
                </TextField>

                <TextField
                  label={form.discountType === 'PERCENT' ? 'Tỷ lệ giảm giá (%)' : 'Số tiền giảm giá (VNĐ)'}
                  type="number"
                  value={form.discountValue}
                  onChange={updateField('discountValue')}
                  required
                  fullWidth
                  inputProps={{
                    min: 0,
                    step: 'any',
                    ...(form.discountType === 'PERCENT' ? { max: 100 } : {})
                  }}
                  sx={fieldSx}
                />

                {form.discountType === 'PERCENT' && (
                  <TextField
                    label="Số tiền giảm tối đa (VNĐ)"
                    type="number"
                    value={form.maxDiscountAmount}
                    onChange={updateField('maxDiscountAmount')}
                    fullWidth
                    inputProps={{ min: 0, step: 'any' }}
                    helperText="Để trống nếu không giới hạn số tiền giảm."
                    sx={fieldSx}
                  />
                )}

                <TextField
                  label="Giá trị đơn hàng tối thiểu (VNĐ)"
                  type="number"
                  value={form.minOrderValue}
                  onChange={updateField('minOrderValue')}
                  fullWidth
                  inputProps={{ min: 0, step: 'any' }}
                  sx={fieldSx}
                />

                <TextField
                  label="Giới hạn lượt sử dụng"
                  type="number"
                  value={form.usageLimit}
                  onChange={updateField('usageLimit')}
                  fullWidth
                  inputProps={{ min: 1, step: 1 }}
                  helperText="Để trống nếu không giới hạn lượt sử dụng."
                  sx={fieldSx}
                />
              </Stack>
            </CardContent>
          </Card>

          {/* Thời gian áp dụng */}
          <Card sx={cardSx}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <SectionTitle>Thời gian áp dụng</SectionTitle>

              <Stack spacing={2}>
                <TextField
                  label="Thời gian bắt đầu"
                  type="datetime-local"
                  value={form.startDate}
                  onChange={updateField('startDate')}
                  required
                  fullWidth
                  slotProps={{
                    inputLabel: { shrink: true }
                  }}
                  sx={fieldSx}
                />

                <TextField
                  label="Thời gian kết thúc"
                  type="datetime-local"
                  value={form.endDate}
                  onChange={updateField('endDate')}
                  required
                  fullWidth
                  slotProps={{
                    inputLabel: { shrink: true }
                  }}
                  sx={fieldSx}
                />

                <Alert severity="info">
                  Khuyến mãi chỉ được áp dụng trong khoảng thời gian đã chọn khi trạng thái khuyến mãi là Đang hoạt động.
                </Alert>
              </Stack>
            </CardContent>
          </Card>

          {/* Các nút thao tác */}
          <Stack direction="row" justifyContent="flex-end" spacing={1.5} sx={{ pb: 2 }}>
            <Button
              variant="outlined"
              onClick={() => navigate('/promotions')}
              disabled={saving}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                color: COLORS.text,
                borderColor: COLORS.border
              }}
            >
              Hủy
            </Button>

            <Button
              type="submit"
              variant="contained"
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveOutlined />}
              disabled={saving}
              sx={{
                bgcolor: COLORS.cyan,
                color: COLORS.text,
                fontWeight: 700,
                borderRadius: 2,
                px: 3,
                boxShadow: 'none',
                textTransform: 'none',
                '&:hover': {
                  bgcolor: COLORS.cyanHover,
                  boxShadow: 'none'
                }
              }}
            >
              {saving ? 'Đang lưu...' : 'Tạo khuyến mãi'}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}
