import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  InputAdornment,
  Link,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography
} from '@mui/material';

import { ArrowLeftOutlined, SaveOutlined, SearchOutlined } from '@ant-design/icons';

import { getPromotionById, updatePromotion } from 'services/promotionService';

import { getProducts } from 'services/productService';

// ==================== CONSTANTS ====================

const COLORS = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5E7E3',
  cyan: '#8DE9F2',
  cyanHover: '#6DDDE9',
  price: '#239EAA',
  background: '#FAFAF8',
  selected: '#E8FAFC',
  cream: '#FFFBE1',
  dark: '#123B43'
};

const cardSx = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 3,
  boxShadow: '0 2px 10px rgba(31, 45, 66, 0.025)',
  bgcolor: '#fff',
  overflow: 'hidden'
};

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2,
    bgcolor: '#fff',
    '& fieldset': { borderColor: COLORS.border },
    '&:hover fieldset': { borderColor: COLORS.cyanHover },
    '&.Mui-focused fieldset': { borderColor: COLORS.cyanHover }
  },
  '& .MuiInputLabel-root.Mui-focused': {
    color: COLORS.dark
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
  endDate: '',
  applyScope: 'ALL',
  productIds: []
};

// ==================== HELPERS ====================

const getProductId = (product) => Number(product.productId ?? product.id);

const getProductName = (product) => product.productName || product.name || 'Sản phẩm chưa có tên';

const getProductImage = (product) => product.primaryImageUrl || product.imageUrl || product.thumbnailUrl || product.image || '';

const formatCurrency = (value) => {
  if (value == null || value === '') return null;

  const number = Number(value);

  return Number.isFinite(number) ? `${number.toLocaleString('vi-VN')} đ` : null;
};

const getProductPrice = (product) => {
  const { minPrice, maxPrice, price } = product;

  if (minPrice != null && maxPrice != null) {
    if (Number(minPrice) !== Number(maxPrice)) {
      return `${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)}`;
    }

    return formatCurrency(minPrice);
  }

  return formatCurrency(minPrice ?? maxPrice ?? price) || 'Chưa có giá';
};

// Chuyển ngày từ API sang định dạng datetime-local
const toDateTimeLocal = (value) => {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  const offset = date.getTimezoneOffset() * 60000;

  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

// Chuẩn hóa dữ liệu danh sách sản phẩm
const getProductRows = (response) => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.content)) return response.content;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.content)) {
    return response.data.content;
  }

  return [];
};

// Chuẩn hóa dữ liệu khuyến mãi
const getPromotionData = (response) => response?.data?.data ?? response?.data ?? response;

