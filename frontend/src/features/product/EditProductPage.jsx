import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';

import {
  ArrowLeftOutlined,
  DeleteOutlined,
  LockOutlined,
  PlusOutlined,
  SaveOutlined,
  StarOutlined,
  UploadOutlined
} from '@ant-design/icons';

import {
  addProductImages,
  deleteProductImage,
  getProductById,
  setPrimaryProductImage,
  updateProduct
} from '../../services/productService';

// Giới hạn khớp với backend (ProductService.MAX_IMAGES, ProductImageService)
const MAX_IMAGES = 10;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

import {
  categoryFullName,
  getCategories,
  isAssignableCategory,
  sortCategoriesAsTree
} from '../../services/categoryService';
import { C, cardSx, outlineButtonSx, primaryButtonSx } from '../customer/theme';
import { formatPriceInput, parsePriceInput } from './priceInput';
import ProductDescriptionFields from './ProductDescriptionFields';

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

// Bỏ dấu + viết thường để so trùng biến thể
const foldText = (value) =>
  (value || '')
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export default function EditProductPage() {
  const { productId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [categories, setCategories] = useState([]);
  const [images, setImages] = useState([]);

  // Phiên bản dữ liệu lúc mở form: gửi kèm khi lưu để phát hiện người khác đã sửa (409)
  const [version, setVersion] = useState(null);
  const [conflict, setConflict] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Quản lý ảnh: thay đổi ảnh được lưu ngay, không cần bấm "Lưu thay đổi"
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState('');
  const fileInputRef = useRef(null);

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
            // Mã biến thể (cột barcode), chỉ xem — tem đã in phải giữ nguyên
            code: variant.code || '',
            size: variant.size || '',
            color: variant.color || '',
            price: String(variant.price ?? ''),
            // Đã có tồn kho / lịch sử bán, nhập kho: chỉ được sửa giá
            locked: Boolean(Number(variant.locked ?? 0)),
            stockQuantity: Number(variant.stockQuantity ?? 0)
          }))
        });

        setImages(productImages || []);
        setVersion(productData.version ?? null);
        setConflict(false);

        const categoryList = Array.isArray(categoryData)
          ? categoryData
          : Array.isArray(categoryData?.content)
            ? categoryData.content
            : Array.isArray(categoryData?.data)
              ? categoryData.data
              : [];

        setCategories(sortCategoriesAsTree(categoryList));
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
  }, [productId, reloadKey]);

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

      if (size.startsWith('~')) {
        setError('Kích thước không được bắt đầu bằng ký tự "~".');
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

      // Không phân biệt hoa/thường và dấu: "Đen" trùng "Den" (DB so trùng như vậy)
      const key = `${foldText(size)}\u0000${foldText(color)}`;

      if (combinations.has(key)) {
        setError(`Biến thể size "${size}" và màu "${color}" bị trùng (không phân biệt hoa/thường và dấu).`);
        return;
      }

      combinations.add(key);
    }

    const payload = {
      categoryId: Number(form.categoryId),
      productName,
      // Rỗng = giữ nguyên (sản phẩm chưa có mã thì hệ thống tự tạo)
      description: form.description.trim(),
      version,
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
      // 409: người khác vừa sửa sản phẩm này => mời tải lại thay vì ghi đè
      setConflict(err?.status === 409);
      setError(
        err?.message || 'Không thể lưu thay đổi sản phẩm. Vui lòng thử lại.'
      );
    } finally {
      setSaving(false);
    }
  };

  const reloadProduct = () => {
    setError('');
    setReloadKey((key) => key + 1);
  };

  // ==========================================
  // IMAGES (lưu ngay khi thao tác)
  // ==========================================

  const runImageAction = async (action) => {
    setImageError('');
    setImageBusy(true);
    try {
      const result = await action();
      setImages(result?.images || []);
    } catch (err) {
      setImageError(err?.message || 'Không thể cập nhật ảnh. Vui lòng thử lại.');
    } finally {
      setImageBusy(false);
    }
  };

  const handlePickImages = (event) => {
    const files = Array.from(event.target.files || []);
    // Cho phép chọn lại cùng một file ở lần sau
    event.target.value = '';
    if (!files.length) return;

    if (images.length + files.length > MAX_IMAGES) {
      setImageError(`Mỗi sản phẩm tối đa ${MAX_IMAGES} ảnh (hiện có ${images.length} ảnh).`);
      return;
    }

    const invalidType = files.find((file) => !IMAGE_TYPES.includes(file.type));
    if (invalidType) {
      setImageError(`Ảnh "${invalidType.name}" không hợp lệ. Chỉ chấp nhận JPG, PNG hoặc WebP.`);
      return;
    }

    const tooLarge = files.find((file) => file.size > MAX_IMAGE_SIZE);
    if (tooLarge) {
      setImageError(`Ảnh "${tooLarge.name}" vượt quá 5MB.`);
      return;
    }

    runImageAction(() => addProductImages(productId, files));
  };

  const handleDeleteImage = (imageId) => {
    if (!window.confirm('Xóa ảnh này khỏi sản phẩm?')) return;
    runImageAction(() => deleteProductImage(productId, imageId));
  };

  const handleSetPrimaryImage = (imageId) => {
    runImageAction(() => setPrimaryProductImage(productId, imageId));
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
          action={
            conflict ? (
              <Button color="inherit" size="small" onClick={reloadProduct} sx={{ textTransform: 'none', fontWeight: 700 }}>
                Tải lại dữ liệu
              </Button>
            ) : undefined
          }
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
                      // Danh mục cha (có danh mục con) hoặc đã ngưng: chỉ hiện nếu đang là danh mục hiện tại
                      if (!isAssignableCategory(category) && String(id) !== form.categoryId) return null;

                      return (
                        <MenuItem
                          key={id}
                          value={String(id)}
                        >
                          {categoryFullName(category)}
                          {!isActive
                            ? ' (Đã ngưng)'
                            : category.childCount > 0
                              ? ' (Danh mục cha — hãy chọn danh mục con)'
                              : ''}
                        </MenuItem>
                      );
                    })}
                  </TextField>
                </Box>

                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
                    Mô tả sản phẩm
                  </Typography>
                  <ProductDescriptionFields value={form.description} onChange={(next) => updateField('description', next)} disabled={saving} />
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
                    Biến thể đã lưu không xóa được tại đây; chỉ biến thể mới thêm (chưa lưu) mới có nút Xóa.
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
                        <Box component="span" sx={{ ml: 1, fontSize: 12, fontWeight: 600, color: C.muted, fontFamily: 'monospace' }}>
                          {variant.detailId != null ? variant.code || 'Chưa có mã' : 'Mã tự tạo khi lưu'}
                        </Box>
                      </Typography>

                      {variant.locked && (
                        <Tooltip title="Biến thể đã có tồn kho hoặc lịch sử bán/nhập kho. Đổi size/màu sẽ làm lệch hàng thật trên kệ và mã vạch đã in, nên chỉ được sửa giá. Cần size/màu khác hãy thêm biến thể mới.">
                          <Box
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.75,
                              ml: 'auto',
                              mr: variant.detailId == null ? 1 : 0,
                              px: 1.25,
                              py: 0.35,
                              borderRadius: 1.75,
                              bgcolor: '#FFF7AE',
                              color: '#713F12',
                              fontSize: 12,
                              fontWeight: 600
                            }}
                          >
                            <LockOutlined style={{ fontSize: 12 }} />
                            Chỉ sửa được giá · Tồn {variant.stockQuantity}
                          </Box>
                        </Tooltip>
                      )}

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
                          disabled={variant.locked}
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
                          disabled={variant.locked}
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
                          // Hiển thị dạng tiền ngay trong ô (250.000), lưu chuỗi chữ số (250000)
                          placeholder="Ví dụ: 250.000"
                          value={formatPriceInput(variant.price)}
                          onChange={(event) =>
                            updateVariantField(
                              index,
                              'price',
                              parsePriceInput(event.target.value)
                            )
                          }
                          slotProps={{
                            htmlInput: {
                              inputMode: 'numeric',
                              autoComplete: 'off'
                            },
                            input: {
                              endAdornment: <InputAdornment position="end">₫</InputAdornment>
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
                {images.length}/{MAX_IMAGES} ảnh · JPG, PNG, WebP tối đa 5MB. Thay đổi ảnh được lưu ngay.
              </Typography>

              {imageError && (
                <Alert
                  severity="error"
                  sx={{ mb: 1.5, borderRadius: 2.5, fontSize: 12.5 }}
                  onClose={() => setImageError('')}
                >
                  {imageError}
                </Alert>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept={IMAGE_TYPES.join(',')}
                multiple
                hidden
                onChange={handlePickImages}
              />

              <Button
                fullWidth
                startIcon={imageBusy ? <CircularProgress size={14} color="inherit" /> : <UploadOutlined />}
                disabled={imageBusy || images.length >= MAX_IMAGES}
                onClick={() => fileInputRef.current?.click()}
                sx={{ ...outlineButtonSx, height: 38, fontSize: 13, mb: 2 }}
              >
                {imageBusy ? 'Đang cập nhật ảnh...' : 'Thêm ảnh'}
              </Button>

              {images.length > 0 ? (
                <Grid container spacing={1.5}>
                  {images.map((image) => {
                    const isPrimary = Boolean(Number(image.isPrimary));

                    return (
                      <Grid
                        key={image.imageId}
                        size={{ xs: 6 }}
                      >
                        <Box sx={{ position: 'relative' }}>
                          <Box
                            component="img"
                            src={image.imageUrl}
                            alt="Ảnh sản phẩm"
                            sx={{
                              width: '100%',
                              aspectRatio: '1 / 1',
                              objectFit: 'cover',
                              borderRadius: 2.5,
                              display: 'block',
                              border: `${isPrimary ? 2 : 1}px solid ${isPrimary ? C.cyan : C.borderLight}`
                            }}
                          />

                          {isPrimary && (
                            <Box
                              sx={{
                                position: 'absolute',
                                left: 6,
                                top: 6,
                                px: 1,
                                py: 0.25,
                                borderRadius: 1.5,
                                bgcolor: C.cyan,
                                color: '#0F172A',
                                fontSize: 11,
                                fontWeight: 700
                              }}
                            >
                              Ảnh chính
                            </Box>
                          )}

                          <Stack
                            direction="row"
                            spacing={0.5}
                            sx={{ position: 'absolute', right: 6, top: 6 }}
                          >
                            {!isPrimary && (
                              <Tooltip title="Đặt làm ảnh chính">
                                <span>
                                  <IconButton
                                    size="small"
                                    disabled={imageBusy}
                                    onClick={() => handleSetPrimaryImage(image.imageId)}
                                    sx={{ bgcolor: 'rgba(255,255,255,0.9)', color: '#64748B', '&:hover': { bgcolor: '#fff', color: '#0F172A' } }}
                                  >
                                    <StarOutlined style={{ fontSize: 15 }} />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            )}

                            <Tooltip title={images.length <= 1 ? 'Sản phẩm phải còn ít nhất một ảnh' : 'Xóa ảnh'}>
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={imageBusy || images.length <= 1}
                                  onClick={() => handleDeleteImage(image.imageId)}
                                  sx={{ bgcolor: 'rgba(255,255,255,0.9)', color: '#64748B', '&:hover': { bgcolor: '#fff', color: C.error } }}
                                >
                                  <DeleteOutlined style={{ fontSize: 15 }} />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Stack>
                        </Box>
                      </Grid>
                    );
                  })}
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
                Biến thể đã có tồn kho hoặc lịch sử bán/nhập kho chỉ được sửa giá. Nếu người khác vừa sửa sản phẩm này, hệ thống sẽ yêu cầu tải lại trước khi lưu.
              </Typography>
            </Box>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
