import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Grid,
  InputAdornment,
  MenuItem,
  Radio,
  RadioGroup,
  Snackbar,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import {
  ArrowLeftOutlined,
  PictureOutlined,
  SaveOutlined,
  SearchOutlined
} from '@ant-design/icons';
import { getPromotionById, updatePromotion } from 'services/promotionService';
import { getProducts } from 'services/productService';
import { useCrumbs } from '../../layouts/crumbs';

const C = {
  text: '#1E293B',
  muted: '#64748B',
  subtle: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  cyan: '#8EECF5',
  cyanHover: '#76E5EF',
  cyanText: '#8EECF5',
  cream: '#FFF7AE',
  creamHover: '#FFF294',
  creamText: '#713F12'
};

const cardSx = {
  bgcolor: C.surface,
  borderRadius: 3.5,
  border: `1px solid ${C.border}`,
  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
  p: { xs: 2.5, sm: 3.5 }
};

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: C.surface,
    borderRadius: 2.5,
    height: 44,
    fontSize: 13.5,
    '& fieldset': { borderColor: C.border },
    '&:hover fieldset': { borderColor: C.cyan },
    '&.Mui-focused fieldset': { borderColor: C.cyan }
  },
  '& .MuiInputLabel-root': {
    fontSize: 13.5
  },
  '& .MuiInputLabel-root.Mui-focused': {
    color: C.cyanText
  }
};

const multilineFieldSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: C.surface,
    borderRadius: 2.5,
    fontSize: 13.5,
    '& fieldset': { borderColor: C.border },
    '&:hover fieldset': { borderColor: C.cyan },
    '&.Mui-focused fieldset': { borderColor: C.cyan }
  },
  '& .MuiInputLabel-root': {
    fontSize: 13.5
  },
  '& .MuiInputLabel-root.Mui-focused': {
    color: C.cyanText
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

const getProductId = (product) => Number(product.productId ?? product.id);
const getProductName = (product) => product.productName || product.name || 'Sản phẩm chưa có tên';
const getProductImage = (product) =>
  product.primaryImageUrl || product.imageUrl || product.thumbnailUrl || product.image || '';

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

const getProductCategoryId = (product) =>
  String(
    product.categoryId ??
    product.category?.categoryId ??
    product.category?.id ??
    ''
  );

const getProductCategoryName = (product) =>
  product.categoryName ||
  product.category?.categoryName ||
  product.category?.name ||
  'Chưa phân loại';

const getProductMinPrice = (product) => {
  const values = [product.minPrice, product.maxPrice, product.price]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map(Number)
    .filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
};

const getProductMaxPrice = (product) => {
  const values = [product.minPrice, product.maxPrice, product.price]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map(Number)
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
};

const toDateTimeLocal = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const getProductRows = (response) => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.content)) return response.content;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.content)) return response.data.content;
  return [];
};

const getPromotionData = (response) => response?.data?.data ?? response?.data ?? response;