const validateForm = (form) => {
  const discountValue = Number(form.discountValue);
  const minOrderValue = Number(form.minOrderValue || 0);

  const maxDiscountAmount = form.maxDiscountAmount === '' ? null : Number(form.maxDiscountAmount);

  const usageLimit = form.usageLimit === '' ? null : Number(form.usageLimit);

  if (!form.name.trim()) {
    return 'Vui lòng nhập tên khuyến mãi.';
  }

  if (form.discountValue === '' || !Number.isFinite(discountValue) || discountValue <= 0) {
    return 'Giá trị giảm giá phải lớn hơn 0.';
  }

  if (['PERCENT', 'PERCENTAGE'].includes(form.discountType) && discountValue > 100) {
    return 'Mức giảm theo phần trăm không được vượt quá 100%.';
  }

  if (form.discountType === 'FIXED' && !Number.isInteger(discountValue)) {
    return 'Số tiền giảm cố định phải là số nguyên VNĐ.';
  }

  if (!form.startDate || !form.endDate) {
    return 'Vui lòng chọn thời gian bắt đầu và kết thúc.';
  }

  const start = new Date(form.startDate);
  const end = new Date(form.endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Thời gian áp dụng không hợp lệ.';
  }

  if (end <= start) {
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

  if (form.applyScope === 'SELECTED' && form.productIds.length === 0) {
    return 'Vui lòng chọn ít nhất một sản phẩm áp dụng.';
  }

  return '';
};

// ==================== COMPONENTS ====================

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

function ProductItem({ product, checked, onToggle }) {
  const [imageError, setImageError] = useState(false);

  const imageUrl = getProductImage(product);
  const productName = getProductName(product);
  const productPrice = getProductPrice(product);
  const stock = product.totalStock ?? product.quantity ?? 0;

  return (
    <Box
      onClick={onToggle}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 1.25,
        border: `1px solid ${checked ? COLORS.cyan : COLORS.border}`,
        borderRadius: 2.5,
        bgcolor: checked ? COLORS.selected : '#fff',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        '&:hover': {
          borderColor: COLORS.cyanHover,
          bgcolor: COLORS.selected
        }
      }}
    >
      <Checkbox
        size="small"
        checked={checked}
        onChange={onToggle}
        onClick={(event) => event.stopPropagation()}
        sx={{ p: 0.25, flexShrink: 0 }}
      />

      <Box
        sx={{
          width: 68,
          height: 68,
          flexShrink: 0,
          borderRadius: 1.5,
          overflow: 'hidden',
          bgcolor: '#F3F4F6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {imageUrl && !imageError ? (
          <Box
            component="img"
            src={imageUrl}
            alt={productName}
            onError={() => setImageError(true)}
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
        ) : (
          <Typography sx={{ color: '#A0A8B4', fontSize: 11 }}>No image</Typography>
        )}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          title={productName}
          sx={{
            color: COLORS.text,
            fontWeight: 600,
            fontSize: 14,
            mb: 0.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {productName}
        </Typography>

        <Typography
          sx={{
            color: COLORS.price,
            fontSize: 13,
            fontWeight: 700,
            mb: 0.5
          }}
        >
          {productPrice}
        </Typography>

        <Typography sx={{ color: COLORS.muted, fontSize: 12 }}>Tồn kho: {Number(stock).toLocaleString('vi-VN')}</Typography>
      </Box>
    </Box>
  );
}

// ==================== MAIN PAGE ====================

export default function EditPromotionPage() {
  const navigate = useNavigate();
  const { promotionId } = useParams();

  const [form, setForm] = useState(initialForm);
  const [promotionStatus, setPromotionStatus] = useState('');

  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');
  const [productLoadError, setProductLoadError] = useState('');

  // Tải thông tin khuyến mãi và danh sách sản phẩm
  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);
      setError('');
      setProductsLoading(true);
      setProductLoadError('');

      try {
        const [promotionResponse, productResponse] = await Promise.all([getPromotionById(promotionId), getProducts()]);

        if (!active) return;

        const promotion = getPromotionData(promotionResponse);
        const rows = getProductRows(productResponse);

        if (!promotion?.promotionId) {
          throw new Error('Không tìm thấy thông tin khuyến mãi.');
        }

        const selectedIds = Array.isArray(promotion.productIds) ? promotion.productIds.map(Number) : [];

        setPromotionStatus(promotion.status || '');

        setForm({
          name: promotion.name || '',
          description: promotion.description || '',
          discountType: promotion.discountType || 'PERCENT',
          discountValue: String(promotion.discountValue ?? ''),
          minOrderValue: String(promotion.minOrderValue ?? 0),
          maxDiscountAmount: promotion.maxDiscountAmount == null ? '' : String(promotion.maxDiscountAmount),
          usageLimit: promotion.usageLimit == null ? '' : String(promotion.usageLimit),
          startDate: toDateTimeLocal(promotion.startDate),
          endDate: toDateTimeLocal(promotion.endDate),
          applyScope: promotion.applyScope || 'ALL',
          productIds: selectedIds
        });

        // Giữ cả sản phẩm đang được chọn, kể cả khi đã ngừng hoạt động.
        const availableProducts = rows.filter((product) => {
          const id = getProductId(product);

          return Number.isInteger(id) && (product.status === 'ACTIVE' || selectedIds.includes(id));
        });

        setProducts(availableProducts);
      } catch (err) {
        if (active) {
          setError(err?.response?.data?.message || err?.message || 'Không thể tải dữ liệu khuyến mãi.');
        }
      } finally {
        if (active) {
          setLoading(false);
          setProductsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      active = false;
    };
  }, [promotionId]);

  // Tìm kiếm sản phẩm
  const filteredProducts = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase();

    if (!keyword) return products;

    return products.filter((product) => getProductName(product).toLowerCase().includes(keyword));
  }, [products, productSearch]);

  // Cập nhật trường form
  const updateField = useCallback(
    (field) => (event) => {
      const value = event.target.value;

      setForm((previous) => ({
        ...previous,
        [field]: value
      }));

      setError('');
    },
    []
  );

  // Chọn hoặc bỏ chọn sản phẩm
  const toggleProduct = useCallback((productId) => {
    setForm((previous) => {
      const isSelected = previous.productIds.includes(productId);

      return {
        ...previous,
        productIds: isSelected ? previous.productIds.filter((id) => id !== productId) : [...previous.productIds, productId]
      };
    });

    setError('');
  }, []);

  // Lưu thay đổi
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (saving) return;

    const validationError = validateForm(form);

    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        minOrderValue: Number(form.minOrderValue || 0),
        maxDiscountAmount: form.maxDiscountAmount === '' ? null : Number(form.maxDiscountAmount),
        usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
        startDate: form.startDate,
        endDate: form.endDate,
        applyScope: form.applyScope,
        productIds: form.applyScope === 'SELECTED' ? form.productIds : []
      };

      await updatePromotion(promotionId, payload);

      navigate(`/promotions/${promotionId}`, {
        state: {
          successMessage: 'Cập nhật khuyến mãi thành công.'
        }
      });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Không thể cập nhật khuyến mãi. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  // Trạng thái tải
  if (loading) {
    return (
      <Box
        sx={{
          minHeight: 400,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: COLORS.background
        }}
      >
        <CircularProgress sx={{ color: COLORS.cyan }} />
      </Box>
    );
  }

  // Không tải được khuyến mãi
  if (error && !form.name) {
    return (
      <Box sx={{ p: 3, bgcolor: COLORS.background, minHeight: '100%' }}>
        <Button
          startIcon={<ArrowLeftOutlined />}
          onClick={() => navigate('/promotions')}
          sx={{ color: COLORS.dark, textTransform: 'none' }}
        >
          Quay lại danh sách
        </Button>

        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100%',
        px: { xs: 1.5, md: 3 },
        py: { xs: 2, md: 3 },
        bgcolor: COLORS.background,
        boxSizing: 'border-box'
      }}
    >
      {/* Header */}
      <Box
        sx={{
          mb: 3,
          p: { xs: 2.5, md: 3.5 },
          borderRadius: 3,
          border: `1px solid ${COLORS.border}`,
          bgcolor: COLORS.cream
        }}
      >
        <Breadcrumbs separator="/" sx={{ mb: 1.5, fontSize: 13 }}>
          <Link
            component="button"
            type="button"
            underline="none"
            onClick={() => navigate('/promotions')}
            sx={{ color: COLORS.muted, cursor: 'pointer' }}
          >
            Danh sách khuyến mãi
          </Link>

          <Typography fontSize={13} color={COLORS.text}>
            Chỉnh sửa khuyến mãi
          </Typography>
        </Breadcrumbs>

        <Typography
          sx={{
            color: COLORS.text,
            fontSize: { xs: 25, md: 32 },
            fontWeight: 700
          }}
        >
          Chỉnh sửa khuyến mãi
        </Typography>

        <Typography fontSize={13} color={COLORS.muted} sx={{ mt: 0.5 }}>
          Cập nhật thông tin và phạm vi áp dụng của chương trình.
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
                  label={['PERCENT', 'PERCENTAGE'].includes(form.discountType) ? 'Tỷ lệ giảm giá (%)' : 'Số tiền giảm giá (VNĐ)'}
                  type="number"
                  value={form.discountValue}
                  onChange={updateField('discountValue')}
                  required
                  fullWidth
                  inputProps={{
                    min: 0,
                    step: form.discountType === 'FIXED' ? 1 : 'any',
                    ...(form.discountType === 'PERCENT' ? { max: 100 } : {})
                  }}
                  sx={fieldSx}
                />

                {['PERCENT', 'PERCENTAGE'].includes(form.discountType) && (
                  <TextField
                    label="Số tiền giảm tối đa (VNĐ)"
                    type="number"
                    value={form.maxDiscountAmount}
                    onChange={updateField('maxDiscountAmount')}
                    fullWidth
                    inputProps={{ min: 0 }}
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
                  inputProps={{ min: 0 }}
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

          {/* Sản phẩm áp dụng */}
          <Card sx={cardSx}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <SectionTitle>Sản phẩm áp dụng</SectionTitle>

              <RadioGroup
                value={form.applyScope}
                onChange={(event) => {
                  setForm((previous) => ({
                    ...previous,
                    applyScope: event.target.value
                  }));
                  setError('');
                }}
              >
                <FormControlLabel value="ALL" control={<Radio />} label="Tất cả sản phẩm" />

                <FormControlLabel value="SELECTED" control={<Radio />} label="Chọn sản phẩm" />
              </RadioGroup>

              {form.applyScope === 'SELECTED' && (
                <Stack spacing={1.5} sx={{ mt: 2 }}>
                  <TextField
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="Tìm kiếm sản phẩm..."
                    size="small"
                    fullWidth
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchOutlined style={{ color: COLORS.muted }} />
                        </InputAdornment>
                      )
                    }}
                    sx={fieldSx}
                  />

                  <Typography variant="body2" color="text.secondary">
                    Đã chọn {form.productIds.length} / {products.length} sản phẩm
                  </Typography>

                  <Box
                    sx={{
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 2,
                      p: 1.25,
                      maxHeight: 430,
                      overflowY: 'auto'
                    }}
                  >
                    {productsLoading ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                        <CircularProgress size={28} />
                      </Box>
                    ) : productLoadError ? (
                      <Alert severity="error">{productLoadError}</Alert>
                    ) : filteredProducts.length === 0 ? (
                      <Typography color="text.secondary" variant="body2" sx={{ py: 4, textAlign: 'center' }}>
                        Không tìm thấy sản phẩm phù hợp.
                      </Typography>
                    ) : (
                      <Stack spacing={1}>
                        {filteredProducts.map((product) => {
                          const productId = getProductId(product);

                          return (
                            <ProductItem
                              key={productId}
                              product={product}
                              checked={form.productIds.includes(productId)}
                              onToggle={() => toggleProduct(productId)}
                            />
                          );
                        })}
                      </Stack>
                    )}
                  </Box>
                </Stack>
              )}
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
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={fieldSx}
                />

                <TextField
                  label="Thời gian kết thúc"
                  type="datetime-local"
                  value={form.endDate}
                  onChange={updateField('endDate')}
                  required
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={fieldSx}
                />

                <Alert severity="info">
                  Khuyến mãi chỉ được áp dụng trong khoảng thời gian đã chọn khi trạng thái khuyến mãi là Đang hoạt động.
                </Alert>
              </Stack>
            </CardContent>
          </Card>

          {/* Buttons */}
          <Stack direction="row" justifyContent="flex-end" spacing={1.5} sx={{ pb: 2 }}>
            <Button
              variant="outlined"
              onClick={() => navigate(`/promotions/${promotionId}`)}
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
              disabled={saving || productsLoading}
              sx={{
                bgcolor: COLORS.cyan,
                color: COLORS.dark,
                fontWeight: 700,
                borderRadius: 2,
                px: 3,
                py: 1.1,
                boxShadow: 'none',
                textTransform: 'none',
                '&:hover': {
                  bgcolor: COLORS.cyanHover,
                  boxShadow: 'none'
                }
              }}
            >
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}
