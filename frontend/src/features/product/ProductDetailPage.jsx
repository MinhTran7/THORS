import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Switch,
  Tooltip,
  Typography
} from '@mui/material';

import {
  ArrowLeftOutlined,
  EditOutlined,
  InfoCircleOutlined,
  PictureOutlined
} from '@ant-design/icons';

import { getProductById, setVariantOnline } from '../../services/productService';
import { C, cardSx, outlineButtonSx, primaryButtonSx } from '../customer/theme';

// Switch thu nhỏ theo Design System
const switchSx = {
  width: 34,
  height: 18,
  p: 0,
  '& .MuiSwitch-switchBase': {
    p: '2px',
    '&.Mui-checked': {
      transform: 'translateX(16px)',
      color: '#67E8F9',
      '& + .MuiSwitch-track': { bgcolor: '#BAF2F8', opacity: 1, border: 0 }
    }
  },
  '& .MuiSwitch-thumb': { boxShadow: '0 1px 2px rgba(0,0,0,0.15)', width: 14, height: 14 },
  '& .MuiSwitch-track': { borderRadius: 9, bgcolor: '#CBD5E1', opacity: 1 }
};

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
        bgcolor: highlight ? '#F0FDFA' : '#F8FAFC',
        border: `1.5px solid ${highlight ? '#99F6E4' : C.border}`,
        borderRadius: 3,
        p: 2.5
      }}
    >
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 700,
          color: highlight ? '#0F766E' : C.muted
        }}
      >
        {label}
      </Typography>

      <Typography
        sx={{
          fontSize: { xs: 20, md: 24 },
          fontWeight: 800,
          color: '#0F172A',
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

  // Bật/tắt bán online từng biến thể
  const [togglingVariantId, setTogglingVariantId] = useState(null);
  const [variantError, setVariantError] = useState('');

  async function toggleVariantOnline(variant) {
    if (togglingVariantId) return;
    const enable = !Number(variant.onlineSalesEnabled);
    try {
      setVariantError('');
      setTogglingVariantId(variant.detailId);
      const result = await setVariantOnline(productId, variant.detailId, enable);
      setData((previous) =>
        previous
          ? {
              ...previous,
              product: { ...previous.product, onlineVariantCount: result?.onlineVariantCount ?? previous.product.onlineVariantCount },
              variants: previous.variants.map((v) =>
                v.detailId === variant.detailId ? { ...v, onlineSalesEnabled: enable ? 1 : 0 } : v
              )
            }
          : previous
      );
    } catch (err) {
      setVariantError(err?.message || 'Không thể đổi trạng thái bán online của biến thể.');
    } finally {
      setTogglingVariantId(null);
    }
  }

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
          throw new Error('Dữ liệu chi tiết sản phẩm không hợp lệ.');
        }

        if (active) {
          setData(result);
        }
      } catch (err) {
        if (active) {
          setError(
            err?.message || 'Không thể tải thông tin chi tiết sản phẩm.'
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
  // ERROR
  // ==========================================

  if (error || !data) {
    return (
      <Box sx={{ maxWidth: 1440, mx: 'auto', p: 3, color: C.text }}>
        <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2.5, fontSize: 13.5, fontWeight: 600 }}>
          {error || 'Không tìm thấy thông tin sản phẩm.'}
        </Alert>

        <Button
          onClick={() => navigate('/products')}
          sx={outlineButtonSx}
        >
          Quay lại danh sách sản phẩm
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
  const onlineVariantCount = Number(product.onlineVariantCount ?? 0);
  const variantCount = Number(product.variantCount ?? variants.length);
  const onlineEnabled = activeProduct && onlineVariantCount > 0;

  const priceRange =
    product.minPrice == null
      ? '—'
      : product.maxPrice == null ||
          Number(product.minPrice) === Number(product.maxPrice)
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
              Chi tiết sản phẩm
            </Typography>

            <Typography
              sx={{
                fontSize: 13.5,
                color: C.muted,
                mt: 0.5,
                lineHeight: 1.6
              }}
            >
              Xem toàn bộ thông tin giá bán, hình ảnh, ma trận biến thể và tồn kho của sản phẩm
            </Typography>
          </Box>

          <Button
            startIcon={<EditOutlined />}
            onClick={() => navigate(`/products/${productId}/edit`)}
            sx={primaryButtonSx}
          >
            Chỉnh sửa sản phẩm
          </Button>
        </Box>
      </Box>

      {/* PRODUCT OVERVIEW */}
      <Grid container spacing={2.5}>
        {/* IMAGE GALLERY */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Box
            sx={{
              width: '100%',
              aspectRatio: '1 / 1',
              borderRadius: 3.5,
              overflow: 'hidden',
              bgcolor: '#F8FAFC',
              border: `1px solid ${C.border}`,
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
                sx={{ color: C.muted }}
              >
                <PictureOutlined style={{ fontSize: 36 }} />
                <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>
                  Chưa có ảnh sản phẩm
                </Typography>
              </Stack>
            )}
          </Box>

          {/* IMAGE THUMBNAILS */}
          {images.length > 1 && (
            <Grid
              container
              spacing={1.25}
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
                    alt={`Ảnh sản phẩm ${index + 1}`}
                    onClick={() => setSelectedImage(index)}
                    sx={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      objectFit: 'cover',
                      borderRadius: 2.5,
                      cursor: 'pointer',
                      border: '2px solid',
                      borderColor:
                        selectedImage === index
                          ? C.cyan
                          : 'transparent',
                      transition: 'all 0.2s',
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
            sx={{
              fontSize: 12.5,
              color: C.muted,
              mt: 1.5
            }}
          >
            Tổng cộng: <strong>{images.length}</strong> hình ảnh · Ảnh chính được hiển thị đầu tiên
          </Typography>
        </Grid>

        {/* PRODUCT INFORMATION */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ ...cardSx, height: '100%' }}>
            <Box sx={{ p: { xs: 2.5, sm: 3.5 } }}>
              <Box sx={{ mb: 1.5, ...badgeSx('#F0FDFA', '#0F766E', '#99F6E4') }}>
                {product.categoryName || 'Chưa phân loại'}
              </Box>

              <Typography
                sx={{
                  fontSize: { xs: 20, md: 25 },
                  fontWeight: 800,
                  color: '#0F172A'
                }}
              >
                {product.productName}
              </Typography>

              <Typography
                sx={{
                  fontSize: 12.5,
                  color: C.muted,
                  mt: 0.5
                }}
              >
                Mã sản phẩm: #{product.productId}
              </Typography>

              <Typography
                sx={{
                  fontSize: 14,
                  color: '#334155',
                  mt: 2,
                  mb: 3,
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.7
                }}
              >
                {product.description || 'Chưa có thông tin mô tả cho sản phẩm này.'}
              </Typography>

              {/* PRICE INFORMATION */}
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
              >
                <InfoCard
                  label="Khoảng giá bán"
                  value={priceRange}
                  highlight
                />

                <InfoCard
                  label="Tổng số lượng tồn kho"
                  value={`${totalStock} sản phẩm`}
                />
              </Stack>

              {/* SUMMARY */}
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 1.5,
                  mt: 3,
                  pt: 2.5,
                  borderTop: `1px solid ${C.borderLight}`
                }}
              >
                <Typography
                  sx={{
                    fontSize: 13,
                    color: C.muted
                  }}
                >
                  <strong>{variantCount}</strong> biến thể · <strong>{totalStock}</strong> đơn vị trong kho
                </Typography>

                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: onlineEnabled ? '#0D9488' : C.muted
                  }}
                >
                  {onlineVariantCount}/{variantCount} biến thể được kích hoạt bán online
                </Typography>
              </Box>
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
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2
            }}
          >
            <Typography
              sx={{
                fontSize: 16,
                fontWeight: 800,
                color: '#0F172A'
              }}
            >
              Ma trận biến thể &amp; tồn kho
            </Typography>

            <Box sx={badgeSx('#FEF9C3', '#854D0E', '#FDE047')}>
              Tổng tồn: {totalStock} cái
            </Box>
          </Box>

          <Box
            sx={{
              bgcolor: C.surface,
              borderRadius: 3.5,
              border: `1px solid ${C.border}`,
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              overflow: 'hidden'
            }}
          >
            {variantError && (
              <Alert
                severity="error"
                onClose={() => setVariantError('')}
                sx={{ mx: 3, mt: 2, borderRadius: 2.5, fontSize: 13, fontWeight: 600 }}
              >
                {variantError}
              </Alert>
            )}

            <TableContainer>
              <Table
                sx={{
                  minWidth: 600,
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
                    <TableCell>MÃ BIẾN THỂ</TableCell>
                    <TableCell>GIÁ BÁN</TableCell>
                    <TableCell>TỒN KHO</TableCell>
                    <TableCell>VỊ TRÍ KỆ</TableCell>
                    <TableCell align="center">TRẠNG THÁI</TableCell>
                    <TableCell align="center" sx={{ pr: 3 }}>BÁN ONLINE</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {variants.map((variant) => {
                    const stock = Number(variant.stockQuantity ?? 0);
                    const sellable = Number(variant.sellableQuantity ?? stock);
                    // Ngưỡng tối thiểu đặt ở màn hình Tồn kho (null = chưa đặt => không báo "sắp hết")
                    const minStock = variant.minStockQuantity == null ? null : Number(variant.minStockQuantity);
                    const activeVariant = variant.status === 'ACTIVE';
                    const online = Boolean(Number(variant.onlineSalesEnabled));
                    const canEnableOnline = activeVariant && product.status === 'ACTIVE' && variant.price != null;
                    // Vị trí kệ (module Kho): "A1:30,A2:4" -> [{ label: 'A1', quantity: 30 }, ...]
                    const shelves = String(variant.locations || '')
                      .split(',')
                      .filter(Boolean)
                      .map((item) => {
                        const cut = item.lastIndexOf(':');
                        return { label: item.slice(0, cut), quantity: Number(item.slice(cut + 1)) || 0 };
                      });
                    const shelved = shelves.reduce((sum, item) => sum + item.quantity, 0);
                    const unshelved = Math.max(stock - shelved, 0);

                    let availability = 'Còn hàng';
                    let badgeProps = { bg: '#E7F6F1', color: '#168B70' };

                    if (!activeVariant) {
                      availability = 'Đã ẩn';
                      badgeProps = { bg: '#F0F2F4', color: '#75869F' };
                    } else if (stock <= 0) {
                      availability = 'Hết hàng';
                      badgeProps = { bg: '#FEE2E2', color: '#DC2626' };
                    } else if (minStock != null && sellable <= minStock) {
                      availability = 'Sắp hết';
                      badgeProps = { bg: C.cream, color: C.creamText };
                    }

                    return (
                      <TableRow
                        key={variant.detailId}
                        hover
                        sx={{ '&:hover': { bgcolor: '#FAFCFE' } }}
                      >
                        <TableCell sx={{ pl: 3, fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>
                          {variant.size || '—'}
                        </TableCell>

                        <TableCell sx={{ fontSize: 13.5, color: '#334155' }}>
                          {variant.color || '—'}
                        </TableCell>

                        <TableCell
                          sx={{
                            fontSize: 12.5,
                            color: C.muted
                          }}
                        >
                          {variant.code ? (
                            <Box component="span" sx={{ fontFamily: 'monospace', color: C.text, fontWeight: 600 }}>
                              {variant.code}
                            </Box>
                          ) : (
                            'Chưa có mã'
                          )}
                        </TableCell>

                        <TableCell sx={{ fontSize: 13.5, fontWeight: 800, color: '#0F172A' }}>
                          {formatPrice(variant.price)}
                        </TableCell>

                        <TableCell sx={{ fontSize: 13.5, fontWeight: 800, color: stock <= 0 ? '#DC2626' : '#0F172A' }}>
                          {stock}
                          {sellable !== stock && (
                            <Box component="span" sx={{ fontSize: 12, fontWeight: 600, color: C.muted, ml: 0.75 }}>
                              (bán được {sellable})
                            </Box>
                          )}
                          {minStock != null && (
                            <Typography sx={{ fontSize: 11.5, color: C.muted, fontWeight: 500 }}>
                              Ngưỡng tối thiểu: {minStock}
                            </Typography>
                          )}
                        </TableCell>

                        {/* VỊ TRÍ KỆ: kệ + tầng đang chứa hàng (xếp kệ ở module Kho), phần còn lại = chưa xếp kệ */}
                        <TableCell>
                          {shelves.length === 0 && stock <= 0 ? (
                            <Typography sx={{ fontSize: 13, color: '#94A3B8' }}>—</Typography>
                          ) : (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                              {shelves.map((item) => (
                                <Tooltip key={item.label} title={`Kệ ${item.label}: ${item.quantity} cái`}>
                                  <Box
                                    component="span"
                                    sx={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 0.5,
                                      px: 1,
                                      py: 0.25,
                                      borderRadius: 1.5,
                                      fontSize: 12,
                                      fontWeight: 700,
                                      bgcolor: '#F0FCFE',
                                      color: '#0E7490',
                                      border: '1px solid #BAF2F8',
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    {item.label}
                                    <Box component="span" sx={{ fontWeight: 600, color: C.muted }}>
                                      · {item.quantity}
                                    </Box>
                                  </Box>
                                </Tooltip>
                              ))}
                              {unshelved > 0 && (
                                <Typography component="span" sx={{ fontSize: 12, color: '#B45309', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  {shelves.length ? `+${unshelved} chưa xếp kệ` : `Chưa xếp kệ (${unshelved})`}
                                </Typography>
                              )}
                            </Box>
                          )}
                        </TableCell>

                        <TableCell align="center">
                          <Box
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              px: 1.5,
                              py: 0.35,
                              borderRadius: 1.75,
                              fontSize: 12,
                              fontWeight: 700,
                              bgcolor: badgeProps.bg,
                              color: badgeProps.color
                            }}
                          >
                            {availability}
                          </Box>
                        </TableCell>

                        <TableCell align="center" sx={{ pr: 3 }}>
                          <Tooltip
                            title={
                              online
                                ? 'Đang bán trên website · Nhấn để tắt'
                                : canEnableOnline
                                  ? 'Nhấn để bật bán trên website'
                                  : product.status !== 'ACTIVE'
                                    ? 'Sản phẩm đang ẩn'
                                    : !activeVariant
                                      ? 'Biến thể đang ngưng'
                                      : 'Biến thể chưa có giá bán'
                            }
                          >
                            <span>
                              {togglingVariantId === variant.detailId ? (
                                <CircularProgress size={16} sx={{ color: C.cyan }} />
                              ) : (
                                <Switch
                                  checked={online}
                                  size="small"
                                  disabled={Boolean(togglingVariantId) || (!online && !canEnableOnline)}
                                  onChange={() => toggleVariantOnline(variant)}
                                  sx={switchSx}
                                />
                              )}
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {variants.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        align="center"
                        sx={{ py: 5 }}
                      >
                        <Typography
                          sx={{
                            fontSize: 13.5,
                            color: C.muted
                          }}
                        >
                          Chưa có biến thể nào được tạo.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <Box
              sx={{
                px: 3,
                py: 2,
                borderTop: `1px solid ${C.borderLight}`
              }}
            >
              <Typography
                sx={{
                  fontSize: 12.5,
                  color: C.muted
                }}
              >
                Tổng số: <strong>{variants.length}</strong> biến thể · <strong>{totalStock}</strong> đơn vị trong kho
              </Typography>
            </Box>
          </Box>
        </Grid>

        {/* STATUS AND VISIBILITY */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2.5}>
            <Card sx={{ ...cardSx, p: { xs: 2.5, sm: 3.5 } }}>
              <Typography
                sx={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: '#0F172A',
                  mb: 2.5
                }}
              >
                Trạng thái &amp; Hiển thị
              </Typography>

              <Stack spacing={2.5}>
                <Box>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
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

                    <Box
                      sx={
                        activeProduct
                          ? badgeSx('#F0FDF4', '#166534', '#BBF7D0')
                          : badgeSx('#F1F5F9', '#475569', '#E2E8F0')
                      }
                    >
                      {activeProduct ? 'Đang hoạt động' : 'Đã ẩn'}
                    </Box>
                  </Box>

                  <Typography
                    sx={{
                      fontSize: 12.5,
                      color: C.muted,
                      mt: 1,
                      lineHeight: 1.5
                    }}
                  >
                    Sản phẩm hoạt động sẽ xuất hiện trong danh sách bán hàng tại quầy và online.
                  </Typography>
                </Box>

                <Box>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: C.text
                      }}
                    >
                      Mở bán online
                    </Typography>

                    <Box
                      sx={
                        onlineEnabled
                          ? badgeSx('#F0FDF4', '#166534', '#BBF7D0')
                          : badgeSx('#F1F5F9', '#475569', '#E2E8F0')
                      }
                    >
                      {onlineEnabled ? 'Đang bật' : 'Đang tắt'}
                    </Box>
                  </Box>

                  <Typography
                    sx={{
                      fontSize: 12.5,
                      color: C.muted,
                      mt: 1,
                      lineHeight: 1.5
                    }}
                  >
                    {onlineVariantCount} trên tổng số {variantCount} biến thể được bật bán trên website.
                  </Typography>
                </Box>
              </Stack>
            </Card>

            {/* INVENTORY NOTE (PHUOC'S NOTE STYLE) */}
            <Box
              sx={{
                bgcolor: '#FFFDE7',
                border: '1.5px solid #FDE047',
                borderRadius: 3,
                p: 2.5
              }}
            >
              <Stack
                direction="row"
                spacing={1.5}
                alignItems="flex-start"
              >
                <InfoCircleOutlined
                  style={{
                    fontSize: 18,
                    color: '#854D0E',
                    marginTop: 2
                  }}
                />

                <Box>
                  <Typography
                    sx={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: '#854D0E'
                    }}
                  >
                    Đồng bộ tồn kho thời gian thực
                  </Typography>

                  <Typography
                    sx={{
                      fontSize: 12.5,
                      color: '#713F12',
                      mt: 0.5,
                      lineHeight: 1.6
                    }}
                  >
                    Số lượng tồn kho được lấy trực tiếp từ dữ liệu quản lý kho THORS. Để cập nhật tồn kho, vui lòng thực hiện thông qua phiếu nhập/xuất kho.
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
