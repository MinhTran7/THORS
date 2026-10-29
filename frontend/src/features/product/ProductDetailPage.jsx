
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';

import {
  ArrowLeftOutlined,
  EditOutlined,
  InfoCircleOutlined,
  PictureOutlined
} from '@ant-design/icons';

import { getProductById } from '../../services/productService';

const COLORS = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5EBF2',
  cyan: '#8DE9F2',
  cyanLight: '#EAFBFD',
  yellowLight: '#FFFBE7',
  green: '#25856A'
};

const LOW_STOCK_THRESHOLD = 5;

const cardSx = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 2,
  boxShadow: 'none',
  bgcolor: '#FFFFFF'
};

function formatPrice(value) {
  if (value == null) return '—';

  const number = Number(value);

  if (!Number.isFinite(number)) return '—';

  return `${number.toLocaleString('vi-VN')} ₫`;
}


function InfoCard({ label, value, highlight = false }) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        bgcolor: highlight
          ? COLORS.yellowLight
          : '#F7F9FC',
        borderRadius: 1.5,
        p: 2
      }}
    >
      <Typography
        fontSize={11}
        color={COLORS.muted}
      >
        {label}
      </Typography>

      <Typography
        sx={{
          fontSize: { xs: 16, md: 21 },
          fontWeight: 700,
          color: COLORS.text,
          mt: 0.75,
          overflowWrap: 'anywhere'
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

export default function ProductDetailPage() {
  const { productId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedImage, setSelectedImage] = useState(0);

  // ==========================================
  // LOAD PRODUCT DETAIL
  // ==========================================

  useEffect(() => {
    let active = true;

    async function loadProduct() {
      try {
        setLoading(true);
        setError('');
        setData(null);
        setSelectedImage(0);

        const result = await getProductById(productId);

        if (
          !result?.product ||
          !Array.isArray(result.variants) ||
          !Array.isArray(result.images)
        ) {
          throw new Error('Invalid product detail data.');
        }

        if (active) {
          setData(result);
        }
      } catch (err) {
        if (active) {
          setError(
            err?.message ||
            'Unable to load product details.'
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadProduct();

    return () => {
      active = false;
    };
  }, [productId]);

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
  // ERROR
  // ==========================================

  if (error || !data) {
    return (
      <Box sx={{ maxWidth: 1440, mx: 'auto' }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || 'Product details are unavailable.'}
        </Alert>

        <Button
          variant="outlined"
          onClick={() => navigate('/products')}
        >
          Back to Product List
        </Button>
      </Box>
    );
  }

  // ==========================================
  // PRODUCT DATA
  // ==========================================

  const { product, variants, images } = data;

  const activeProduct = product.status === 'ACTIVE';

  const totalStock = Number(product.totalStock ?? 0);

  const onlineVariantCount = Number(
    product.onlineVariantCount ?? 0
  );

  const variantCount = Number(
    product.variantCount ?? variants.length
  );

  const onlineEnabled =
    activeProduct && onlineVariantCount > 0;

  const priceRange =
    product.minPrice == null
      ? '—'
      : product.maxPrice == null ||
          Number(product.minPrice) ===
            Number(product.maxPrice)
        ? formatPrice(product.minPrice)
        : `${formatPrice(product.minPrice)} – ${formatPrice(product.maxPrice)}`;

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
      {/* PAGE HEADER */}

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{
          xs: 'flex-start',
          sm: 'center'
        }}
        spacing={2}
        sx={{ mb: 2.5 }}
      >
        <Box>
          <Button
            size="small"
            startIcon={<ArrowLeftOutlined />}
            onClick={() => navigate('/products')}
            sx={{
              px: 0,
              mb: 0.75,
              color: COLORS.muted,
              fontSize: 10,
              textTransform: 'uppercase'
            }}
          >
            Product List
          </Button>

          <Typography
            sx={{
              fontSize: { xs: 24, md: 29 },
              fontWeight: 500,
              color: COLORS.text
            }}
          >
            Product Detail (Management)
          </Typography>

          <Typography
            fontSize={12}
            color={COLORS.muted}
            sx={{ mt: 0.5 }}
          >
            A complete view of pricing, variants
            and product availability.
          </Typography>
        </Box>


<Button
  variant="contained"
  startIcon={<EditOutlined />}
  onClick={() => navigate(`/products/${productId}/edit`)}
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
  Edit Product
</Button>

      </Stack>

      {/* PRODUCT OVERVIEW */}

      <Grid container spacing={2.5}>
        {/* IMAGE GALLERY */}

        <Grid size={{ xs: 12, md: 4 }}>
          <Box
            sx={{
              width: '100%',
              aspectRatio: '1 / 1',
              borderRadius: 2,
              overflow: 'hidden',
              bgcolor: '#F0F2F5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {images.length > 0 ? (
              <Box
                component="img"
                src={images[selectedImage]?.imageUrl}
                alt={product.productName}
                sx={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
            ) : (
              <Stack
                alignItems="center"
                spacing={1}
                sx={{ color: COLORS.muted }}
              >
                <PictureOutlined
                  style={{ fontSize: 32 }}
                />
                <Typography fontSize={12}>
                  No product image
                </Typography>
              </Stack>
            )}
          </Box>

          {/* IMAGE THUMBNAILS */}

          {images.length > 1 && (
            <Grid
              container
              spacing={1}
              sx={{ mt: 1 }}
            >
              {images.map((image, index) => (
                <Grid
                  key={image.imageId}
                  size={{ xs: 4 }}
                >
                  <Box
                    component="img"
                    src={image.imageUrl}
                    alt={`Product image ${index + 1}`}
                    onClick={() =>
                      setSelectedImage(index)
                    }
                    sx={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      objectFit: 'cover',
                      borderRadius: 1.5,
                      cursor: 'pointer',
                      border: '2px solid',
                      borderColor:
                        selectedImage === index
                          ? COLORS.cyan
                          : 'transparent',
                      '&:hover': {
                        opacity: 0.85
                      }
                    }}
                  />
                </Grid>
              ))}
            </Grid>
          )}

          <Typography
            fontSize={11}
            color={COLORS.muted}
            sx={{ mt: 1 }}
          >
            {images.length} product image
            {images.length !== 1 ? 's' : ''}
            {' '}· Main image shown first
          </Typography>
        </Grid>

        {/* PRODUCT INFORMATION */}

        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ ...cardSx, height: '100%' }}>
            <Box sx={{ p: 2.5 }}>
              <Chip
                label={product.categoryName || 'Uncategorized'}
                size="small"
                sx={{
                  bgcolor: COLORS.cyanLight,
                  color: COLORS.text,
                  fontSize: 10,
                  height: 23,
                  mb: 1
                }}
              />

              <Typography
                sx={{
                  fontSize: { xs: 21, md: 26 },
                  fontWeight: 700,
                  color: COLORS.text
                }}
              >
                {product.productName}
              </Typography>

              <Typography
                fontSize={11}
                color={COLORS.muted}
                sx={{ mt: 0.75 }}
              >
                Product ID: {product.productId}
              </Typography>

              <Typography
                fontSize={12}
                color={COLORS.muted}
                sx={{
                  mt: 2,
                  mb: 2.5,
                  whiteSpace: 'pre-wrap'
                }}
              >
                {product.description ||
                  'No description available.'}
              </Typography>

              {/* PRICE INFORMATION */}

              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
              >
                <InfoCard
                  label="Selling price"
                  value={priceRange}
                  highlight
                />

                <InfoCard
                  label="Total stock"
                  value={`${totalStock} units`}
                />
              </Stack>

              {/* SUMMARY */}

              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                spacing={1}
                sx={{ mt: 2 }}
              >
                <Typography
                  fontSize={11}
                  color={COLORS.muted}
                >
                  {variantCount} variant
                  {variantCount !== 1 ? 's' : ''}
                  {' '}· {totalStock} total units
                </Typography>

                <Typography
                  fontSize={11}
                  color={COLORS.muted}
                >
                  {onlineVariantCount}/{variantCount}
                  {' '}variants enabled for online sales
                </Typography>
              </Stack>
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* VARIANT MATRIX AND STATUS */}

      <Grid
        container
        spacing={2.5}
        sx={{ mt: 1 }}
      >
        {/* VARIANT TABLE */}

        <Grid size={{ xs: 12, lg: 8 }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ mb: 1.5 }}
          >
            <Typography
              fontSize={16}
              fontWeight={700}
              color={COLORS.text}
            >
              Variant stock matrix
            </Typography>

            <Chip
              size="small"
              label={`${totalStock} total units`}
              sx={{
                bgcolor: COLORS.yellowLight,
                color: COLORS.text,
                fontWeight: 600,
                fontSize: 10
              }}
            />
          </Stack>

          <Card sx={cardSx}>
            <TableContainer>
              <Table
                sx={{
                  minWidth: 600,
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
                      'Variant ID',
                      'Selling Price',
                      'Stock',
                      'Availability'
                    ].map((label) => (
                      <TableCell
                        key={label}
                        sx={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: COLORS.muted,
                          py: 1.75
                        }}
                      >
                        {label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>

                <TableBody>
                  {variants.map((variant) => {
                    const stock = Number(
                      variant.stockQuantity ?? 0
                    );

                    const activeVariant =
                      variant.status === 'ACTIVE';

                    let availability = 'In stock';
                    let availabilityBg = '#E8F6F0';
                    let availabilityColor = COLORS.green;

                    if (!activeVariant) {
                      availability = 'Disabled';
                      availabilityBg = '#F0F2F5';
                      availabilityColor = COLORS.muted;
                    } else if (stock <= 0) {
                      availability = 'Out of stock';
                      availabilityBg = '#FDEDED';
                      availabilityColor = '#C13F3F';
                    } else if (
                      stock < LOW_STOCK_THRESHOLD
                    ) {
                      availability = 'Low stock';
                      availabilityBg = COLORS.yellowLight;
                      availabilityColor = '#9B741F';
                    }

                    return (
                      <TableRow
                        key={variant.detailId}
                        hover
                      >
                        <TableCell sx={{ fontSize: 12 }}>
                          {variant.size || '—'}
                        </TableCell>

                        <TableCell sx={{ fontSize: 12 }}>
                          {variant.color || '—'}
                        </TableCell>

                        <TableCell
                          sx={{
                            fontSize: 11,
                            color: COLORS.muted
                          }}
                        >
                          #{variant.detailId}
                        </TableCell>

                        <TableCell sx={{ fontSize: 12 }}>
                          {formatPrice(variant.price)}
                        </TableCell>

                        <TableCell sx={{ fontSize: 12 }}>
                          {stock}
                        </TableCell>

                        <TableCell>
                          <Chip
                            size="small"
                            label={availability}
                            sx={{
                              height: 23,
                              bgcolor: availabilityBg,
                              color: availabilityColor,
                              fontSize: 10
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {variants.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        align="center"
                        sx={{ py: 4 }}
                      >
                        <Typography
                          fontSize={12}
                          color={COLORS.muted}
                        >
                          No variants available.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <Box
              sx={{
                px: 2,
                py: 1.5,
                borderTop: `1px solid ${COLORS.border}`
              }}
            >
              <Typography
                fontSize={11}
                color={COLORS.muted}
              >
                {variants.length} variants ·{' '}
                {totalStock} total units
              </Typography>
            </Box>
          </Card>
        </Grid>

        {/* STATUS AND VISIBILITY */}

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2}>
            <Card sx={cardSx}>
              <Box sx={{ p: 2.5 }}>
                <Typography
                  fontSize={15}
                  fontWeight={700}
                  color={COLORS.text}
                  sx={{ mb: 2.5 }}
                >
                  Status &amp; visibility
                </Typography>

                <Stack spacing={2.5}>
                  <Box>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Typography
                        fontSize={12}
                        fontWeight={600}
                        color={COLORS.text}
                      >
                        Product status
                      </Typography>

                      <Chip
                        size="small"
                        label={
                          activeProduct
                            ? 'Active'
                            : 'Disabled'
                        }
                        sx={{
                          bgcolor: activeProduct
                            ? '#E8F6F0'
                            : '#F0F2F5',
                          color: activeProduct
                            ? COLORS.green
                            : COLORS.muted,
                          fontSize: 10
                        }}
                      />
                    </Stack>

                    <Typography
                      fontSize={11}
                      color={COLORS.muted}
                      sx={{ mt: 1 }}
                    >
                      Product status is managed
                      through inventory settings.
                    </Typography>
                  </Box>

                  <Box>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Typography
                        fontSize={12}
                        fontWeight={600}
                        color={COLORS.text}
                      >
                        Online sale
                      </Typography>

                      <Chip
                        size="small"
                        label={
                          onlineEnabled ? 'On' : 'Off'
                        }
                        sx={{
                          bgcolor: onlineEnabled
                            ? COLORS.cyanLight
                            : '#F0F2F5',
                          color: onlineEnabled
                            ? COLORS.green
                            : COLORS.muted,
                          fontSize: 10
                        }}
                      />
                    </Stack>

                    <Typography
                      fontSize={11}
                      color={COLORS.muted}
                      sx={{ mt: 1 }}
                    >
                      {onlineVariantCount} of{' '}
                      {variantCount} variants are
                      enabled for online sales.
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            </Card>

            {/* INVENTORY NOTE */}

            <Box
              sx={{
                bgcolor: COLORS.yellowLight,
                borderRadius: 2,
                p: 2
              }}
            >
              <Stack
                direction="row"
                spacing={1.5}
                alignItems="flex-start"
              >
                <InfoCircleOutlined
                  style={{
                    fontSize: 16,
                    color: COLORS.text,
                    marginTop: 2
                  }}
                />

                <Box>
                  <Typography
                    fontSize={12}
                    fontWeight={700}
                    color={COLORS.text}
                  >
                    Stock stays in sync
                  </Typography>

                  <Typography
                    fontSize={11}
                    color={COLORS.muted}
                    sx={{ mt: 0.75 }}
                  >
                    Stock quantities are displayed
                    from inventory records. Changes
                    should be made through the
                    appropriate inventory operations.
                  </Typography>
                </Box>
              </Stack>
            </Box>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
