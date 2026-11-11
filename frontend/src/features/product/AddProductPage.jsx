import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';

import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  StarFilled,
  StarOutlined
} from '@ant-design/icons';

import { createProductWithImages } from '../../services/productService';
import {
  getCategories,
  isAssignableCategory,
  sortCategoriesAsTree
} from '../../services/categoryService';
import { C, cardSx, outlineButtonSx, primaryButtonSx } from '../customer/theme';
import CategoryPicker from './CategoryPicker';

const MAX_IMAGES = 10;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp'
];

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

const badgeSx = (bg, color, border) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.6,
  bgcolor: bg,
  color: color,
  border: `1px solid ${border}`,
  borderRadius: 99,
  px: 1.4,
  py: 0.35,
  fontSize: 12,
  fontWeight: 700,
  flexShrink: 0
});

function createEmptyVariant() {
  return {
    id: crypto.randomUUID(),
    size: '',
    color: '',
    price: '',
    code: ''
  };
}

// Mã sản phẩm / mã biến thể: chữ in hoa, số, dấu "-" (giống kiểm tra ở backend)
const CODE_PATTERN = /^[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?$/;
const cleanCode = (value) => value.toUpperCase().replace(/[^A-Z0-9-]/g, '');

// Bỏ dấu + viết thường: "Đen" và "Den" là cùng một màu (DB so trùng như vậy)
const fold = (value) =>
  (value || '')
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');


function SectionTitle({ title, subtitle }) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography
        sx={{
          fontSize: 16,
          fontWeight: 800,
          color: '#0F172A'
        }}
      >
        {title}
      </Typography>

      {subtitle && (
        <Typography
          sx={{
            fontSize: 13,
            color: C.muted,
            mt: 0.5
          }}
        >
          {subtitle}
        </Typography>
      )}
    </Box>
  );
}

function FieldLabel({ children, required }) {
  return (
    <Typography
      sx={{
        fontSize: 13,
        fontWeight: 600,
        color: C.text,
        mb: 0.75
      }}
    >
      {children}
      {required && (
        <Box component="span" sx={{ color: C.error }}>
          {' '}*
        </Box>
      )}
    </Typography>
  );
}

