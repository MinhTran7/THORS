
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

const COLORS = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5EBF2',
  cyan: '#8DE9F2',
  cyanLight: '#EAFBFD'
};

const cardSx = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 2,
  boxShadow: 'none',
  p: 2.5
};

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
          throw new Error('Product not found.');
        }

        if (!active) return;

        const { product, variants, images: productImages } =
          productData;

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

        // Support both a direct array and a wrapped response.
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
            err?.message || 'Unable to load product information.'
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
      setError('Product name is required.');
      return;
    }

    if (productName.length > 200) {
      setError('Product name must not exceed 200 characters.');
      return;
    }

    if (!form.categoryId) {
      setError('Please select a category.');
      return;
    }

    if (form.variants.length === 0) {
      setError('At least one variant is required.');
      return;
    }

    const combinations = new Set();

    for (const variant of form.variants) {
      const size = variant.size.trim();
      const color = variant.color.trim();
      const priceText = String(variant.price).trim();

      if (!size || size.length > 10) {
        setError('Size is required and must not exceed 10 characters.');
        return;
      }

      if (!color || color.length > 30) {
        setError('Color is required and must not exceed 30 characters.');
        return;
      }

      if (
        !/^\d+$/.test(priceText) ||
        Number(priceText) > 999999999999
      ) {
        setError('Price must be a valid non-negative VND amount.');
        return;
      }

      const key =
        `${size.toLowerCase()}\u0000${color.toLowerCase()}`;

      if (combinations.has(key)) {
        setError('Duplicate size and color combination.');
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
        err?.message || 'Unable to save product changes.'
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
          minHeight: 350,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', pb: 4 }}>
      {/* HEADER */}

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Button
            startIcon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/products/${productId}`)}
            sx={{
              px: 0,
              color: COLORS.muted,
              textTransform: 'none',
              mb: 1
            }}
          >
            Back to Product Detail
          </Button>

          <Typography
            sx={{
              fontSize: { xs: 24, md: 29 },
              fontWeight: 600,
              color: COLORS.text
            }}
          >
            Edit Product
          </Typography>

          <Typography fontSize={12} color={COLORS.muted}>
            Update product information, pricing and variants.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            disabled={saving}
            onClick={() => navigate(`/products/${productId}`)}
            sx={{ textTransform: 'none' }}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            startIcon={<SaveOutlined />}
            disabled={saving}
            onClick={handleSave}
            sx={{
              bgcolor: COLORS.cyan,
              color: COLORS.text,
              textTransform: 'none',
              fontWeight: 600,
              boxShadow: 'none',
              '&:hover': {
                bgcolor: '#6DDDE9',
                boxShadow: 'none'
              }
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
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

            <Card sx={cardSx}>
              <Typography
                fontSize={16}
                fontWeight={700}
                color={COLORS.text}
                sx={{ mb: 2.5 }}
              >
                Basic Information
              </Typography>

              <Stack spacing={2.5}>
                <TextField
                  fullWidth
                  required
                  label="Product Name"
                  value={form.productName}
                  onChange={(event) =>
                    updateField('productName', event.target.value)
                  }
                />

                <TextField
                  fullWidth
                  select
                  required
                  label="Category"
                  value={form.categoryId}
                  onChange={(event) =>
                    updateField('categoryId', event.target.value)
                  }
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
                        {!isActive ? ' (Inactive)' : ''}
                      </MenuItem>
                    );
                  })}
                </TextField>

                <TextField
                  fullWidth
                  multiline
                  minRows={4}
                  label="Description"
                  value={form.description}
                  onChange={(event) =>
                    updateField('description', event.target.value)
                  }
                />
              </Stack>
            </Card>

            {/* VARIANTS */}

            <Card sx={cardSx}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 2.5 }}
              >
                <Box>
                  <Typography
                    fontSize={16}
                    fontWeight={700}
                    color={COLORS.text}
                  >
                    Product Variants
                  </Typography>

                  <Typography
                    fontSize={11}
                    color={COLORS.muted}
                    sx={{ mt: 0.5 }}
                  >
                    Edit size, color and selling price.
                    Stock quantities are not editable here.
                  </Typography>
                </Box>

                <Button
                  startIcon={<PlusOutlined />}
                  onClick={addVariant}
                  variant="outlined"
                  sx={{ textTransform: 'none' }}
                >
                  Add Variant
                </Button>
              </Stack>

              <Stack spacing={2}>
                {form.variants.map((variant, index) => (
                  <Box
                    key={variant.detailId ?? `new-${index}`}
                    sx={{
                      p: 2,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 1.5,
                      bgcolor: '#FAFBFD'
                    }}
                  >
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      sx={{ mb: 1.5 }}
                    >
                      <Typography
                        fontSize={12}
                        fontWeight={600}
                        color={COLORS.text}
                      >
                        {variant.detailId != null
                          ? `Variant #${variant.detailId}`
                          : `New Variant ${index + 1}`}
                      </Typography>

                      {variant.detailId == null && (
                        <Button
                          color="error"
                          size="small"
                          onClick={() => removeNewVariant(index)}
                          sx={{ textTransform: 'none' }}
                        >
                          Remove
                        </Button>
                      )}
                    </Stack>

                    <Grid container spacing={1.5}>
                      <Grid size={{ xs: 12, sm: 3 }}>
                        <TextField
                          fullWidth
                          required
                          size="small"
                          label="Size"
                          value={variant.size}
                          onChange={(event) =>
                            updateVariantField(
                              index,
                              'size',
                              event.target.value
                            )
                          }
                        />
                      </Grid>

                      <Grid size={{ xs: 12, sm: 4 }}>
                        <TextField
                          fullWidth
                          required
                          size="small"
                          label="Color"
                          value={variant.color}
                          onChange={(event) =>
                            updateVariantField(
                              index,
                              'color',
                              event.target.value
                            )
                          }
                        />
                      </Grid>

                      <Grid size={{ xs: 12, sm: 5 }}>
                        <TextField
                          fullWidth
                          required
                          size="small"
                          label="Selling Price (VND)"
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
                              step: 1
                            }
                          }}
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

            <Card sx={cardSx}>
              <Typography
                fontSize={16}
                fontWeight={700}
                color={COLORS.text}
                sx={{ mb: 1 }}
              >
                Product Images
              </Typography>

              <Typography
                fontSize={11}
                color={COLORS.muted}
                sx={{ mb: 2 }}
              >
                Existing images are shown below.
                Image editing will be implemented separately.
              </Typography>

              {images.length > 0 ? (
                <Grid container spacing={1}>
                  {images.map((image) => (
                    <Grid
                      key={image.imageId}
                      size={{ xs: 6 }}
                    >
                      <Box
                        component="img"
                        src={image.imageUrl}
                        alt="Product"
                        sx={{
                          width: '100%',
                          aspectRatio: '1 / 1',
                          objectFit: 'cover',
                          borderRadius: 1.5,
                          border: `1px solid ${COLORS.border}`
                        }}
                      />
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Typography
                  fontSize={12}
                  color={COLORS.muted}
                >
                  No product images.
                </Typography>
              )}
            </Card>

            {/* NOTES */}

            <Card
              sx={{
                ...cardSx,
                bgcolor: COLORS.cyanLight
              }}
            >
              <Typography
                fontSize={13}
                fontWeight={700}
                color={COLORS.text}
                sx={{ mb: 1 }}
              >
                Editing Guidelines
              </Typography>

              <Typography
                fontSize={11}
                color={COLORS.muted}
                sx={{ lineHeight: 1.8 }}
              >
                Existing variants retain their IDs,
                stock quantities and online sales settings.
                Newly added variants start with zero stock
                and online sales disabled.
              </Typography>
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
