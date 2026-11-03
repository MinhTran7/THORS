
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Alert,
  Snackbar,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  InputAdornment,
  Link,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material';

import {
  ArrowLeftOutlined,
  PictureOutlined,
  SaveOutlined,
  SearchOutlined,
  FilterOutlined,
  CloseCircleOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';

import { createPromotion } from 'services/promotionService';
import { getProducts } from 'services/productService';
import { useCrumbs } from '../../layouts/crumbs';

const COLORS = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5E7E3',
  cyan: '#8DE9F2',
  cyanHover: '#6DDDE9',
  price: '#239EAA',
  background: '#FAFAF8',
  selected: '#EAFBFC',
  dark: '#123B43'
};

const cardSx = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 3,
  boxShadow: '0 3px 14px rgba(32, 45, 66, 0.035)',
  bgcolor: '#fff',
  overflow: 'hidden'
};

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2,
    bgcolor: '#fff',
    '& fieldset': {
      borderColor: COLORS.border
    },
    '&:hover fieldset': {
      borderColor: COLORS.cyanHover
    },
    '&.Mui-focused fieldset': {
      borderColor: COLORS.cyanHover,
      borderWidth: 1.5
    }
  },
  '& .MuiInputLabel-root.Mui-focused': {
    color: COLORS.dark
  }
};

const getCurrentDateTimeLocal = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
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

// Format tiền Việt Nam
const formatCurrency = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return `${number.toLocaleString('vi-VN')} đ`;
};

// Lấy ID sản phẩm
const getProductId = (product) =>
    Number(product.productId ?? product.id);

// Lấy tên sản phẩm
const getProductName = (product) =>
    product.productName || product.name || 'Sản phẩm chưa có tên';

// Lấy ảnh sản phẩm
const getProductImage = (product) =>
    product.primaryImageUrl ||
    product.imageUrl ||
    product.thumbnailUrl ||
    product.image ||
    '';

// Lấy giá nhỏ nhất của sản phẩm
const getProductMinPrice = (product) => {
  const values = [
    product.minPrice,
    product.maxPrice,
    product.price
  ]
      .filter((value) => value !== null && value !== undefined && value !== '')
      .map(Number)
      .filter(Number.isFinite);

  return values.length ? Math.min(...values) : null;
};

// Lấy giá lớn nhất của sản phẩm
const getProductMaxPrice = (product) => {
  const values = [
    product.minPrice,
    product.maxPrice,
    product.price
  ]
      .filter((value) => value !== null && value !== undefined && value !== '')
      .map(Number)
      .filter(Number.isFinite);

  return values.length ? Math.max(...values) : null;
};

// Giá hiển thị trên sản phẩm
const getProductPrice = (product) => {
  const minPrice = product.minPrice;
  const maxPrice = product.maxPrice;

  if (minPrice == null && maxPrice == null) {
    return 'Chưa có giá';
  }

  if (
      minPrice != null &&
      maxPrice != null &&
      Number(minPrice) !== Number(maxPrice)
  ) {
    return `${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)}`;
  }

  return formatCurrency(minPrice ?? maxPrice ?? product.price);
};

// Lấy thông tin danh mục
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

// Tiêu đề từng khu vực
function SectionTitle({ children, description }) {
  return (
      <Box sx={{ mb: 2.5 }}>
        <Typography
            sx={{
              color: COLORS.text,
              fontSize: 16,
              fontWeight: 700
            }}
        >
          {children}
        </Typography>

        {description && (
            <Typography
                sx={{
                  color: COLORS.muted,
                  fontSize: 12.5,
                  mt: 0.5
                }}
            >
              {description}
            </Typography>
        )}
      </Box>
  );
}

// Thông tin sản phẩm trong danh sách
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
        border: `1px solid ${checked ? '#FACC15' : COLORS.border}`,
        borderRadius: 2.5,
        bgcolor: checked ? '#FEFCE8' : '#FFFFFF',
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
          color: COLORS.border,
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
          border: `1px solid ${COLORS.border}`,
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
          <PictureOutlined style={{ color: '#94A3B8', fontSize: 16 }} />
        )}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          title={productName}
          sx={{
            color: COLORS.text,
            fontWeight: 600,
            fontSize: 13.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {productName}
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 0.25 }}>
          <Typography sx={{ color: '#202D42', fontSize: 12.5, fontWeight: 700 }}>
            {productPrice}
          </Typography>
          <Typography sx={{ color: COLORS.muted, fontSize: 12 }}>
            Tồn kho: {Number(stock).toLocaleString('vi-VN')}
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}

