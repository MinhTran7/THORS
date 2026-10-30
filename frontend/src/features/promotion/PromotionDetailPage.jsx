import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Box, Button, Card, Chip, CircularProgress, Divider, Grid, Stack, Typography } from '@mui/material';

import { ArrowLeftOutlined, EditOutlined, CalendarOutlined, TagOutlined, ShoppingOutlined, GiftOutlined } from '@ant-design/icons';

import { getPromotionById } from 'services/promotionService';
import { getProducts } from 'services/productService';

const C = {
  bg: '#FBFBF7',
  white: '#FFFFFF',
  cream: '#FFFBE1',
  cyan: '#8EE9F2',
  cyanLight: '#E6F9FB',
  cyanHover: '#72DDE8',
  text: '#1F2937',
  dark: '#0E3A41',
  muted: '#6B7280',
  border: '#E7E8E2'
};

// ==================== HELPERS ====================

const money = (value) => {
  if (value == null || value === '') return '—';

  return `${Number(value).toLocaleString('vi-VN')} ₫`;
};

const dateText = (value) => {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const discountText = (promotion) => {
  const isPercentage = ['PERCENTAGE', 'PERCENT'].includes(promotion.discountType);

  return isPercentage ? `${promotion.discountValue}%` : money(promotion.discountValue);
};

const getScheduleStatus = (promotion) => {
  const now = new Date();
  const start = promotion.startDate ? new Date(promotion.startDate) : null;
  const end = promotion.endDate ? new Date(promotion.endDate) : null;

  if (start && now < start) return 'Sắp diễn ra';
  if (end && now > end) return 'Đã kết thúc';

  return 'Đang diễn ra';
};

const getProductId = (product) => product.productId ?? product.id;

const getProductName = (product) => product.productName || product.name || 'Sản phẩm chưa có tên';

// Chuẩn hóa giá trị ảnh về URL
const normalizeImageUrl = (image) => {
  if (!image) return '';

  if (typeof image === 'string') return image;

  if (typeof image === 'object') {
    return image.imageUrl || image.url || image.image || image.thumbnailUrl || '';
  }

  return '';
};

// Lấy ảnh sản phẩm
const getProductImage = (product) => {
  const images = [
    product.primaryImageUrl,
    product.imageUrl,
    product.thumbnailUrl,
    product.image,
    product.productImages?.[0],
    product.images?.[0]
  ];

  return images.map(normalizeImageUrl).find(Boolean) || '';
};

// Lấy giá sản phẩm
const getProductPrice = (product) => {
  const { minPrice, maxPrice, price } = product;

  if (minPrice != null && maxPrice != null) {
    if (Number(minPrice) === Number(maxPrice)) {
      return money(minPrice);
    }

    return `${money(minPrice)} - ${money(maxPrice)}`;
  }

  return money(minPrice ?? maxPrice ?? price);
};

// Chuẩn hóa danh sách sản phẩm từ API
const getProductRows = (response) => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.content)) return response.content;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.content)) {
    return response.data.content;
  }
  if (Array.isArray(response?.data?.data)) {
    return response.data.data;
  }

  return [];
};

// ==================== COMPONENTS ====================

function InfoItem({ label, value }) {
  return (
    <Stack spacing={0.7}>
      <Typography fontSize={13} color={C.muted}>
        {label}
      </Typography>

      <Typography fontSize={15} fontWeight={600} color={C.text} sx={{ overflowWrap: 'anywhere' }}>
        {value || '—'}
      </Typography>
    </Stack>
  );
}

