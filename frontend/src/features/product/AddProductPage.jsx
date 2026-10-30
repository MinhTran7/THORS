
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Stack,
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
import { getCategories } from '../../services/categoryService';

const MAX_IMAGES = 10;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp'
];

const COLORS = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5EBF2',
  cyan: '#8DE9F2',
  cyanLight: '#EAFBFD',
  yellowLight: '#FFFBE7',
  green: '#25856A'
};

const cardSx = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 2,
  boxShadow: 'none',
  bgcolor: '#FFFFFF'
};

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 1.5,
    fontSize: 13
  }
};

function createEmptyVariant() {
  return {
    id: crypto.randomUUID(),
    size: '',
    color: '',
    price: ''
  };
}

function SectionTitle({ title, subtitle }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography
        fontSize={15}
        fontWeight={700}
        color={COLORS.text}
      >
        {title}
      </Typography>

      {subtitle && (
        <Typography
          fontSize={11}
          color={COLORS.muted}
          sx={{ mt: 0.5 }}
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
      fontSize={11}
      fontWeight={600}
      color={COLORS.text}
      sx={{ mb: 0.75 }}
    >
      {children}
      {required && (
        <Box component="span" sx={{ color: 'error.main' }}>
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
  const [loadingCategories, setLoadingCategories] =
    useState(true);

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
          throw new Error('Invalid category data.');
        }

        if (active) {
          setCategories(
            data.filter(
              (category) => category.status === 'ACTIVE'
            )
          );
        }
      } catch (err) {
        if (active) {
          setError(
            err?.message || 'Unable to load categories.'
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
      setError(
        `Maximum ${MAX_IMAGES} images per product.`
      );
      return;
    }

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(
          'Only JPG, PNG and WebP images are allowed.'
        );
        return;
      }

      if (file.size === 0) {
        setError(`Image "${file.name}" is empty.`);
        return;
      }

      if (file.size > MAX_IMAGE_SIZE) {
        setError(
          `Image "${file.name}" exceeds 5 MB.`
        );
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
      return 'Product name is required.';
    }

    if (productName.trim().length > 200) {
      return 'Product name must not exceed 200 characters.';
    }

    if (!categoryId) {
      return 'Please select a category.';
    }

    if (images.length === 0) {
      return 'Please upload at least one product image.';
    }

    if (images.length > MAX_IMAGES) {
      return `Maximum ${MAX_IMAGES} images per product.`;
    }

    if (variants.length === 0) {
      return 'At least one product variant is required.';
    }

    const combinations = new Set();

    for (const variant of variants) {
      const size = variant.size.trim();
      const color = variant.color.trim();
      const price = Number(variant.price);

      if (!size || !color || variant.price === '') {
        return 'Size, color and selling price are required for every variant.';
      }

      if (size.length > 10) {
        return 'Size must not exceed 10 characters.';
      }

      if (color.length > 30) {
        return 'Color must not exceed 30 characters.';
      }

      if (
        !Number.isSafeInteger(price) ||
        price < 0 ||
        price > 999999999999
      ) {
        return 'Please enter a valid selling price in VND.';
      }

      const key = JSON.stringify([
        size.toLowerCase(),
        color.toLowerCase()
      ]);

      if (combinations.has(key)) {
        return 'Duplicate size and color combination.';
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
      variants: variants.map((variant) => ({
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
      console.error(
        'Failed to create product:',
        err
      );

      setError(
        err?.message ||
        'Unable to create product. Please try again.'
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
      : 'Not specified';

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <Box
      sx={{
        maxWidth: 1440,
        mx: 'auto',
        pb: 3
      }}
    >
      {/* ======================================
          PAGE HEADER
      ====================================== */}

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{
          xs: 'flex-start',
          sm: 'center'
        }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Button
            size="small"
            startIcon={<ArrowLeftOutlined />}
            onClick={() => navigate('/products')}
            disabled={saving}
            sx={{
              px: 0,
              mb: 0.75,
              color: COLORS.muted,
              fontSize: 10,
              textTransform: 'uppercase'
            }}
          >
            Product List / Add Product
          </Button>

          <Typography
            sx={{
              fontSize: { xs: 24, md: 29 },
              fontWeight: 500,
              color: COLORS.text
            }}
          >
            Add Product
          </Typography>

          <Typography
            fontSize={12}
            color={COLORS.muted}
            sx={{ mt: 0.5 }}
          >
            Create a new product with images,
            categories and size/color variants.
          </Typography>
        </Box>

        {hasChanges && (
          <Chip
            label="Unsaved changes"
            size="small"
            sx={{
              bgcolor: COLORS.yellowLight,
              color: COLORS.text,
              fontSize: 11,
              fontWeight: 600
            }}
          />
        )}
      </Stack>

      {/* ======================================
          ERROR MESSAGE
      ====================================== */}

      {error && (
        <Alert
          severity="error"
          onClose={() => setError('')}
          sx={{ mb: 2.5 }}
        >
          {error}
        </Alert>
      )}

      {/* ======================================
          TWO COLUMN LAYOUT
      ====================================== */}

      <Grid container spacing={2.5}>
        {/* LEFT COLUMN */}

        <Grid size={{ xs: 12, lg: 8 }}>
          <Stack spacing={2.5}>

            {/* BASIC INFORMATION */}

            <Card sx={cardSx}>
              <CardContent
                sx={{
                  p: 2.5,
                  '&:last-child': { pb: 2.5 }
                }}
              >
                <SectionTitle
                  title="Basic information"
                  subtitle="Enter the essential details of your product."
                />

                <Stack spacing={2.5}>
                  <Box>
                    <FieldLabel required>
                      Product Name
                    </FieldLabel>

                    <TextField
                      fullWidth
                      size="small"
                      placeholder="Enter product name"
                      value={productName}
                      onChange={(event) =>
                        setProductName(
                          event.target.value
                        )
                      }
                      disabled={saving}
                      slotProps={{
                        htmlInput: {
                          maxLength: 200
                        }
                      }}
                      sx={fieldSx}
                    />
                  </Box>

                  <Box>
                    <FieldLabel required>
                      Category
                    </FieldLabel>

                    <TextField
                      select
                      fullWidth
                      size="small"
                      value={categoryId}
                      onChange={(event) =>
                        setCategoryId(
                          event.target.value
                        )
                      }
                      disabled={
                        saving ||
                        loadingCategories ||
                        categories.length === 0
                      }
                      sx={fieldSx}
                    >
                      <MenuItem value="" disabled>
                        Select category
                      </MenuItem>

                      {categories.map((category) => (
                        <MenuItem
                          key={category.categoryId}
                          value={category.categoryId}
                        >
                          {category.categoryName}
                        </MenuItem>
                      ))}
                    </TextField>

                    <Typography
                      fontSize={10}
                      color={COLORS.muted}
                      sx={{ mt: 0.75 }}
                    >
                      {loadingCategories
                        ? 'Loading categories...'
                        : categories.length === 0
                          ? 'No active categories available.'
                          : 'Only active categories are available.'}
                    </Typography>
                  </Box>

                  <Box>
                    <FieldLabel>
                      Description
                    </FieldLabel>

                    <TextField
                      fullWidth
                      multiline
                      rows={4}
                      placeholder="Describe your product, materials, style and other details..."
                      value={description}
                      onChange={(event) =>
                        setDescription(
                          event.target.value
                        )
                      }
                      disabled={saving}
                      sx={fieldSx}
                    />

                    <Typography
                      fontSize={10}
                      color={COLORS.muted}
                      sx={{ mt: 0.75 }}
                    >
                      Provide a clear description
                      to help your team identify
                      the product.
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>

            {/* PRICING */}

            <Card sx={cardSx}>
              <CardContent
                sx={{
                  p: 2.5,
                  '&:last-child': { pb: 2.5 }
                }}
              >
                <SectionTitle
                  title="Pricing"
                  subtitle="Selling prices are configured for each size/color variant."
                />

                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  justifyContent="space-between"
                  spacing={1}
                >
                  <Box>
                    <Typography
                      fontSize={11}
                      color={COLORS.muted}
                    >
                      Price range
                    </Typography>

                    <Typography
                      fontSize={18}
                      fontWeight={600}
                      color={COLORS.text}
                      sx={{ mt: 0.5 }}
                    >
                      {priceRange}
                    </Typography>
                  </Box>

                  <Chip
                    size="small"
                    label="Currency: VND"
                    sx={{
                      alignSelf: 'flex-start',
                      bgcolor: COLORS.cyanLight,
                      color: COLORS.text
                    }}
                  />
                </Stack>

                <Typography
                  fontSize={10}
                  color={COLORS.muted}
                  sx={{ mt: 1.5 }}
                >
                  Set the selling price for each
                  variant in the table below.
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
                  p: 2.5,
                  '&:last-child': { pb: 2.5 }
                }}
              >
                <SectionTitle
                  title="Image Upload"
                  subtitle="The first image appears in the product catalog."
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
                    border: `1px dashed ${COLORS.cyan}`,
                    borderRadius: 1.5,
                    bgcolor: '#FAFCFE',
                    py: 3,
                    px: 2,
                    textAlign: 'center',
                    cursor:
                      saving ||
                      images.length >= MAX_IMAGES
                        ? 'not-allowed'
                        : 'pointer',
                    '&:hover': {
                      bgcolor: COLORS.cyanLight
                    }
                  }}
                >
                  <CloudUploadOutlined
                    style={{
                      fontSize: 27,
                      color: COLORS.text
                    }}
                  />

                  <Typography
                    fontSize={12}
                    fontWeight={600}
                    color={COLORS.text}
                    sx={{ mt: 1 }}
                  >
                    Upload product images
                  </Typography>

                  <Typography
                    fontSize={10}
                    color={COLORS.muted}
                    sx={{ mt: 0.5 }}
                  >
                    JPG, PNG, WebP · Up to 5 MB
                  </Typography>

                  <Typography
                    fontSize={10}
                    color={COLORS.muted}
                    sx={{ mt: 0.5 }}
                  >
                    {images.length}/{MAX_IMAGES} images
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
                            border: `1px solid ${
                              index === 0
                                ? COLORS.cyan
                                : COLORS.border
                            }`,
                            borderRadius: 1.5,
                            p: 0.75
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
                              borderRadius: 1
                            }}
                          />

                          <Typography
                            fontSize={10}
                            color={COLORS.muted}
                            noWrap
                            title={image.file.name}
                            sx={{ mt: 0.5 }}
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
                              <Chip
                                label="Primary"
                                size="small"
                                icon={<StarFilled />}
                                sx={{
                                  height: 22,
                                  fontSize: 9,
                                  bgcolor: COLORS.cyanLight
                                }}
                              />
                            ) : (
                              <IconButton
                                size="small"
                                title="Set as primary"
                                disabled={saving}
                                onClick={() =>
                                  setPrimaryImage(image.id)
                                }
                              >
                                <StarOutlined />
                              </IconButton>
                            )}

                            <IconButton
                              size="small"
                              color="error"
                              title="Remove image"
                              disabled={saving}
                              onClick={() =>
                                removeImage(image.id)
                              }
                            >
                              <DeleteOutlined />
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
                  p: 2.5,
                  '&:last-child': { pb: 2.5 }
                }}
              >
                <SectionTitle
                  title="Product availability"
                  subtitle="Initial availability for newly created products."
                />

                <Stack spacing={2}>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Typography
                      fontSize={12}
                      color={COLORS.text}
                    >
                      Product status
                    </Typography>

                    <Chip
                      label="Active"
                      size="small"
                      icon={<CheckCircleOutlined />}
                      sx={{
                        bgcolor: '#E8F6F0',
                        color: COLORS.green,
                        fontSize: 10
                      }}
                    />
                  </Stack>

                  <Divider />

                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Typography
                      fontSize={12}
                      color={COLORS.text}
                    >
                      Online sale
                    </Typography>

                    <Chip
                      label="Off"
                      size="small"
                      sx={{
                        bgcolor: '#F0F2F5',
                        color: COLORS.muted,
                        fontSize: 10
                      }}
                    />
                  </Stack>

                  <Divider />

                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Typography
                      fontSize={12}
                      color={COLORS.text}
                    >
                      Initial stock
                    </Typography>

                    <Typography
                      fontSize={13}
                      fontWeight={700}
                      color={COLORS.text}
                    >
                      0 units
                    </Typography>
                  </Stack>

                  <Alert
                    severity="info"
                    icon={<InfoCircleOutlined />}
                    sx={{
                      '& .MuiAlert-message': {
                        fontSize: 11
                      }
                    }}
                  >
                    New products start with zero stock.
                    Stock is updated through inventory
                    operations. Online sales are
                    initially disabled.
                  </Alert>
                </Stack>
              </CardContent>
            </Card>

          </Stack>
        </Grid>
      </Grid>

      {/* ======================================
          SIZE / COLOR VARIANT MATRIX
      ====================================== */}

      <Box sx={{ mt: 2.5 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{
            xs: 'flex-start',
            sm: 'center'
          }}
          spacing={1.5}
          sx={{ mb: 1.5 }}
        >
          <SectionTitle
            title="Size / color variant matrix"
            subtitle="Create a unique size and color combination with its own selling price."
          />

          <Button
            variant="outlined"
            startIcon={<PlusOutlined />}
            onClick={addVariant}
            disabled={saving}
            sx={{
              borderColor: COLORS.border,
              color: COLORS.text,
              textTransform: 'none',
              fontSize: 12,
              bgcolor: '#FFFFFF'
            }}
          >
            Add Variant
          </Button>
        </Stack>

        <Card sx={cardSx}>
          <TableContainer>
            <Table
              sx={{
                minWidth: 650,
                '& .MuiTableCell-root': {
                  borderColor: COLORS.border
                }
              }}
            >
              <TableHead>
                <TableRow
                  sx={{ bgcolor: '#F7F9FC' }}
                >
                  {[
                    'Size',
                    'Color',
                    'Selling Price (VND)',
                    'Action'
                  ].map((label) => (
                    <TableCell
                      key={label}
                      sx={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: COLORS.muted,
                        py: 1.5
                      }}
                    >
                      {label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>

              <TableBody>
                {variants.map((variant) => (
                  <TableRow key={variant.id}>
                    <TableCell sx={{ width: '22%' }}>
                      <TextField
                        fullWidth
                        size="small"
                        placeholder="e.g. M"
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
                        sx={fieldSx}
                      />
                    </TableCell>

                    <TableCell sx={{ width: '28%' }}>
                      <TextField
                        fullWidth
                        size="small"
                        placeholder="e.g. Black"
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
                        sx={fieldSx}
                      />
                    </TableCell>

                    <TableCell sx={{ width: '35%' }}>
                      <TextField
                        fullWidth
                        size="small"
                        type="number"
                        placeholder="e.g. 250000"
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
                            min: 0,
                            max: 999999999999,
                            step: 1
                          }
                        }}
                        sx={fieldSx}
                      />
                    </TableCell>

                    <TableCell sx={{ width: '15%' }}>
                      <Button
                        color="error"
                        size="small"
                        startIcon={<DeleteOutlined />}
                        disabled={
                          saving ||
                          variants.length === 1
                        }
                        onClick={() =>
                          removeVariant(variant.id)
                        }
                        sx={{
                          textTransform: 'none',
                          fontSize: 11
                        }}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Divider />

          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography
              fontSize={11}
              color={COLORS.muted}
            >
              {variants.length} variant
              {variants.length !== 1 ? 's' : ''}
              {' '}· Stock will start at 0 units
            </Typography>
          </Box>
        </Card>
      </Box>

      {/* ======================================
          FOOTER ACTIONS
      ====================================== */}

      <Card
        sx={{
          ...cardSx,
          mt: 2.5
        }}
      >
        <CardContent
          sx={{
            p: 2,
            '&:last-child': { pb: 2 }
          }}
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{
              xs: 'stretch',
              sm: 'center'
            }}
            spacing={2}
          >
            <Typography
              fontSize={11}
              color={COLORS.muted}
            >
              Product details and images will be
              saved to your store inventory.
            </Typography>

            <Stack
              direction="row"
              spacing={1}
              justifyContent="flex-end"
            >
              <Button
                variant="outlined"
                disabled={saving}
                onClick={() =>
                  navigate('/products')
                }
                sx={{
                  color: COLORS.text,
                  borderColor: COLORS.border,
                  textTransform: 'none',
                  fontSize: 12
                }}
              >
                Cancel
              </Button>

              <Button
                variant="contained"
                disabled={
                  saving ||
                  loadingCategories ||
                  categories.length === 0
                }
                onClick={handleSaveProduct}
                startIcon={
                  saving
                    ? <CircularProgress size={14} />
                    : <PlusOutlined />
                }
                sx={{
                  bgcolor: COLORS.cyan,
                  color: COLORS.text,
                  textTransform: 'none',
                  fontWeight: 600,
                  boxShadow: 'none',
                  fontSize: 12,
                  '&:hover': {
                    bgcolor: '#6DDDE9',
                    boxShadow: 'none'
                  }
                }}
              >
                {saving
                  ? 'Creating...'
                  : 'Create Product'}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