// Kiểm tra dữ liệu trước khi tạo
function validateForm(form) {
  const name = form.name.trim();
  const discountValue = Number(form.discountValue);
  const minOrderValue = Number(form.minOrderValue || 0);

  const maxDiscountAmount =
      form.maxDiscountAmount === ''
          ? null
          : Number(form.maxDiscountAmount);

  const usageLimit =
      form.usageLimit === ''
          ? null
          : Number(form.usageLimit);

  if (!name) {
    return 'Vui lòng nhập tên khuyến mãi.';
  }

  if (
      form.discountValue === '' ||
      !Number.isFinite(discountValue) ||
      discountValue <= 0
  ) {
    return 'Giá trị giảm giá phải lớn hơn 0.';
  }

  if (
      form.discountType === 'PERCENT' &&
      discountValue > 100
  ) {
    return 'Mức giảm theo phần trăm không được vượt quá 100%.';
  }

  if (
      form.discountType === 'FIXED' &&
      !Number.isInteger(discountValue)
  ) {
    return 'Số tiền giảm cố định phải là số nguyên VNĐ.';
  }

  if (!form.startDate || !form.endDate) {
    return 'Vui lòng chọn thời gian bắt đầu và kết thúc.';
  }

  const now = new Date();
  const start = new Date(form.startDate);
  const end = new Date(form.endDate);

  // Cho phép khoảng đệm 15 phút
  if (
      Number.isNaN(start.getTime()) ||
      start.getTime() < now.getTime() - 15 * 60 * 1000
  ) {
    return 'Thời gian bắt đầu không được ở trong quá khứ.';
  }

  if (
      Number.isNaN(end.getTime()) ||
      end.getTime() <= start.getTime()
  ) {
    return 'Thời gian kết thúc phải sau thời gian bắt đầu.';
  }

  if (
      !Number.isFinite(minOrderValue) ||
      minOrderValue < 0
  ) {
    return 'Giá trị đơn hàng tối thiểu không được âm.';
  }

  if (
      maxDiscountAmount !== null &&
      (
          !Number.isFinite(maxDiscountAmount) ||
          maxDiscountAmount < 0
      )
  ) {
    return 'Số tiền giảm tối đa không được âm.';
  }

  if (
      usageLimit !== null &&
      (!Number.isInteger(usageLimit) || usageLimit <= 0)
  ) {
    return 'Giới hạn lượt sử dụng phải là số nguyên lớn hơn 0.';
  }

  if (
      form.applyScope === 'SELECTED' &&
      form.productIds.length === 0
  ) {
    return 'Vui lòng chọn ít nhất một sản phẩm áp dụng.';
  }

  return '';
}