function SectionCard({ icon, title, children }) {
  return (
    <Card
      elevation={0}
      sx={{
        p: { xs: 2, md: 2.5 },
        height: '100%',
        border: `1px solid ${C.border}`,
        borderRadius: 3,
        bgcolor: C.white
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.2} sx={{ mb: 2.5 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            bgcolor: C.cyanLight,
            color: C.dark,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18
          }}
        >
          {icon}
        </Box>

        <Typography fontSize={16} fontWeight={700} color={C.dark}>
          {title}
        </Typography>
      </Stack>

      {children}
    </Card>
  );
}

// Thẻ sản phẩm: ảnh, tên và giá
function ProductCard({ product }) {
  const [imageError, setImageError] = useState(false);

  const productName = getProductName(product);
  const imageUrl = getProductImage(product);
  const price = getProductPrice(product);

  return (
    <Card
      elevation={0}
      sx={{
        height: '100%',
        border: `1px solid ${C.border}`,
        borderRadius: 2,
        overflow: 'hidden',
        transition: 'all 0.2s ease',
        '&:hover': {
          borderColor: C.cyan,
          bgcolor: C.cyanLight
        }
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
            height: 160,
            objectFit: 'cover',
            display: 'block',
            bgcolor: '#F5F5F5'
          }}
        />
      ) : (
        <Box
          sx={{
            width: '100%',
            height: 160,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: '#F5F5F5',
            color: C.muted
          }}
        >
          <Typography fontSize={13}>Chưa có hình ảnh</Typography>
        </Box>
      )}

      <Box sx={{ p: 2 }}>
        <Typography fontSize={14} fontWeight={700} color={C.text} sx={{ overflowWrap: 'anywhere' }}>
          {productName}
        </Typography>

        <Typography fontSize={14} fontWeight={700} color={C.dark} sx={{ mt: 1 }}>
          {price}
        </Typography>
      </Box>
    </Card>
  );
}

// ==================== MAIN PAGE ====================

