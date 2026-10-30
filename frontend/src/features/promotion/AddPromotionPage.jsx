
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

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

import {
  SaveOutlined,
  SearchOutlined
} from '@ant-design/icons';

import { createPromotion } from 'services/promotionService';
import { getProducts } from 'services/productService';

const COLORS = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5E7E3',
  cyan: '#8DE9F2',
  cyanHover: '#6DDDE9',
  price: '#45C7D2',
  background: '#FAFAF8',
  selected: '#F0FCFD'
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
  endDate: '',
  applyScope: 'ALL',
  productIds: []
};

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

const getProductId = (product) =>
    Number(product.productId ?? product.id);

const getProductName = (product) =>
    product.productName || product.name || 'Sản phẩm chưa có tên';

const getProductImage = (product) =>
    product.primaryImageUrl ||
    product.imageUrl ||
    product.thumbnailUrl ||
    product.image ||
    '';

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

  return formatCurrency(minPrice ?? maxPrice);
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
            border: `1px solid ${
                checked ? COLORS.cyan : COLORS.border
            }`,
            borderRadius: 2,
            bgcolor: checked ? COLORS.selected : '#fff',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            '&:hover': {
              borderColor: COLORS.cyan,
              bgcolor: COLORS.selected
            }
          }}
      >
        <Checkbox
            size="small"
            checked={checked}
            onChange={onToggle}
            onClick={(event) => event.stopPropagation()}
            sx={{
              p: 0.25,
              flexShrink: 0,
              '& .MuiSvgIcon-root': {
                fontSize: 19
              }
            }}
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
              <Typography
                  sx={{
                    color: '#A0A8B4',
                    fontSize: 11,
                    textAlign: 'center'
                  }}
              >
                No image
              </Typography>
          )}
        </Box>

        <Box
            sx={{
              flex: 1,
              minWidth: 0
            }}
        >
          <Typography
              sx={{
                color: COLORS.text,
                fontWeight: 600,
                fontSize: 14,
                mb: 0.5,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
              title={productName}
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

          <Typography
              sx={{
                color: COLORS.muted,
                fontSize: 12
              }}
          >
            Tồn kho: {Number(stock).toLocaleString('vi-VN')}
          </Typography>
        </Box>
      </Box>
  );
}

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

  if (
      Number.isNaN(start.getTime()) ||
      start.getTime() < now.getTime()
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

  const [form, setForm] = useState(initialForm);

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productLoadError, setProductLoadError] = useState('');
  const [productSearch, setProductSearch] = useState('');

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
          const activeProducts = rows
              .filter((product) => product.status === 'ACTIVE')
              .filter((product) =>
                  Number.isInteger(getProductId(product))
              );

          setProducts(activeProducts);
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

  // Tìm kiếm sản phẩm
  const filteredProducts = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase();

    if (!keyword) {
      return products;
    }

    return products.filter((product) =>
        getProductName(product)
            .toLowerCase()
            .includes(keyword)
    );
  }, [products, productSearch]);

  // Cập nhật trường dữ liệu
  const updateField = useCallback((field) => (event) => {
    const value = event.target.value;

    setForm((previous) => ({
      ...previous,
      [field]: value
    }));

    setError('');
  }, []);

  // Chọn hoặc bỏ chọn một sản phẩm
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
            p: { xs: 2, md: 3 },
            bgcolor: COLORS.background
          }}
      >
        {/* Tiêu đề trang */}
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
                  cursor: 'pointer'
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
            <Alert
                severity="error"
                sx={{ mb: 2 }}
                onClose={() => setError('')}
            >
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
                    <MenuItem value="PERCENT">
                      Theo phần trăm (%)
                    </MenuItem>

                    <MenuItem value="FIXED">
                      Số tiền cố định (VNĐ)
                    </MenuItem>
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
                        ...(form.discountType === 'PERCENT'
                            ? { max: 100 }
                            : {})
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
                  <FormControlLabel
                      value="ALL"
                      control={<Radio />}
                      label="Tất cả sản phẩm"
                  />

                  <FormControlLabel
                      value="SELECTED"
                      control={<Radio />}
                      label="Chọn sản phẩm"
                  />
                </RadioGroup>

                {form.applyScope === 'SELECTED' && (
                    <Stack spacing={1.5} sx={{ mt: 2 }}>

                      {/* Tìm kiếm sản phẩm */}
                      <TextField
                          value={productSearch}
                          onChange={(event) =>
                              setProductSearch(event.target.value)
                          }
                          placeholder="Tìm kiếm sản phẩm..."
                          size="small"
                          fullWidth
                          InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                  <SearchOutlined
                                      style={{ color: COLORS.muted }}
                                  />
                                </InputAdornment>
                            )
                          }}
                          sx={fieldSx}
                      />

                      {/* Số lượng đã chọn */}
                      <Typography
                          variant="body2"
                          color="text.secondary"
                      >
                        Đã chọn {form.productIds.length} / {products.length} sản phẩm
                      </Typography>

                      {/* Danh sách sản phẩm */}
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
                            <Box
                                sx={{
                                  display: 'flex',
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  py: 5
                                }}
                            >
                              <CircularProgress size={28} />
                            </Box>
                        ) : productLoadError ? (
                            <Alert severity="error">
                              {productLoadError}
                            </Alert>
                        ) : filteredProducts.length === 0 ? (
                            <Typography
                                color="text.secondary"
                                variant="body2"
                                sx={{
                                  py: 4,
                                  textAlign: 'center'
                                }}
                            >
                              {products.length === 0
                                  ? 'Chưa có sản phẩm đang hoạt động.'
                                  : 'Không tìm thấy sản phẩm phù hợp.'}
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
                    Khuyến mãi chỉ được áp dụng trong khoảng thời gian đã chọn
                    khi trạng thái khuyến mãi là Đang hoạt động.
                  </Alert>
                </Stack>
              </CardContent>
            </Card>

            {/* Nút thao tác */}
            <Stack
                direction="row"
                justifyContent="flex-end"
                spacing={1.5}
                sx={{ pb: 2 }}
            >
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
                  startIcon={
                    saving
                        ? <CircularProgress size={16} color="inherit" />
                        : <SaveOutlined />
                  }
                  disabled={saving || productsLoading}
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