export default function AddProductPage() {
  const navigate = useNavigate();
  const imageInputRef = useRef(null);
  const imagesRef = useRef([]);

  // ==========================================
  // PRODUCT INFORMATION
  // ==========================================

  const [productName, setProductName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  // Mở bán online ngay sau khi tạo (mặc định tắt)
  const [onlineSalesEnabled, setOnlineSalesEnabled] = useState(false);

  // ==========================================
  // PRODUCT VARIANTS
  // ==========================================

  const [variants, setVariants] = useState(
    () => [createEmptyVariant()]
  );

  // ==========================================
  // PRODUCT IMAGES
  // ==========================================

  const [images, setImages] = useState([]);

  // ==========================================
  // CATEGORIES
  // ==========================================

  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  // ==========================================
  // UI STATE
  // ==========================================

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // ==========================================
  // LOAD ACTIVE CATEGORIES
  // ==========================================

  useEffect(() => {
    let active = true;

    async function loadCategories() {
      try {
        const data = await getCategories();

        if (!Array.isArray(data)) {
          throw new Error('Dữ liệu danh mục không hợp lệ.');
        }

        if (active) {
          // Chỉ danh mục đang hoạt động và không phải danh mục cha (vd chọn "Giày › Giày nam", không chọn "Giày")
          setCategories(sortCategoriesAsTree(data).filter(isAssignableCategory));
        }
      } catch (err) {
        if (active) {
          setError(
            err?.message || 'Không thể tải danh sách danh mục.'
          );
        }
      } finally {
        if (active) {
          setLoadingCategories(false);
        }
      }
    }

    loadCategories();

    return () => {
      active = false;
    };
  }, []);

  // ==========================================
  // IMAGE PREVIEW CLEANUP
  // ==========================================

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((image) => {
        URL.revokeObjectURL(image.preview);
      });
    };
  }, []);

  // ==========================================
  // VARIANT ACTIONS
  // ==========================================

  function addVariant() {
    setVariants((current) => [
      ...current,
      createEmptyVariant()
    ]);
  }

  function updateVariant(id, field, value) {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === id
          ? { ...variant, [field]: value }
          : variant
      )
    );
  }

  function removeVariant(id) {
    setVariants((current) => {
      if (current.length <= 1) {
        return current;
      }

      return current.filter(
        (variant) => variant.id !== id
      );
    });
  }

  // ==========================================
  // IMAGE ACTIONS
  // ==========================================

  function handleSelectImages(event) {
    setError('');

    const files = Array.from(
      event.target.files || []
    );

    event.target.value = '';

    if (files.length === 0) return;

    if (images.length + files.length > MAX_IMAGES) {
      setError(`Chỉ được tải lên tối đa ${MAX_IMAGES} hình ảnh cho mỗi sản phẩm.`);
      return;
    }

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError('Chỉ chấp nhận tệp hình ảnh định dạng JPG, PNG hoặc WebP.');
        return;
      }

      if (file.size === 0) {
        setError(`Tệp ảnh "${file.name}" rỗng.`);
        return;
      }

      if (file.size > MAX_IMAGE_SIZE) {
        setError(`Hình ảnh "${file.name}" vượt quá dung lượng cho phép (tối đa 5 MB).`);
        return;
      }
    }

    const newImages = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file)
    }));

    setImages((current) => [
      ...current,
      ...newImages
    ]);
  }

  function removeImage(imageId) {
    const removed = images.find(
      (image) => image.id === imageId
    );

    if (removed) {
      URL.revokeObjectURL(removed.preview);
    }

    setImages((current) =>
      current.filter(
        (image) => image.id !== imageId
      )
    );
  }

  function setPrimaryImage(imageId) {
    setImages((current) => {
      const selected = current.find(
        (image) => image.id === imageId
      );

      if (!selected) return current;

      return [
        selected,
        ...current.filter(
          (image) => image.id !== imageId
        )
      ];
    });
  }

  // ==========================================
  // FORM VALIDATION
  // ==========================================

  function validateForm() {
    if (!productName.trim()) {
      return 'Vui lòng nhập tên sản phẩm.';
    }

    if (productName.trim().length > 200) {
      return 'Tên sản phẩm không được vượt quá 200 ký tự.';
    }

    if (!categoryId) {
      return 'Vui lòng chọn danh mục cho sản phẩm.';
    }


    if (images.length === 0) {
      return 'Vui lòng tải lên ít nhất một hình ảnh đại diện cho sản phẩm.';
    }

    if (images.length > MAX_IMAGES) {
      return `Chỉ được tải lên tối đa ${MAX_IMAGES} hình ảnh cho mỗi sản phẩm.`;
    }

    if (variants.length === 0) {
      return 'Sản phẩm phải có ít nhất một biến thể kích thước và màu sắc.';
    }

    const combinations = new Set();
    const codes = new Set();

    for (const variant of variants) {
      const size = variant.size.trim();
      const color = variant.color.trim();
      const price = Number(variant.price);

      if (!size || !color || variant.price === '') {
        return 'Vui lòng điền đầy đủ kích thước, màu sắc và giá bán cho từng biến thể.';
      }

      if (size.length > 10) {
        return 'Kích thước (size) không được vượt quá 10 ký tự.';
      }

      if (color.length > 30) {
        return 'Màu sắc không được vượt quá 30 ký tự.';
      }

      if (
        !Number.isSafeInteger(price) ||
        price <= 0 ||
        price > 999999999999
      ) {
        return 'Giá bán phải là số nguyên lớn hơn 0 (VNĐ).';
      }

      // Không phân biệt hoa/thường và dấu: "Đen" trùng "Den"
      const key = JSON.stringify([fold(size), fold(color)]);

      if (combinations.has(key)) {
        return `Biến thể kích thước "${size}" và màu "${color}" bị trùng (không phân biệt hoa/thường và dấu).`;
      }

      combinations.add(key);

      const code = variant.code.trim();
      if (code) {
        if (code.length < 3 || code.length > 32 || !CODE_PATTERN.test(code)) {
          return `Mã biến thể "${code}" chỉ gồm chữ in hoa, số và dấu "-", dài 3–32 ký tự.`;
        }
        if (codes.has(code)) {
          return `Mã biến thể "${code}" bị trùng.`;
        }
        codes.add(code);
      }
    }

    return '';
  }

  // ==========================================
  // SAVE PRODUCT
  // ==========================================

  async function handleSaveProduct() {
    if (saving) return;

    setError('');

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
      return;
    }

    const productData = {
      categoryId: Number(categoryId),
      productName: productName.trim(),
      description: description.trim(),
      onlineSalesEnabled,
      variants: variants.map((variant) => ({
        size: variant.size.trim(),
        color: variant.color.trim(),
        price: Number(variant.price),
        code: variant.code.trim() || null
      }))
    };

    try {
      setSaving(true);

      await createProductWithImages(
        productData,
        images.map((image) => image.file)
      );

      navigate('/products');
    } catch (err) {
      console.error('Không thể tạo sản phẩm:', err);

      setError(
        err?.message || 'Không thể tạo sản phẩm. Vui lòng thử lại.'
      );

      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    } finally {
      setSaving(false);
    }
  }

  // ==========================================
  // DERIVED VALUES
  // ==========================================

  const hasChanges =
    Boolean(productName.trim()) ||
    Boolean(categoryId) ||
    Boolean(description.trim()) ||
    images.length > 0 ||
    variants.length > 1 ||
    variants.some(
      (variant) =>
        variant.size ||
        variant.color ||
        variant.price !== ''
    );

  const prices = variants
    .map((variant) => Number(variant.price))
    .filter(
      (price) =>
        Number.isFinite(price) && price >= 0
    );

  const priceRange =
    prices.length > 0
      ? `${Math.min(...prices).toLocaleString('vi-VN')} ₫${
          Math.min(...prices) !== Math.max(...prices)
            ? ` – ${Math.max(...prices).toLocaleString('vi-VN')} ₫`
            : ''
        }`
      : 'Chưa xác định';

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <Box
      sx={{
        maxWidth: 1440,
        mx: 'auto',
        pb: 6,
        color: C.text
      }}
    >
      {/* PAGE HEADER */}
      <Box sx={{ mb: 3.5 }}>
        <Button
          startIcon={<ArrowLeftOutlined />}
          onClick={() => navigate('/products')}
          sx={{
            textTransform: 'none',
            fontSize: 13,
            color: C.muted,
            mb: 1.5,
            p: 0,
            '&:hover': { bgcolor: 'transparent', color: '#0F172A' }
          }}
        >
          Quay lại danh sách sản phẩm
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
              Thêm sản phẩm mới
            </Typography>

            <Typography
              sx={{
                fontSize: 13.5,
                color: C.muted,
                mt: 0.5,
                lineHeight: 1.6
              }}
            >
              Nhập thông tin sản phẩm, tải ảnh minh họa và thiết lập bảng biến thể kích thước / màu sắc
            </Typography>
          </Box>

          {hasChanges && (
            <Box sx={badgeSx('#FEF9C3', '#854D0E', '#FDE047')}>
              Có thay đổi chưa lưu
            </Box>
          )}
        </Box>
      </Box>

      {/* ERROR MESSAGE */}
      {error && (
        <Alert
          severity="error"
          onClose={() => setError('')}
          sx={{ mb: 2.5, borderRadius: 2.5, fontSize: 13.5, fontWeight: 600 }}
        >
          {error}
        </Alert>
      )}

      {/* TWO COLUMN LAYOUT */}
      <Grid container spacing={2.5}>
        {/* LEFT COLUMN */}
        <Grid size={{ xs: 12, lg: 8 }}>
          <Stack spacing={2.5}>
            {/* BASIC INFORMATION */}
            <Card sx={cardSx}>
              <CardContent
                sx={{
                  p: { xs: 2.5, sm: 3.5 },
                  '&:last-child': { pb: { xs: 2.5, sm: 3.5 } }
                }}
              >
                <SectionTitle
                  title="Thông tin cơ bản"
                  subtitle="Nhập tên gọi, danh mục phân loại và mô tả chi tiết của sản phẩm."
                />

                <Stack spacing={2.5}>
                  <Box>
                    <FieldLabel required>
                      Tên sản phẩm
                    </FieldLabel>

                    <TextField
                      fullWidth
                      size="small"
                      placeholder="Ví dụ: Áo thun Oversize Cotton Compact"
                      value={productName}
                      onChange={(event) => setProductName(event.target.value)}
                      disabled={saving}
                      slotProps={{
                        htmlInput: {
                          maxLength: 200
                        }
                      }}
                      sx={inputSx(false)}
                    />
                  </Box>

                  <Box>
                    <FieldLabel required>
                      Danh mục sản phẩm
                    </FieldLabel>

                    <CategoryPicker
                      categories={categories}
                      value={categoryId}
                      onChange={setCategoryId}
                      disabled={saving || loadingCategories || categories.length === 0}
                      inputSx={inputSx(false)}
                    />

                    <Typography
                      sx={{
                        fontSize: 12,
                        color: C.muted,
                        mt: 0.75
                      }}
                    >
                      {loadingCategories
                        ? 'Đang tải danh sách danh mục...'
                        : categories.length === 0
                          ? 'Chưa có danh mục hoạt động nào.'
                          : 'Gõ để tìm, không dấu cũng được. Danh mục có danh mục con thì chọn danh mục con.'}
                    </Typography>
                  </Box>

                  <Box>
                    <FieldLabel>
                      Mô tả sản phẩm
                    </FieldLabel>

                    <TextField
                      fullWidth
                      multiline
                      rows={4}
                      placeholder="Mô tả chất liệu, kiểu dáng, hướng dẫn sử dụng và bảo quản..."
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      disabled={saving}
                      sx={inputSx(false)}
                    />

                    <Typography
                      sx={{
                        fontSize: 12,
                        color: C.muted,
                        mt: 0.75
                      }}
                    >
                      Mô tả chi tiết giúp nhân viên tư vấn và khách hàng nắm rõ đặc điểm sản phẩm.
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>

            {/* PRICING PREVIEW */}
            <Card sx={cardSx}>
              <CardContent
                sx={{
                  p: { xs: 2.5, sm: 3.5 },
                  '&:last-child': { pb: { xs: 2.5, sm: 3.5 } }
                }}
              >
                <SectionTitle
                  title="Khoảng giá bán"
                  subtitle="Giá bán được tự động tính toán dựa trên cấu hình giá từng biến thể."
                />

                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  justifyContent="space-between"
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  spacing={1}
                >
                  <Box>
                    <Typography
                      sx={{
                        fontSize: 13,
                        color: C.muted
                      }}
                    >
                      Khoảng giá hiển thị:
                    </Typography>

                    <Typography
                      sx={{
                        fontSize: 24,
                        fontWeight: 800,
                        color: '#0F172A',
                        mt: 0.5
                      }}
                    >
                      {priceRange}
                    </Typography>
                  </Box>

                  <Box sx={badgeSx('#F0FDFA', '#0F766E', '#99F6E4')}>
                    Đơn vị tiền tệ: VNĐ
                  </Box>
                </Stack>

                <Typography
                  sx={{
                    fontSize: 12.5,
                    color: C.muted,
                    mt: 1.5,
                    lineHeight: 1.5
                  }}
                >
                  Bạn có thể nhập giá chi tiết cho từng kích thước / màu sắc ở bảng bên dưới.
                </Typography>
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        {/* RIGHT COLUMN */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2.5}>
            {/* IMAGE UPLOAD */}
            <Card sx={cardSx}>
              <CardContent
                sx={{
                  p: { xs: 2.5, sm: 3 },
                  '&:last-child': { pb: { xs: 2.5, sm: 3 } }
                }}
              >
                <SectionTitle
                  title="Hình ảnh sản phẩm"
                  subtitle="Ảnh đầu tiên sẽ hiển thị làm ảnh đại diện chính của sản phẩm."
                />

                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  hidden
                  disabled={saving}
                  onChange={handleSelectImages}
                />

                <Box
                  onClick={() => {
                    if (
                      !saving &&
                      images.length < MAX_IMAGES
                    ) {
                      imageInputRef.current?.click();
                    }
                  }}
                  sx={{
                    border: `2px dashed ${C.cyan}`,
                    borderRadius: 3,
                    bgcolor: '#F0FCFE',
                    py: 3.5,
                    px: 2,
                    textAlign: 'center',
                    cursor:
                      saving ||
                      images.length >= MAX_IMAGES
                        ? 'not-allowed'
                        : 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      bgcolor: '#E4F9FD',
                      borderColor: C.cyanHover
                    }
                  }}
                >
                  <CloudUploadOutlined
                    style={{
                      fontSize: 34,
                      color: '#0F172A'
                    }}
                  />

                  <Typography
                    sx={{
                      fontSize: 13.5,
                      fontWeight: 800,
                      color: '#0F172A',
                      mt: 1
                    }}
                  >
                    Tải ảnh sản phẩm lên
                  </Typography>

                  <Typography
                    sx={{
                      fontSize: 12,
                      color: C.muted,
                      mt: 0.5
                    }}
                  >
                    Hỗ trợ JPG, PNG, WebP · Tối đa 5 MB/ảnh
                  </Typography>

                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#0D9488',
                      mt: 0.5
                    }}
                  >
                    Đã chọn: {images.length}/{MAX_IMAGES} ảnh
                  </Typography>
                </Box>

                {/* IMAGE PREVIEWS */}
                {images.length > 0 && (
                  <Grid
                    container
                    spacing={1.5}
                    sx={{ mt: 1 }}
                  >
                    {images.map((image, index) => (
                      <Grid
                        key={image.id}
                        size={{ xs: 6 }}
                      >
                        <Box
                          sx={{
                            border: `1.5px solid ${
                              index === 0
                                ? C.cyan
                                : C.border
                            }`,
                            borderRadius: 2.5,
                            p: 0.75,
                            bgcolor: C.surface
                          }}
                        >
                          <Box
                            component="img"
                            src={image.preview}
                            alt={image.file.name}
                            sx={{
                              width: '100%',
                              height: 110,
                              objectFit: 'cover',
                              borderRadius: 2
                            }}
                          />

                          <Typography
                            sx={{
                              fontSize: 11,
                              color: C.muted,
                              mt: 0.5
                            }}
                            noWrap
                            title={image.file.name}
                          >
                            {image.file.name}
                          </Typography>

                          <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                            sx={{ mt: 0.5 }}
                          >
                            {index === 0 ? (
                              <Box sx={badgeSx('#FEF9C3', '#854D0E', '#FDE047')}>
                                <StarFilled style={{ fontSize: 11, color: '#EAB308' }} />
                                Ảnh chính
                              </Box>
                            ) : (
                              <IconButton
                                size="small"
                                title="Đặt làm ảnh chính"
                                disabled={saving}
                                onClick={() =>
                                  setPrimaryImage(image.id)
                                }
                              >
                                <StarOutlined style={{ fontSize: 13 }} />
                              </IconButton>
                            )}

                            <IconButton
                              size="small"
                              title="Xóa ảnh"
                              disabled={saving}
                              onClick={() =>
                                removeImage(image.id)
                              }
                              sx={{
                                color: '#DC2626',
                                '&:hover': { bgcolor: '#FEE2E2' }
                              }}
                            >
                              <DeleteOutlined style={{ fontSize: 13 }} />
                            </IconButton>
                          </Stack>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                )}
              </CardContent>
            </Card>

            {/* PRODUCT AVAILABILITY */}
            <Card sx={cardSx}>
              <CardContent
                sx={{
                  p: { xs: 2.5, sm: 3 },
                  '&:last-child': { pb: { xs: 2.5, sm: 3 } }
                }}
              >
                <SectionTitle
                  title="Trạng thái khởi tạo"
                  subtitle="Quy định mặc định khi sản phẩm mới được tạo."
                />

                <Stack spacing={2}>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Typography
                      sx={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: C.text
                      }}
                    >
                      Trạng thái sản phẩm
                    </Typography>

                    <Box sx={badgeSx('#F0FDF4', '#166534', '#BBF7D0')}>
                      <CheckCircleOutlined />
                      Hoạt động
                    </Box>
                  </Stack>

                  <Divider sx={{ borderColor: C.borderLight }} />

                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Typography
                      sx={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: C.text
                      }}
                    >
                      Bán online
                    </Typography>

                    <Box sx={badgeSx('#F1F5F9', '#475569', '#E2E8F0')}>
                      Đang tắt
                    </Box>
                  </Stack>

                  <Divider sx={{ borderColor: C.borderLight }} />

                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Typography
                      sx={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: C.text
                      }}
                    >
                      Tồn kho ban đầu
                    </Typography>

                    <Typography
                      sx={{
                        fontSize: 14.5,
                        fontWeight: 800,
                        color: '#0F172A'
                      }}
                    >
                      0 sản phẩm
                    </Typography>
                  </Stack>

                  {/* NOTE BOX IN PHUOC'S TEAL STYLE */}
                  <Box
                    sx={{
                      bgcolor: '#F0FDFA',
                      border: '1px solid #99F6E4',
                      borderRadius: 2.5,
                      p: 2,
                      mt: 1
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 12.5,
                        color: '#115E59',
                        lineHeight: 1.6
                      }}
                    >
                      Sản phẩm mới tạo sẽ có tồn kho ban đầu là 0. Bạn có thể lập Phiếu Nhập Kho để nhập tồn vật lý.
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>

      {/* SIZE / COLOR VARIANT MATRIX */}
      <Box sx={{ mt: 3.5 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{
            xs: 'flex-start',
            sm: 'center'
          }}
          spacing={1.5}
          sx={{ mb: 2 }}
        >
          <SectionTitle
            title="Ma trận biến thể (Size & Màu sắc)"
            subtitle="Mỗi cặp kích thước và màu sắc tạo thành một biến thể riêng có giá bán tương ứng."
          />

          <Button
            startIcon={<PlusOutlined />}
            onClick={addVariant}
            disabled={saving}
            sx={{
              ...outlineButtonSx,
              height: 40,
              fontSize: 13
            }}
          >
            Thêm biến thể
          </Button>
        </Stack>

        <Box
          sx={{
            bgcolor: C.surface,
            borderRadius: 3.5,
            border: `1px solid ${C.border}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            overflow: 'hidden'
          }}
        >
          <TableContainer>
            <Table
              sx={{
                minWidth: 860,
                '& th': {
                  bgcolor: C.surface,
                  color: C.muted,
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  py: 1.75,
                  borderBottom: `1px solid ${C.borderLight}`
                },
                '& td': {
                  borderColor: C.borderLight,
                  py: 2,
                  fontSize: 13.5,
                  color: C.text
                }
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell sx={{ pl: 3 }}>KÍCH THƯỚC (SIZE)</TableCell>
                  <TableCell>MÀU SẮC (COLOR)</TableCell>
                  <TableCell>GIÁ BÁN (VNĐ)</TableCell>
                  <TableCell>MÃ BIẾN THỂ</TableCell>
                  <TableCell align="center" sx={{ pr: 3 }}>THAO TÁC</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {variants.map((variant) => (
                  <TableRow key={variant.id} hover sx={{ '&:hover': { bgcolor: '#FAFCFE' } }}>
                    <TableCell sx={{ width: '18%', pl: 3 }}>
                      <TextField
                        fullWidth
                        size="small"
                        placeholder="Ví dụ: S, M, L, XL..."
                        value={variant.size}
                        disabled={saving}
                        onChange={(event) =>
                          updateVariant(
                            variant.id,
                            'size',
                            event.target.value
                          )
                        }
                        slotProps={{
                          htmlInput: {
                            maxLength: 10
                          }
                        }}
                        sx={inputSx(false)}
                      />
                    </TableCell>

                    <TableCell sx={{ width: '22%' }}>
                      <TextField
                        fullWidth
                        size="small"
                        placeholder="Ví dụ: Đen, Trắng, Xanh Navy..."
                        value={variant.color}
                        disabled={saving}
                        onChange={(event) =>
                          updateVariant(
                            variant.id,
                            'color',
                            event.target.value
                          )
                        }
                        slotProps={{
                          htmlInput: {
                            maxLength: 30
                          }
                        }}
                        sx={inputSx(false)}
                      />
                    </TableCell>

                    <TableCell sx={{ width: '22%' }}>
                      <TextField
                        fullWidth
                        size="small"
                        type="number"
                        placeholder="Ví dụ: 250000"
                        value={variant.price}
                        disabled={saving}
                        onChange={(event) =>
                          updateVariant(
                            variant.id,
                            'price',
                            event.target.value
                          )
                        }
                        slotProps={{
                          htmlInput: {
                            min: 1,
                            max: 999999999999,
                            step: 1000
                          }
                        }}
                        sx={inputSx(false)}
                      />
                      {Number(variant.price) > 0 && (
                        <Typography sx={{ fontSize: 12, color: C.muted, mt: 0.5 }}>
                          {Number(variant.price).toLocaleString('vi-VN')} ₫
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell sx={{ width: '28%' }}>
                      <TextField
                        fullWidth
                        size="small"
                        // Để trống: lưu xong tự gán TH + mã biến thể (vd TH000058), giống mã vạch ở module Kho
                        placeholder="Tự tạo (TH000…)"
                        value={variant.code}
                        disabled={saving}
                        onChange={(event) => updateVariant(variant.id, 'code', cleanCode(event.target.value))}
                        slotProps={{
                          htmlInput: {
                            maxLength: 32
                          }
                        }}
                        sx={inputSx(false)}
                      />
                    </TableCell>

                    <TableCell align="center" sx={{ width: '10%', pr: 3 }}>
                      <IconButton
                        size="small"
                        title="Xóa biến thể này"
                        disabled={
                          saving ||
                          variants.length === 1
                        }
                        onClick={() =>
                          removeVariant(variant.id)
                        }
                        sx={{
                          color: '#64748B',
                          p: 0.75,
                          '&:hover': {
                            color: '#EF4444',
                            bgcolor: 'transparent'
                          }
                        }}
                      >
                        <DeleteOutlined style={{ fontSize: 16 }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Divider sx={{ borderColor: C.borderLight }} />

          <Box
            sx={{
              px: 3,
              py: 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 1.5
            }}
          >
            <Typography
              sx={{
                fontSize: 12.5,
                color: C.muted
              }}
            >
              Tổng cộng: <strong>{variants.length}</strong> biến thể · Tồn kho ban đầu là <strong>0</strong>, được cộng khi tạo
              phiếu nhập hàng. Để trống mã biến thể thì hệ thống tự tạo dạng TH + mã biến thể (ví dụ TH000058).
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Switch
                size="small"
                checked={onlineSalesEnabled}
                disabled={saving}
                onChange={(event) => setOnlineSalesEnabled(event.target.checked)}
              />
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text }}>Mở bán online ngay</Typography>
                <Typography sx={{ fontSize: 12, color: C.muted }}>
                  {onlineSalesEnabled ? 'Hiện trên website khi có hàng' : 'Tắt: chỉ bán tại quầy, bật sau ở danh sách sản phẩm'}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* FOOTER ACTIONS */}
      <Card
        sx={{
          ...cardSx,
          mt: 3.5
        }}
      >
        <CardContent
          sx={{
            p: { xs: 2.5, sm: 3 },
            '&:last-child': { pb: { xs: 2.5, sm: 3 } }
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 2
            }}
          >
            <Typography
              sx={{
                fontSize: 13,
                color: C.muted
              }}
            >
              Thông tin sản phẩm và hình ảnh sẽ được lưu trữ an toàn trong kho dữ liệu.
            </Typography>

            <Box
              sx={{
                display: 'flex',
                gap: 1.5
              }}
            >
              <Button
                disabled={saving}
                onClick={() => navigate('/products')}
                sx={outlineButtonSx}
              >
                Hủy bỏ
              </Button>

              <Button
                disabled={
                  saving ||
                  loadingCategories ||
                  categories.length === 0
                }
                onClick={handleSaveProduct}
                startIcon={
                  saving
                    ? <CircularProgress size={16} color="inherit" />
                    : <PlusOutlined />
                }
                sx={primaryButtonSx}
              >
                {saving
                  ? 'Đang tạo sản phẩm...'
                  : 'Tạo sản phẩm'}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
