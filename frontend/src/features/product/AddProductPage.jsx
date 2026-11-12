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
  InputAdornment,
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
import { formatPriceInput, parsePriceInput } from './priceInput';

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

  // Biến thể đã điền ít nhất một ô (dòng trống hoàn toàn bị bỏ qua khi lưu)
  const filledVariants = variants.filter(
    (variant) => variant.size.trim() || variant.color.trim() || variant.price !== ''
  );

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

    if (filledVariants.length === 0) {
      return 'Sản phẩm phải có ít nhất một biến thể (size, màu và giá bán).';
    }

    const combinations = new Set();

    // Dòng trống hoàn toàn được bỏ qua; dòng điền dở thì báo lỗi
    for (const variant of filledVariants) {
      const size = variant.size.trim();
      const color = variant.color.trim();
      const price = Number(variant.price);

      if (!size || !color || variant.price === '') {
        return 'Biến thể đang điền dở: hãy nhập đủ size, màu và giá bán (hoặc xóa dòng đó).';
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
      // Mã biến thể do backend tự gán TH + mã biến thể khi lưu
      variants: filledVariants.map((variant) => ({
        size: variant.size.trim(),
        color: variant.color.trim(),
        price: Number(variant.price)
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

  // Khoảng giá: chỉ tính ô đã nhập giá > 0 (ô trống không tính là 0 ₫)
  const prices = variants
    .filter((variant) => variant.price !== '')
    .map((variant) => Number(variant.price))
    .filter((price) => Number.isFinite(price) && price > 0);

  const priceRange =
    prices.length > 0
      ? `${Math.min(...prices).toLocaleString('vi-VN')} ₫${
          Math.min(...prices) !== Math.max(...prices)
            ? ` – ${Math.max(...prices).toLocaleString('vi-VN')} ₫`
            : ''
        }`
      : '';

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
            title="Biến thể"
            subtitle="Mỗi cặp size + màu là một biến thể có giá bán riêng."
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
                minWidth: 620,
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
                  <TableCell sx={{ pl: 3 }}>SIZE</TableCell>
                  <TableCell>MÀU</TableCell>
                  <TableCell>GIÁ BÁN (₫)</TableCell>
                  <TableCell sx={{ pr: 3 }} />
                </TableRow>
              </TableHead>

              <TableBody>
                {variants.map((variant) => (
                  <TableRow key={variant.id} hover sx={{ '&:hover': { bgcolor: '#FAFCFE' } }}>
                    <TableCell sx={{ width: '26%', pl: 3 }}>
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

                    <TableCell sx={{ width: '34%' }}>
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

                    <TableCell sx={{ width: '32%' }}>
                      <TextField
                        fullWidth
                        size="small"
                        // Hiển thị dạng tiền ngay trong ô (250.000), lưu chuỗi chữ số (250000)
                        placeholder="Ví dụ: 250.000"
                        value={formatPriceInput(variant.price)}
                        disabled={saving}
                        onChange={(event) =>
                          updateVariant(
                            variant.id,
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
                    </TableCell>

                    <TableCell align="center" sx={{ width: '8%', pr: 3 }}>
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
            <Typography sx={{ fontSize: 12.5, color: C.muted }}>
              <strong>{filledVariants.length}</strong> biến thể
              {priceRange && (
                <>
                  {' · Giá '}
                  <strong>{priceRange}</strong>
                </>
              )}
              {' · Mã TH tự tạo khi lưu · Tồn kho bắt đầu từ 0, cộng khi nhập hàng'}
            </Typography>
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