export default function AddPromotionPage() {
  const navigate = useNavigate();
  useCrumbs(['Danh sách khuyến mãi', 'Thêm khuyến mãi']);

  const [form, setForm] = useState(initialForm);

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productLoadError, setProductLoadError] = useState('');

  // Tìm kiếm và bộ lọc
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [priceSort, setPriceSort] = useState('DEFAULT');

  // Tải danh sách sản phẩm
  useEffect(() => {
    let active = true;

    const loadProducts = async () => {
      setProductsLoading(true);
      setProductLoadError('');

      try {
        const response = await getProducts();

        const rows = Array.isArray(response)
            ? response
            : response?.content || response?.data || [];

        if (!Array.isArray(rows)) {
          throw new Error('Dữ liệu sản phẩm không hợp lệ.');
        }

        if (active) {
          const activeOnlineProducts = rows
              .filter((product) => product.status === 'ACTIVE')
              .filter((product) => Number.isInteger(getProductId(product)))
              .filter((product) => Number(product.onlineVariantCount || 0) > 0);

          setProducts(activeOnlineProducts);
        }
      } catch (err) {
        if (active) {
          setProductLoadError(
              err?.response?.data?.message ||
              err?.message ||
              'Không thể tải danh sách sản phẩm.'
          );
        }
      } finally {
        if (active) {
          setProductsLoading(false);
        }
      }
    };

    loadProducts();

    return () => {
      active = false;
    };
  }, []);

  // Tạo danh sách danh mục
  const productCategories = useMemo(() => {
    const categoryMap = new Map();

    products.forEach((product) => {
      const categoryId = getProductCategoryId(product);
      const categoryName = getProductCategoryName(product);

      if (categoryId || categoryName !== 'Chưa phân loại') {
        categoryMap.set(
            categoryId || categoryName,
            categoryName
        );
      }
    });

    return Array.from(categoryMap.entries()).map(
        ([id, name]) => ({ id, name })
    );
  }, [products]);

  // Lọc và sắp xếp sản phẩm
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

    // Sắp xếp giá
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
  }, [
    products,
    productSearch,
    categoryFilter,
    priceSort
  ]);

  // Cập nhật trường dữ liệu
  const updateField = useCallback((field) => (event) => {
    const value = event.target.value;

    setForm((previous) => ({
      ...previous,
      [field]: value
    }));

    setError('');
  }, []);

  // Chọn hoặc bỏ chọn sản phẩm
  const toggleProduct = useCallback((productId) => {
    setForm((previous) => {
      const isSelected = previous.productIds.includes(productId);

      return {
        ...previous,
        productIds: isSelected
            ? previous.productIds.filter((id) => id !== productId)
            : [...previous.productIds, productId]
      };
    });

    setError('');
  }, []);

  // Xóa bộ lọc
  const resetProductFilters = () => {
    setProductSearch('');
    setCategoryFilter('ALL');
    setPriceSort('DEFAULT');
  };

  // Gửi yêu cầu tạo khuyến mãi
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
        name: form.name.trim(),
        description: form.description.trim() || null,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        minOrderValue: Number(form.minOrderValue || 0),
        maxDiscountAmount:
            form.maxDiscountAmount === ''
                ? null
                : Number(form.maxDiscountAmount),
        usageLimit:
            form.usageLimit === ''
                ? null
                : Number(form.usageLimit),
        startDate: form.startDate,
        endDate: form.endDate,
        applyScope: form.applyScope,
        productIds:
            form.applyScope === 'SELECTED'
                ? form.productIds
                : []
      });

      navigate('/promotions', {
        state: {
          successMessage: 'Tạo khuyến mãi thành công.'
        }
      });
    } catch (err) {
      setError(
          err?.response?.data?.message ||
          err?.message ||
          'Không thể tạo khuyến mãi. Vui lòng thử lại.'
      );
    } finally {
      setSaving(false);
    }
  };

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
        {/* Header - không còn nền vàng */}
        <Box sx={{ mb: 3 }}>
          <Breadcrumbs
              separator="/"
              sx={{
                mb: 1.5,
                fontSize: 13,
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
                  cursor: 'pointer'
                }}
            >
              Danh sách khuyến mãi
            </Link>

            <Typography
                sx={{
                  color: COLORS.text,
                  fontSize: 'inherit',
                  fontWeight: 600
                }}
            >
              Thêm khuyến mãi
            </Typography>
          </Breadcrumbs>

          <Typography
              sx={{
                color: COLORS.text,
                fontSize: { xs: 26, md: 32 },
                fontWeight: 700,
                lineHeight: 1.3
              }}
          >
            Thêm khuyến mãi
          </Typography>

          <Typography
              sx={{
                color: COLORS.muted,
                fontSize: 13.5,
                mt: 0.75
              }}
          >
            Tạo chương trình ưu đãi mới cho cửa hàng.
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

            {/* Thông tin tổng quan */}
            <Card sx={cardSx}>
              <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                <SectionTitle description="Nhập tên, mô tả và thời gian áp dụng cho chương trình khuyến mãi.">
                  Thông tin tổng quan
                </SectionTitle>

                <Stack spacing={2}>
                  <TextField
                      label="Tên khuyến mãi"
                      value={form.name}
                      onChange={updateField('name')}
                      required
                      fullWidth
                      inputProps={{ maxLength: 100 }}
                      placeholder="Ví dụ: Ưu đãi mùa hè"
                      sx={fieldSx}
                  />

                  <TextField
                      label="Mô tả"
                      value={form.description}
                      onChange={updateField('description')}
                      multiline
                      minRows={3}
                      fullWidth
                      placeholder="Nhập mô tả chương trình..."
                      sx={fieldSx}
                  />

                  <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                          xs: '1fr',
                          md: 'repeat(2, minmax(0, 1fr))'
                        },
                        gap: 2
                      }}
                  >
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
                        inputProps={{
                          min: getCurrentDateTimeLocal()
                        }}
                        slotProps={{ inputLabel: { shrink: true } }}
                        sx={fieldSx}
                    />
                  </Box>
                </Stack>
              </CardContent>
            </Card>

            {/* Điều kiện áp dụng */}
            <Card sx={cardSx}>
              <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                <SectionTitle description="Thiết lập mức ưu đãi và điều kiện áp dụng.">
                  Điều kiện áp dụng
                </SectionTitle>

                <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: '1fr',
                        md: 'repeat(2, minmax(0, 1fr))'
                      },
                      gap: 2
                    }}
                >
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
                      label={
                        form.discountType === 'PERCENT'
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
                        step: form.discountType === 'FIXED' ? 1 : 'any',
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
                </Box>
              </CardContent>
            </Card>

            {/* Sản phẩm áp dụng */}
            <Card sx={cardSx}>
              <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                <SectionTitle>Phạm vi áp dụng</SectionTitle>

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
                  <FormControlLabel
                    value="ALL"
                    control={<Radio sx={{ '&.Mui-checked': { color: '#8EECF5' } }} />}
                    label={<Typography sx={{ fontSize: 14, fontWeight: 600 }}>Toàn bộ sản phẩm trong cửa hàng</Typography>}
                  />
                  <FormControlLabel
                    value="SELECTED"
                    control={<Radio sx={{ '&.Mui-checked': { color: '#8EECF5' } }} />}
                    label={<Typography sx={{ fontSize: 14, fontWeight: 600 }}>Chỉ áp dụng cho các sản phẩm được chọn</Typography>}
                  />
                </RadioGroup>

                {form.applyScope === 'SELECTED' && (
                  <Box
                    sx={{
                      mt: 2.5,
                      p: { xs: 1.5, md: 2 },
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 2.5,
                      bgcolor: '#FAFAF8'
                    }}
                  >
                    <Box sx={{ mb: 2 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>
                        Chọn sản phẩm áp dụng
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: COLORS.muted, mt: 0.25 }}>
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
                              <SearchOutlined style={{ color: COLORS.muted, fontSize: 15 }} />
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
                            color: COLORS.muted,
                            p: 0,
                            minWidth: 'auto',
                            '&:hover': { color: COLORS.text }
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
                          <CircularProgress size={28} sx={{ color: COLORS.cyan }} />
                        </Box>
                      ) : filteredProducts.length === 0 ? (
                        <Typography sx={{ py: 3, textAlign: 'center', color: COLORS.muted, fontSize: 13.5 }}>
                          Không tìm thấy sản phẩm bán online nào phù hợp.
                        </Typography>
                      ) : (
                        <Stack spacing={1}>
                          {filteredProducts.map((product) => {
                            const productId = getProductId(product);
                            const isChecked = form.productIds.includes(productId);
                            return (
                              <ProductItem
                                key={productId}
                                product={product}
                                checked={isChecked}
                                onToggle={() => toggleProduct(productId)}
                              />
                            );
                          })}
                        </Stack>
                      )}
                    </Box>
                  </Box>
                )}
              </CardContent>
            </Card>

            {/* Nút thao tác */}
            <Stack
                direction={{ xs: 'column-reverse', sm: 'row' }}
                justifyContent="flex-end"
                spacing={1.5}
                sx={{ pb: 2 }}
            >
              <Button
                  variant="outlined"
                  onClick={() => navigate('/promotions')}
                  disabled={saving}
                  sx={{
                    minWidth: 110,
                    borderRadius: 2,
                    textTransform: 'none',
                    color: COLORS.text,
                    borderColor: COLORS.border,
                    py: 1,
                    '&:hover': {
                      borderColor: COLORS.cyanHover,
                      bgcolor: COLORS.selected
                    }
                  }}
              >
                Hủy
              </Button>

              <Button
                  type="submit"
                  variant="contained"
                  startIcon={
                    saving
                        ? <CircularProgress size={16} color="inherit" />
                        : <SaveOutlined />
                  }
                  disabled={saving || productsLoading}
                  sx={{
                    minWidth: 165,
                    bgcolor: COLORS.cyan,
                    color: COLORS.dark,
                    fontWeight: 700,
                    borderRadius: 2,
                    px: 3,
                    py: 1,
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