const validateForm = (form) => {
  const discountValue = Number(form.discountValue);
  const minOrderValue = Number(form.minOrderValue || 0);
  const maxDiscountAmount = form.maxDiscountAmount === '' ? null : Number(form.maxDiscountAmount);
  const usageLimit = form.usageLimit === '' ? null : Number(form.usageLimit);

  if (!form.name.trim()) return 'Vui lòng nhập tên chương trình khuyến mãi.';
  if (form.discountValue === '' || !Number.isFinite(discountValue) || discountValue <= 0) {
    return 'Giá trị giảm giá phải lớn hơn 0.';
  }
  if (['PERCENT', 'PERCENTAGE'].includes(form.discountType) && discountValue > 100) {
    return 'Mức giảm theo phần trăm không được vượt quá 100%.';
  }
  if (form.discountType === 'FIXED' && !Number.isInteger(discountValue)) {
    return 'Số tiền giảm cố định phải là số nguyên (VNĐ).';
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

function SectionTitle({ children }) {
  return (
    <Typography sx={{ mb: 2, color: C.text, fontSize: 16, fontWeight: 800 }}>
      {children}
    </Typography>
  );
}

function ProductItem({ product, checked, onToggle }) {
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
        gap: 1.5,
        p: 1.25,
        border: `1px solid ${checked ? '#FACC15' : C.borderLight}`,
        borderRadius: 2.5,
        bgcolor: checked ? '#FEFCE8' : C.surface,
        cursor: 'pointer'
      }}
    >
      <Checkbox
        size="small"
        checked={checked}
        onChange={onToggle}
        onClick={(event) => event.stopPropagation()}
        sx={{
          p: 0.5,
          color: C.border,
          '&.Mui-checked': { color: '#EAB308' }
        }}
      />

      <Box
        sx={{
          width: 48,
          height: 48,
          flexShrink: 0,
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: '#F8FAFC',
          border: `1px solid ${C.borderLight}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {imageUrl ? (
          <Box
            component="img"
            src={imageUrl}
            alt={productName}
            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <PictureOutlined style={{ color: C.subtle, fontSize: 16 }} />
        )}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          title={productName}
          sx={{
            color: C.text,
            fontWeight: 600,
            fontSize: 13.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {productName}
        </Typography>
        <Stack direction="row" spacing={2} sx={{ mt: 0.25 }}>
          <Typography sx={{ color: '#202D42', fontSize: 12.5, fontWeight: 700 }}>
            {productPrice}
          </Typography>
          <Typography sx={{ color: C.muted, fontSize: 12 }}>
            Tồn kho: {Number(stock).toLocaleString('vi-VN')}
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}

export default function EditPromotionPage() {
  const navigate = useNavigate();
  const { promotionId } = useParams();

  useCrumbs(['Danh sách khuyến mãi', 'Chỉnh sửa khuyến mãi']);

  const [form, setForm] = useState(initialForm);
  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [priceSort, setPriceSort] = useState('DEFAULT');
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      setLoading(true);
      setError('');
      setProductsLoading(true);
      try {
        const [promotionResponse, productResponse] = await Promise.all([
          getPromotionById(promotionId),
          getProducts()
        ]);
        if (!active) return;
        const promotion = getPromotionData(promotionResponse);
        const rows = getProductRows(productResponse);

        if (!promotion?.promotionId) {
          throw new Error('Không tìm thấy thông tin khuyến mãi.');
        }

        const selectedIds = Array.isArray(promotion.productIds) ? promotion.productIds.map(Number) : [];

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

        const availableProducts = rows.filter((product) => {
          const id = getProductId(product);
          const isOnline = product.status === 'ACTIVE' && Number(product.onlineVariantCount || 0) > 0;
          return Number.isInteger(id) && (isOnline || selectedIds.includes(id));
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

  const productCategories = useMemo(() => {
    const categoryMap = new Map();
    products.forEach((product) => {
      const categoryId = getProductCategoryId(product);
      const categoryName = getProductCategoryName(product);
      if (categoryId || categoryName !== 'Chưa phân loại') {
        categoryMap.set(categoryId || categoryName, categoryName);
      }
    });
    return Array.from(categoryMap.entries()).map(([id, name]) => ({ id, name }));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const keyword = productSearch.trim().toLocaleLowerCase('vi-VN');

    let result = products.filter((product) => {
      const matchesKeyword = getProductName(product)
        .toLocaleLowerCase('vi-VN')
        .includes(keyword);

      const categoryId = getProductCategoryId(product);
      const categoryName = getProductCategoryName(product);

      const matchesCategory =
        categoryFilter === 'ALL' ||
        categoryId === categoryFilter ||
        categoryName === categoryFilter;

      return matchesKeyword && matchesCategory;
    });

    if (priceSort === 'PRICE_HIGH') {
      result.sort((a, b) => {
        const priceA = getProductMaxPrice(a) ?? -1;
        const priceB = getProductMaxPrice(b) ?? -1;
        return priceB - priceA;
      });
    } else if (priceSort === 'PRICE_LOW') {
      result.sort((a, b) => {
        const priceA = getProductMinPrice(a) ?? Number.MAX_SAFE_INTEGER;
        const priceB = getProductMinPrice(b) ?? Number.MAX_SAFE_INTEGER;
        return priceA - priceB;
      });
    }

    return result;
  }, [products, productSearch, categoryFilter, priceSort]);

  const updateField = useCallback(
    (field) => (event) => {
      const value = event.target.value;
      setForm((prev) => ({ ...prev, [field]: value }));
      setError('');
    },
    []
  );

  const toggleProduct = useCallback((productId) => {
    setForm((prev) => {
      const isSelected = prev.productIds.includes(productId);
      return {
        ...prev,
        productIds: isSelected
          ? prev.productIds.filter((id) => id !== productId)
          : [...prev.productIds, productId]
      };
    });
    setError('');
  }, []);

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
      navigate(`/promotions/${promotionId}`);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Không thể cập nhật khuyến mãi. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ maxWidth: 1000, mx: 'auto', py: 10, textAlign: 'center' }}>
        <CircularProgress size={38} sx={{ color: C.cyan }} />
        <Typography sx={{ mt: 2, color: C.muted, fontSize: 13.5 }}>
          Đang tải thông tin chỉnh sửa...
        </Typography>
      </Box>
    );
  }

  if (error && !form.name) {
    return (
      <Box sx={{ maxWidth: 1000, mx: 'auto', py: 8 }}>
        <Card sx={{ p: 4, textAlign: 'center', borderRadius: 3.5, border: `1px solid ${C.border}` }}>
          <Typography color="error" sx={{ fontWeight: 700, fontSize: 15 }}>
            {error}
          </Typography>
          <Button
            startIcon={<ArrowLeftOutlined />}
            onClick={() => navigate('/promotions')}
            sx={{
              mt: 2,
              textTransform: 'none',
              bgcolor: C.cyan,
              color: C.text,
              fontWeight: 700,
              borderRadius: 2.5,
              px: 2.5,
              '&:hover': { bgcolor: C.cyanHover }
            }}
          >
            Quay lại danh sách
          </Button>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', color: C.text, pb: 6 }}>
      {/* ─── ĐIỀU HƯỚNG QUAY LẠI ─── */}
      <Box
        onClick={() => navigate(`/promotions/${promotionId}`)}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 1,
          color: C.muted,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          mb: 2,
          transition: 'color 0.15s ease',
          '&:hover': { color: C.text }
        }}
      >
        <ArrowLeftOutlined style={{ fontSize: 13 }} />
        <span>Chi tiết khuyến mãi</span>
      </Box>

      {/* ─── TIÊU ĐỀ ─── */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h3" sx={{ fontWeight: 800, color: C.text, fontSize: { xs: 22, sm: 28 } }}>
          Chỉnh sửa khuyến mãi
        </Typography>
        <Typography sx={{ mt: 0.5, fontSize: 13.5, color: C.muted }}>
          Cập nhật thông tin và điều kiện áp dụng của chương trình.
        </Typography>
      </Box>

      {/* ─── TOAST THÔNG BÁO GÓC MÀN HÌNH (TỰ MẤT SAU 5 GIÂY) ─── */}
      <Snackbar
        open={Boolean(error)}
        autoHideDuration={5000}
        onClose={() => setError('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ mt: 7 }}
      >
        <Alert
          severity="error"
          onClose={() => setError('')}
          sx={{
            width: '100%',
            maxWidth: 300,
            minHeight: 76,
            py: 1.75,
            px: 2,
            bgcolor: '#FFFFFF',
            color: '#1E293B',
            borderRadius: 1.5,
            border: '1px solid #E2E8F0',
            borderLeft: '5px solid #EF4444',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            fontWeight: 600,
            fontSize: 13,
            alignItems: 'flex-start',
            '& .MuiAlert-icon': {
              color: '#EF4444',
              fontSize: 20,
              mt: 0.25,
              mr: 1.25
            },
            '& .MuiAlert-message': {
              color: '#1E293B',
              p: 0,
              lineHeight: 1.5
            },
            '& .MuiAlert-action': {
              color: '#64748B',
              p: 0,
              mt: -0.25,
              ml: 1
            }
          }}
        >
          {error}
        </Alert>
      </Snackbar>

      <Box component="form" onSubmit={handleSubmit}>
        <Stack spacing={2.5}>
          {/* ─── CARD 1: THÔNG TIN TỔNG QUAN ─── */}
          <Card sx={cardSx}>
            <SectionTitle>Thông tin tổng quan</SectionTitle>
            <Stack spacing={2.5}>
              <TextField
                label="Tên chương trình khuyến mãi"
                value={form.name}
                onChange={updateField('name')}
                required
                fullWidth
                inputProps={{ maxLength: 100 }}
                placeholder="Nhập tên chương trình (ví dụ: Khuyến mãi mùa hè 20%...)"
                sx={fieldSx}
              />
              <TextField
                label="Mô tả chi tiết"
                value={form.description}
                onChange={updateField('description')}
                multiline
                minRows={3}
                fullWidth
                placeholder="Nhập mô tả hoặc ghi chú điều kiện chương trình..."
                sx={multilineFieldSx}
              />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
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
                </Grid>
                <Grid item xs={12} sm={6}>
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
                </Grid>
              </Grid>
            </Stack>
          </Card>

          {/* ─── CARD 2: ĐIỀU KIỆN ÁP DỤNG ─── */}
          <Card sx={cardSx}>
            <SectionTitle>Điều kiện áp dụng</SectionTitle>
            <Stack spacing={2.5}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
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
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    label={
                      ['PERCENT', 'PERCENTAGE'].includes(form.discountType)
                        ? 'Tỷ lệ giảm giá (%)'
                        : 'Số tiền giảm giá (VNĐ)'
                    }
                    type="number"
                    value={form.discountValue}
                    onChange={updateField('discountValue')}
                    required
                    fullWidth
                    inputProps={{
                      min: 0,
                      step: form.discountType === 'FIXED' ? 1000 : 'any',
                      ...(form.discountType === 'PERCENT' ? { max: 100 } : {})
                    }}
                    sx={fieldSx}
                  />
                </Grid>
              </Grid>

              {['PERCENT', 'PERCENTAGE'].includes(form.discountType) && (
                <TextField
                  label="Số tiền giảm tối đa (VNĐ)"
                  type="number"
                  value={form.maxDiscountAmount}
                  onChange={updateField('maxDiscountAmount')}
                  fullWidth
                  inputProps={{ min: 0, step: 1000 }}
                  helperText="Để trống nếu không giới hạn số tiền giảm."
                  sx={fieldSx}
                />
              )}

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Giá trị đơn hàng tối thiểu (VNĐ)"
                    type="number"
                    value={form.minOrderValue}
                    onChange={updateField('minOrderValue')}
                    fullWidth
                    inputProps={{ min: 0, step: 1000 }}
                    helperText="Áp dụng khi đơn hàng đạt từ mức này trở lên."
                    sx={fieldSx}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Giới hạn lượt sử dụng"
                    type="number"
                    value={form.usageLimit}
                    onChange={updateField('usageLimit')}
                    fullWidth
                    inputProps={{ min: 1, step: 1 }}
                    helperText="Để trống nếu không giới hạn số lượt áp dụng."
                    sx={fieldSx}
                  />
                </Grid>
              </Grid>
            </Stack>
          </Card>

          {/* ─── CARD 3: PHẠM VI ÁP DỤNG ─── */}
          <Card sx={cardSx}>
            <SectionTitle>Phạm vi áp dụng</SectionTitle>
            <RadioGroup
              value={form.applyScope}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, applyScope: event.target.value }));
                setError('');
              }}
            >
              <FormControlLabel
                value="ALL"
                control={<Radio sx={{ '&.Mui-checked': { color: C.cyanText } }} />}
                label={<Typography sx={{ fontSize: 14, fontWeight: 600 }}>Toàn bộ sản phẩm trong cửa hàng</Typography>}
              />
              <FormControlLabel
                value="SELECTED"
                control={<Radio sx={{ '&.Mui-checked': { color: C.cyanText } }} />}
                label={<Typography sx={{ fontSize: 14, fontWeight: 600 }}>Chỉ áp dụng cho các sản phẩm được chọn</Typography>}
              />
            </RadioGroup>

            {form.applyScope === 'SELECTED' && (
              <Box
                sx={{
                  mt: 2.5,
                  p: { xs: 1.5, md: 2 },
                  border: `1px solid ${C.border}`,
                  borderRadius: 2.5,
                  bgcolor: '#FAFAF8'
                }}
              >
                <Box sx={{ mb: 2 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                    Chọn sản phẩm áp dụng
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: C.muted, mt: 0.25 }}>
                    Chỉ hiển thị các sản phẩm đang được bật bán online.
                  </Typography>
                </Box>

                {/* Bộ lọc tìm kiếm và danh mục */}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr 1fr' }, gap: 1.5, mb: 2 }}>
                  <TextField
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Tìm theo tên sản phẩm..."
                    size="small"
                    fullWidth
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchOutlined style={{ color: C.muted, fontSize: 15 }} />
                        </InputAdornment>
                      )
                    }}
                    sx={fieldSx}
                  />

                  <TextField
                    select
                    size="small"
                    label="Danh mục"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    sx={fieldSx}
                  >
                    <MenuItem value="ALL">Tất cả danh mục</MenuItem>
                    {productCategories.map((c) => (
                      <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    select
                    size="small"
                    label="Sắp xếp giá"
                    value={priceSort}
                    onChange={(e) => setPriceSort(e.target.value)}
                    sx={fieldSx}
                  >
                    <MenuItem value="DEFAULT">Mặc định</MenuItem>
                    <MenuItem value="PRICE_HIGH">Giá cao đến thấp</MenuItem>
                    <MenuItem value="PRICE_LOW">Giá thấp đến cao</MenuItem>
                  </TextField>
                </Box>

                {/* Counter & status */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#202D42' }}>
                    Đã chọn: {form.productIds.length} / {products.length} sản phẩm
                  </Typography>
                  {form.productIds.length > 0 && (
                    <Button
                      size="small"
                      onClick={() => setForm((prev) => ({ ...prev, productIds: [] }))}
                      sx={{
                        textTransform: 'none',
                        fontSize: 12,
                        fontWeight: 600,
                        color: C.muted,
                        p: 0,
                        minWidth: 'auto',
                        '&:hover': { color: C.text }
                      }}
                    >
                      Bỏ chọn tất cả
                    </Button>
                  )}
                </Box>

                {/* Danh sách cuộn sản phẩm */}
                <Box
                  sx={{
                    maxHeight: 420,
                    overflowY: 'auto',
                    pr: 0.5,
                    '&::-webkit-scrollbar': { width: 5 },
                    '&::-webkit-scrollbar-thumb': { bgcolor: '#CBD5E1', borderRadius: 4 }
                  }}
                >
                  {productsLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                      <CircularProgress size={28} sx={{ color: C.cyan }} />
                    </Box>
                  ) : filteredProducts.length === 0 ? (
                    <Typography sx={{ py: 3, textAlign: 'center', color: C.muted, fontSize: 13.5 }}>
                      Không tìm thấy sản phẩm bán online nào phù hợp.
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
              </Box>
            )}
          </Card>

          {/* ─── NÚT HÀNH ĐỘNG ─── */}
          <Stack direction="row" justifyContent="flex-end" spacing={2} sx={{ pt: 1 }}>
            <Button
              variant="outlined"
              onClick={() => navigate(`/promotions/${promotionId}`)}
              disabled={saving}
              sx={{
                height: 44,
                px: 3,
                borderRadius: 2.5,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: 13.5,
                color: C.text,
                borderColor: C.border,
                bgcolor: C.surface,
                '&:hover': {
                  borderColor: C.border,
                  bgcolor: C.surface
                }
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
                height: 44,
                px: 3.5,
                borderRadius: 2.5,
                bgcolor: C.cyan,
                color: C.text,
                fontWeight: 700,
                fontSize: 13.5,
                boxShadow: 'none',
                textTransform: 'none',
                '&:hover': {
                  bgcolor: C.cyanHover,
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
