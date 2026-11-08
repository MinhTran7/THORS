import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';

import {
  ArrowLeftOutlined,
  PlusOutlined,
  SaveOutlined
} from '@ant-design/icons';

import {
  getProductById,
  updateProduct
} from '../../services/productService';

import { getCategories } from '../../services/categoryService';
import { C, cardSx, outlineButtonSx, primaryButtonSx } from '../customer/theme';

const inputSx = (hasError) => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: 2.5,
    minHeight: 44,
    fontSize: 13.5,
    '& fieldset': { borderColor: hasError ? C.error : C.border },
    '&:hover fieldset, &.Mui-focused fieldset': { borderColor: hasError ? C.error : C.cyan }
  }
});

const linkButtonSx = (color, hoverBg) => ({
  textTransform: 'none',
  fontSize: 13,
  fontWeight: 600,
  color,
  borderRadius: 1.5,
  px: 1.25,
  py: 0.5,
  '&:hover': { bgcolor: hoverBg }
});

const emptyVariant = () => ({
  detailId: null,
  size: '',
  color: '',
  price: ''
});

export default function EditProductPage() {
  const { productId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [categories, setCategories] = useState([]);
  const [images, setImages] = useState([]);

  const [form, setForm] = useState({
    productName: '',
    categoryId: '',
    description: '',
    variants: []
  });

  // ==========================================
  // LOAD PRODUCT AND CATEGORIES
  // ==========================================

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        setLoading(true);
        setError('');

        const [productData, categoryData] = await Promise.all([
          getProductById(productId),
          getCategories()
        ]);

        if (!productData?.product) {
          throw new Error('Không tìm thấy thông tin sản phẩm.');
        }

        if (!active) return;

        const { product, variants, images: productImages } = productData;

        setForm({
          productName: product.productName || '',
          categoryId: String(product.categoryId ?? ''),
          description: product.description || '',
          variants: (variants || []).map((variant) => ({
            detailId: Number(variant.detailId),
            size: variant.size || '',
            color: variant.color || '',
            price: String(variant.price ?? '')
          }))
        });

        setImages(productImages || []);

        const categoryList = Array.isArray(categoryData)
          ? categoryData
          : Array.isArray(categoryData?.content)
            ? categoryData.content
            : Array.isArray(categoryData?.data)
              ? categoryData.data
              : [];

        setCategories(categoryList);
      } catch (err) {
        if (active) {
          setError(
            err?.message || 'Không thể tải thông tin sản phẩm.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [productId]);

  // ==========================================
  // UPDATE FORM
  // ==========================================

  const updateField = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value
    }));
  };

  const updateVariantField = (index, field, value) => {
    setForm((previous) => ({
      ...previous,
      variants: previous.variants.map((variant, i) =>
        i === index
          ? { ...variant, [field]: value }
          : variant
      )
    }));
  };

  const addVariant = () => {
    setForm((previous) => ({
      ...previous,
      variants: [...previous.variants, emptyVariant()]
    }));
  };

  const removeNewVariant = (index) => {
    setForm((previous) => ({
      ...previous,
      variants: previous.variants.filter((variant, i) => {
        if (i !== index) return true;
        return variant.detailId != null;
      })
    }));
  };

  // ==========================================
  // VALIDATE AND SAVE
  // ==========================================

  const handleSave = async () => {
    setError('');

    const productName = form.productName.trim();

    if (!productName) {
      setError('Vui lòng nhập tên sản phẩm.');
      return;
    }

    if (productName.length > 200) {
      setError('Tên sản phẩm không được vượt quá 200 ký tự.');
      return;
    }

    if (!form.categoryId) {
      setError('Vui lòng chọn danh mục cho sản phẩm.');
      return;
    }

    if (form.variants.length === 0) {
      setError('Sản phẩm phải có ít nhất một biến thể.');
      return;
    }

    const combinations = new Set();

    for (const variant of form.variants) {
      const size = variant.size.trim();
      const color = variant.color.trim();
      const priceText = String(variant.price).trim();

      if (!size || size.length > 10) {
        setError('Kích thước (size) là bắt buộc và không quá 10 ký tự.');
        return;
      }

      if (!color || color.length > 30) {
        setError('Màu sắc là bắt buộc và không quá 30 ký tự.');
        return;
      }

      if (
        !/^\d+$/.test(priceText) ||
        Number(priceText) > 999999999999
      ) {
        setError('Giá bán phải là số nguyên dương hợp lệ (VNĐ).');
        return;
      }

      const key = `${size.toLowerCase()}\u0000${color.toLowerCase()}`;

      if (combinations.has(key)) {
        setError(`Biến thể size "${size}" và màu "${color}" đã bị trùng lặp.`);
        return;
      }

      combinations.add(key);
    }

    const payload = {
      categoryId: Number(form.categoryId),
      productName,
      description: form.description.trim(),
      variants: form.variants.map((variant) => ({
        detailId: variant.detailId,
        size: variant.size.trim(),
        color: variant.color.trim(),
        price: Number(variant.price)
      }))
    };

    try {
      setSaving(true);
      await updateProduct(productId, payload);
      navigate(`/products/${productId}`);
    } catch (err) {
      setError(
        err?.message || 'Không thể lưu thay đổi sản phẩm. Vui lòng thử lại.'
      );
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: 400,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >
        <CircularProgress sx={{ color: C.cyan }} />
      </Box>
    );
  }

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', pb: 6, color: C.text }}>
      {/* HEADER */}
      <Box sx={{ mb: 3.5 }}>
        <Button
          startIcon={<ArrowLeftOutlined />}
          onClick={() => navigate(`/products/${productId}`)}
          sx={{
            textTransform: 'none',
            fontSize: 13,
            color: C.muted,
            mb: 1.5,
            p: 0,
            '&:hover': { bgcolor: 'transparent', color: '#0F172A' }
          }}
        >
          Quay lại chi tiết sản phẩm
        </Button>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography
              variant="h3"
              sx={{
                fontWeight: 800,
                color: '#0F172A',
                fontSize: { xs: 22, sm: 26 }
              }}
            >
              Chỉnh sửa sản phẩm
            </Typography>

            <Typography sx={{ fontSize: 13.5, color: C.muted, mt: 0.5, lineHeight: 1.6 }}>
              Cập nhật thông tin chi tiết, danh mục và bảng giá các biến thể sản phẩm
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button
              disabled={saving}
              onClick={() => navigate(`/products/${productId}`)}
              sx={outlineButtonSx}
            >
              Hủy bỏ
            </Button>

            <Button
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveOutlined />}
              disabled={saving}
              onClick={handleSave}
              sx={primaryButtonSx}
            >
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </Box>
        </Box>
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2.5, borderRadius: 2.5, fontSize: 13.5, fontWeight: 600 }}
          onClose={() => setError('')}
        >
          {error}
        </Alert>
      )}

      <Grid container spacing={2.5}>
        {/* LEFT COLUMN */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Stack spacing={2.5}>
            {/* BASIC INFORMATION */}
            <Card sx={{ ...cardSx, p: { xs: 2.5, sm: 3.5 } }}>
              <Typography
                sx={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: '#0F172A',
                  mb: 2.5
                }}
              >
                Thông tin cơ bản
              </Typography>

              <Stack spacing={2.5}>
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
                    Tên sản phẩm <Box component="span" sx={{ color: C.error }}>*</Box>
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    required
                    placeholder="Nhập tên sản phẩm..."
                    value={form.productName}
                    onChange={(event) =>
                      updateField('productName', event.target.value)
                    }
                    sx={inputSx(false)}
                  />
                </Box>

                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
                    Danh mục <Box component="span" sx={{ color: C.error }}>*</Box>
                  </Typography>
                  <TextField
                    fullWidth
                    select
                    size="small"
                    required
                    value={form.categoryId}
                    onChange={(event) =>
                      updateField('categoryId', event.target.value)
                    }
                    sx={inputSx(false)}
                  >
                    {categories.map((category) => {
                      const id = category.categoryId;
                      const isActive = category.status === 'ACTIVE';

                      return (
                        <MenuItem
                          key={id}
                          value={String(id)}
                          disabled={
                            !isActive &&
                            String(id) !== form.categoryId
                          }
                        >
                          {category.categoryName}
                          {!isActive ? ' (Đã ngưng)' : ''}
                        </MenuItem>
                      );
                    })}
                  </TextField>
                </Box>

                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
                    Mô tả sản phẩm
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    minRows={4}
                    placeholder="Mô tả thông tin sản phẩm..."
                    value={form.description}
                    onChange={(event) =>
                      updateField('description', event.target.value)
                    }
                    sx={inputSx(false)}
                  />
                </Box>
              </Stack>
            </Card>

            {/* VARIANTS */}
            <Card sx={{ ...cardSx, p: { xs: 2.5, sm: 3.5 } }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 1.5,
                  mb: 2.5
                }}
              >
                <Box>
                  <Typography
                    sx={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: '#0F172A'
                    }}
                  >
                    Biến thể sản phẩm
                  </Typography>

                  <Typography
                    sx={{
                      fontSize: 13,
                      color: C.muted,
                      mt: 0.5
                    }}
                  >
                    Chỉnh sửa kích thước, màu sắc và giá bán. Tồn kho được quản lý qua phiếu kho.
                  </Typography>
                </Box>

                <Button
                  startIcon={<PlusOutlined />}
                  onClick={addVariant}
                  sx={{ ...outlineButtonSx, height: 38, fontSize: 13 }}
                >
                  Thêm biến thể
                </Button>
              </Box>

              <Stack spacing={2}>
                {form.variants.map((variant, index) => (
                  <Box
                    key={variant.detailId ?? `new-${index}`}
                    sx={{
                      p: 2.5,
                      border: `1.5px solid ${C.borderLight}`,
                      borderRadius: 3,
                      bgcolor: '#F8FAFC'
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mb: 1.5
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: '#0F172A'
                        }}
                      >
                        {variant.detailId != null
                          ? `Biến thể #${variant.detailId}`
                          : `Biến thể mới ${index + 1}`}
                      </Typography>

                      {variant.detailId == null && (
                        <Button
                          size="small"
                          onClick={() => removeNewVariant(index)}
                          sx={linkButtonSx('#DC2626', '#FEE2E2')}
                        >
                          Xóa
                        </Button>
                      )}
                    </Box>

                    <Grid container spacing={1.5}>
                      <Grid size={{ xs: 12, sm: 3 }}>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: C.text, mb: 0.5 }}>
                          Kích thước (Size)
                        </Typography>
                        <TextField
                          fullWidth
                          required
                          size="small"
                          value={variant.size}
                          onChange={(event) =>
                            updateVariantField(
                              index,
                              'size',
                              event.target.value
                            )
                          }
                          sx={inputSx(false)}
                        />
                      </Grid>

                      <Grid size={{ xs: 12, sm: 4 }}>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: C.text, mb: 0.5 }}>
                          Màu sắc (Color)
                        </Typography>
                        <TextField
                          fullWidth
                          required
                          size="small"
                          value={variant.color}
                          onChange={(event) =>
                            updateVariantField(
                              index,
                              'color',
                              event.target.value
                            )
                          }
                          sx={inputSx(false)}
                        />
                      </Grid>

                      <Grid size={{ xs: 12, sm: 5 }}>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: C.text, mb: 0.5 }}>
                          Giá bán (VNĐ)
                        </Typography>
                        <TextField
                          fullWidth
                          required
                          size="small"
                          type="number"
                          value={variant.price}
                          onChange={(event) =>
                            updateVariantField(
                              index,
                              'price',
                              event.target.value
                            )
                          }
                          slotProps={{
                            htmlInput: {
                              min: 0,
                              step: 1000
                            }
                          }}
                          sx={inputSx(false)}
                        />
                      </Grid>
                    </Grid>
                  </Box>
                ))}
              </Stack>
            </Card>
          </Stack>
        </Grid>

        {/* RIGHT COLUMN */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Stack spacing={2.5}>
            {/* CURRENT IMAGES */}
            <Card sx={{ ...cardSx, p: { xs: 2.5, sm: 3.5 } }}>
              <Typography
                sx={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: '#0F172A',
                  mb: 0.5
                }}
              >
                Hình ảnh sản phẩm
              </Typography>

              <Typography
                sx={{
                  fontSize: 13,
                  color: C.muted,
                  mb: 2
                }}
              >
                Danh sách hình ảnh hiện tại của sản phẩm.
              </Typography>

              {images.length > 0 ? (
                <Grid container spacing={1.5}>
                  {images.map((image) => (
                    <Grid
                      key={image.imageId}
                      size={{ xs: 6 }}
                    >
                      <Box
                        component="img"
                        src={image.imageUrl}
                        alt="Ảnh sản phẩm"
                        sx={{
                          width: '100%',
                          aspectRatio: '1 / 1',
                          objectFit: 'cover',
                          borderRadius: 2.5,
                          border: `1px solid ${C.borderLight}`
                        }}
                      />
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Typography
                  sx={{
                    fontSize: 13,
                    color: C.muted
                  }}
                >
                  Chưa có hình ảnh nào.
                </Typography>
              )}
            </Card>

            {/* GUIDELINES (PHUOC'S TEAL BOX) */}
            <Box
              sx={{
                bgcolor: '#F0FDFA',
                border: '1px solid #99F6E4',
                borderRadius: 3,
                p: 2.5
              }}
            >
              <Typography
                sx={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: '#0F766E',
                  mb: 0.5
                }}
              >
                Lưu ý khi cập nhật
              </Typography>

              <Typography
                sx={{
                  fontSize: 12.5,
                  color: '#115E59',
                  lineHeight: 1.7
                }}
              >
                Các biến thể sẵn có sẽ giữ nguyên mã định danh, số lượng tồn kho và thiết lập bán online. Các biến thể mới thêm sẽ có số lượng tồn kho khởi tạo là 0.
              </Typography>
            </Box>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