export default function PromotionDetailPage() {
  const navigate = useNavigate();
  const { promotionId } = useParams();

  const [promotion, setPromotion] = useState(null);
  const [allProducts, setAllProducts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [error, setError] = useState('');

  // Tải chi tiết khuyến mãi
  useEffect(() => {
    let mounted = true;

    const loadPromotion = async () => {
      try {
        setLoading(true);
        setError('');

        const data = await getPromotionById(promotionId);

        if (mounted) {
          setPromotion(data);
        }
      } catch (e) {
        if (mounted) {
          setError(e?.response?.data?.message || e?.message || 'Không thể tải thông tin khuyến mãi.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadPromotion();

    return () => {
      mounted = false;
    };
  }, [promotionId]);

  // Tải danh sách sản phẩm
  useEffect(() => {
    let mounted = true;

    const loadProducts = async () => {
      try {
        setProductsLoading(true);

        const response = await getProducts();
        const products = getProductRows(response);

        if (mounted) {
          setAllProducts(products);
        }
      } catch (e) {
        console.error('Không thể tải danh sách sản phẩm:', e);
      } finally {
        if (mounted) {
          setProductsLoading(false);
        }
      }
    };

    loadProducts();

    return () => {
      mounted = false;
    };
  }, []);

  // Trạng thái tải
  if (loading) {
    return (
      <Box
        sx={{
          minHeight: 400,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: C.bg
        }}
      >
        <CircularProgress sx={{ color: C.cyan }} />
      </Box>
    );
  }

  // Trạng thái lỗi
  if (error || !promotion) {
    return (
      <Box sx={{ p: 3, bgcolor: C.bg, minHeight: '100%' }}>
        <Button startIcon={<ArrowLeftOutlined />} onClick={() => navigate('/promotions')} sx={{ color: C.dark, textTransform: 'none' }}>
          Quay lại danh sách
        </Button>

        <Card
          elevation={0}
          sx={{
            mt: 3,
            p: 4,
            border: `1px solid ${C.border}`,
            borderRadius: 3
          }}
        >
          <Typography color="error">{error || 'Không tìm thấy chương trình khuyến mãi.'}</Typography>
        </Card>
      </Box>
    );
  }

  // Dữ liệu khuyến mãi
  const isActive = promotion.status === 'ACTIVE';
  const scheduleStatus = getScheduleStatus(promotion);

  const selectedProductIds = Array.isArray(promotion.productIds) ? promotion.productIds : [];

  const selectedIdSet = new Set(selectedProductIds.map(String));

  const selectedProducts = allProducts.filter((product) => selectedIdSet.has(String(getProductId(product))));

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 1400,
        mx: 'auto',
        px: { xs: 1.5, md: 3 },
        py: 2,
        bgcolor: C.bg,
        minHeight: '100%',
        boxSizing: 'border-box'
      }}
    >
      {/* Header */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Button
            startIcon={<ArrowLeftOutlined />}
            onClick={() => navigate('/promotions')}
            sx={{
              color: C.muted,
              textTransform: 'none',
              px: 0,
              mb: 1,
              '&:hover': {
                bgcolor: 'transparent',
                color: C.dark
              }
            }}
          >
            Quay lại danh sách
          </Button>

          <Typography
            sx={{
              fontSize: { xs: 23, md: 27 },
              fontWeight: 700,
              color: C.text
            }}
          >
            Chi tiết khuyến mãi
          </Typography>

          <Typography fontSize={13} color={C.muted} sx={{ mt: 0.5 }}>
            Xem thông tin và điều kiện của chương trình khuyến mãi.
          </Typography>
        </Box>

        <Button
          variant="contained"
          startIcon={<EditOutlined />}
          onClick={() => navigate(`/promotions/edit/${promotion.promotionId}`)}
          sx={{
            alignSelf: { xs: 'flex-start', sm: 'center' },
            bgcolor: C.cyan,
            color: C.dark,
            borderRadius: 2,
            px: 2.5,
            py: 1,
            fontWeight: 600,
            textTransform: 'none',
            boxShadow: 'none',
            '&:hover': {
              bgcolor: C.cyanHover,
              boxShadow: 'none'
            }
          }}
        >
          Chỉnh sửa
        </Button>
      </Stack>

      {/* Promotion overview */}
      <Card
        elevation={0}
        sx={{
          mb: 2.5,
          overflow: 'hidden',
          border: `1px solid ${C.border}`,
          borderRadius: 3,
          bgcolor: C.white
        }}
      >
        <Box
          sx={{
            px: { xs: 2.5, md: 3.5 },
            py: 3,
            bgcolor: C.cream,
            borderBottom: `1px solid ${C.border}`
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
            <GiftOutlined style={{ fontSize: 20, color: C.dark }} />

            <Typography fontSize={12} fontWeight={700} letterSpacing={1} color={C.dark}>
              PROMOTION OVERVIEW
            </Typography>
          </Stack>

          <Typography
            sx={{
              fontSize: { xs: 22, md: 28 },
              fontWeight: 700,
              color: C.text,
              overflowWrap: 'anywhere'
            }}
          >
            {promotion.name}
          </Typography>

          <Typography fontSize={14} color={C.muted} sx={{ mt: 1, maxWidth: 800 }}>
            {promotion.description || 'Chưa có mô tả cho chương trình này.'}
          </Typography>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
            <Chip
              label={isActive ? 'Đang bật' : 'Đang tắt'}
              size="small"
              sx={{
                bgcolor: isActive ? C.cyanLight : '#F3F4F6',
                color: isActive ? C.dark : C.muted,
                fontWeight: 600
              }}
            />

            <Chip
              label={scheduleStatus}
              size="small"
              sx={{
                bgcolor: C.white,
                color: C.dark,
                border: `1px solid ${C.border}`,
                fontWeight: 600
              }}
            />
          </Stack>
        </Box>

        <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={4}>
              <Typography fontSize={13} color={C.muted}>
                Mức giảm giá
              </Typography>

              <Typography
                sx={{
                  mt: 0.5,
                  fontSize: 30,
                  fontWeight: 700,
                  color: C.dark
                }}
              >
                {discountText(promotion)}
              </Typography>
            </Grid>

            <Grid item xs={12} sm={4}>
              <Typography fontSize={13} color={C.muted}>
                Đơn hàng tối thiểu
              </Typography>

              <Typography
                sx={{
                  mt: 0.5,
                  fontSize: 21,
                  fontWeight: 700,
                  color: C.text
                }}
              >
                {money(promotion.minOrderValue)}
              </Typography>
            </Grid>

            <Grid item xs={12} sm={4}>
              <Typography fontSize={13} color={C.muted}>
                Mức giảm tối đa
              </Typography>

              <Typography
                sx={{
                  mt: 0.5,
                  fontSize: 21,
                  fontWeight: 700,
                  color: C.text
                }}
              >
                {promotion.maxDiscountAmount == null ? 'Không giới hạn' : money(promotion.maxDiscountAmount)}
              </Typography>
            </Grid>
          </Grid>
        </Box>
      </Card>

      {/* Detail sections */}
      <Grid container spacing={2.5}>
        <Grid item xs={12} md={6}>
          <SectionCard icon={<CalendarOutlined />} title="Thời gian áp dụng">
            <Stack spacing={2.5}>
              <InfoItem label="Ngày bắt đầu" value={dateText(promotion.startDate)} />

              <Divider sx={{ borderColor: C.border }} />

              <InfoItem label="Ngày kết thúc" value={dateText(promotion.endDate)} />
            </Stack>
          </SectionCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <SectionCard icon={<TagOutlined />} title="Điều kiện khuyến mãi">
            <Stack spacing={2.5}>
              <InfoItem
                label="Loại giảm giá"
                value={['PERCENTAGE', 'PERCENT'].includes(promotion.discountType) ? 'Theo phần trăm (%)' : 'Số tiền cố định (VND)'}
              />

              <Divider sx={{ borderColor: C.border }} />

              <InfoItem
                label="Lượt sử dụng tối đa"
                value={promotion.usageLimit == null ? 'Không giới hạn' : Number(promotion.usageLimit).toLocaleString('vi-VN')}
              />
            </Stack>
          </SectionCard>
        </Grid>

        {/* Promotion scope */}
        <Grid item xs={12}>
          <SectionCard icon={<ShoppingOutlined />} title="Phạm vi áp dụng">
            {promotion.applyScope === 'SELECTED' ? (
              <Stack spacing={2}>
                <Box>
                  <Typography fontSize={15} fontWeight={700} color={C.text}>
                    Chỉ áp dụng cho sản phẩm được chọn
                  </Typography>

                  <Typography fontSize={13} color={C.muted} sx={{ mt: 0.5 }}>
                    Khuyến mãi chỉ áp dụng cho các sản phẩm nằm trong danh sách dưới đây.
                  </Typography>
                </Box>

                <Divider sx={{ borderColor: C.border }} />

                <Typography fontSize={13} fontWeight={600} color={C.dark}>
                  {selectedProductIds.length} sản phẩm được áp dụng
                </Typography>

                {productsLoading ? (
                  <Box
                    sx={{
                      py: 4,
                      display: 'flex',
                      justifyContent: 'center'
                    }}
                  >
                    <CircularProgress size={28} sx={{ color: C.cyan }} />
                  </Box>
                ) : selectedProductIds.length === 0 ? (
                  <Typography fontSize={13} color="error">
                    Khuyến mãi chưa có sản phẩm được liên kết.
                  </Typography>
                ) : selectedProducts.length === 0 ? (
                  <Typography fontSize={13} color={C.muted}>
                    Không tìm thấy thông tin sản phẩm. Vui lòng kiểm tra dữ liệu trả về từ API.
                  </Typography>
                ) : (
                  <Grid container spacing={2}>
                    {selectedProducts.map((product) => (
                      <Grid item xs={12} sm={6} md={4} key={getProductId(product)}>
                        <ProductCard product={product} />
                      </Grid>
                    ))}
                  </Grid>
                )}
              </Stack>
            ) : (
              <Stack spacing={1}>
                <Typography fontSize={15} fontWeight={600} color={C.text}>
                  Toàn bộ sản phẩm trong cửa hàng
                </Typography>

                <Typography fontSize={13} color={C.muted}>
                  Chương trình khuyến mãi được áp dụng trên toàn bộ sản phẩm đáp ứng điều kiện của chương trình.
                </Typography>
              </Stack>
            )}
          </SectionCard>
        </Grid>
      </Grid>

      {/* Footer */}
      <Stack direction="row" justifyContent="flex-end" sx={{ mt: 3, pb: 2 }}>
        <Button
          startIcon={<ArrowLeftOutlined />}
          onClick={() => navigate('/promotions')}
          sx={{
            color: C.dark,
            textTransform: 'none',
            fontWeight: 600,
            '&:hover': {
              bgcolor: C.cyanLight
            }
          }}
        >
          Quay lại danh sách
        </Button>
      </Stack>
    </Box>
  );
}
