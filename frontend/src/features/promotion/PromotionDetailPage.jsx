import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CircularProgress,
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
  PictureOutlined
} from '@ant-design/icons';
import { getPromotionById } from 'services/promotionService';
import { getProducts } from 'services/productService';
import { categoryFullName, getCategories } from 'services/categoryService';
import { useCrumbs } from '../../layouts/crumbs';

const C = {
  text: '#1E293B',
  muted: '#64748B',
  subtle: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  cyan: '#8EECF5',
  cyanHover: '#76E5EF',
  cyanText: '#0E7490',
  cream: '#FFF7AE',
  creamHover: '#FFF294',
  creamText: '#713F12'
};

const cardSx = {
  bgcolor: C.surface,
  borderRadius: 3.5,
  border: `1px solid ${C.border}`,
  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
  p: { xs: 2.5, sm: 3 },
  mb: 2.5
};

const money = (value) => {
  if (value == null || value === '') return '—';
  return `${Number(value).toLocaleString('vi-VN')} đ`;
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
  const isPercentage = promotion.discountType === 'PERCENT';
  return isPercentage ? `${promotion.discountValue}%` : money(promotion.discountValue);
};

const getScheduleStatus = (promotion) => {
  const now = new Date();
  const start = promotion.startDate ? new Date(promotion.startDate) : null;
  const end = promotion.endDate ? new Date(promotion.endDate) : null;
  if (start && now < start) return { label: 'Sắp diễn ra', code: 'UPCOMING' };
  if (end && now > end) return { label: 'Đã kết thúc', code: 'ENDED' };
  return { label: 'Đang diễn ra', code: 'ONGOING' };
};

const getProductId = (product) => product.productId ?? product.id;
const getProductName = (product) => product.productName || product.name || 'Sản phẩm chưa có tên';

const normalizeImageUrl = (image) => {
  if (!image) return '';
  if (typeof image === 'string') return image;
  if (typeof image === 'object') {
    return image.imageUrl || image.url || image.image || image.thumbnailUrl || '';
  }
  return '';
};

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

const getProductPrice = (product) => {
  const { minPrice, maxPrice, price } = product;
  if (minPrice != null && maxPrice != null) {
    if (Number(minPrice) === Number(maxPrice)) return money(minPrice);
    return `${money(minPrice)} - ${money(maxPrice)}`;
  }
  return money(minPrice ?? maxPrice ?? price);
};

const getProductRows = (response) => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.content)) return response.content;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.content)) return response.data.content;
  if (Array.isArray(response?.data?.data)) return response.data.data;
  return [];
};

export default function PromotionDetailPage() {
  const navigate = useNavigate();
  const { promotionId } = useParams();

  useCrumbs(['Danh sách khuyến mãi', 'Chi tiết khuyến mãi']);

  const [promotion, setPromotion] = useState(null);
  const [allProducts, setAllProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const loadPromotion = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await getPromotionById(promotionId);
        if (mounted) setPromotion(data);
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

  useEffect(() => {
    let mounted = true;
    const loadProducts = async () => {
      try {
        setProductsLoading(true);
        const [response, categoryResponse] = await Promise.all([getProducts(), getCategories().catch(() => [])]);
        if (mounted) {
          setAllProducts(getProductRows(response));
          setCategories(getProductRows(categoryResponse));
        }
      } catch (e) {
        console.error('Không thể tải danh sách sản phẩm:', e);
      } finally {
        if (mounted) setProductsLoading(false);
      }
    };
    loadProducts();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <Box sx={{ py: 10, textAlign: 'center' }}>
        <CircularProgress size={38} sx={{ color: C.cyan }} />
        <Typography sx={{ mt: 2, color: C.muted, fontSize: 13.5 }}>
          Đang tải thông tin chi tiết khuyến mãi...
        </Typography>
      </Box>
    );
  }

  if (error || !promotion) {
    return (
      <Box sx={{ py: 8 }}>
        <Card sx={{ p: 4, textAlign: 'center', borderRadius: 3.5, border: `1px solid ${C.border}` }}>
          <Typography color="error" sx={{ fontWeight: 700, fontSize: 15 }}>
            {error || 'Không tìm thấy chương trình khuyến mãi.'}
          </Typography>
          <Button
            startIcon={<ArrowLeftOutlined />}
            onClick={() => navigate('/promotions')}
            sx={{
              mt: 2,
              textTransform: 'none',
              bgcolor: C.cyan,
              color: C.text,
              fontWeight: 700,
              borderRadius: 2.5,
              px: 2.5,
              '&:hover': { bgcolor: C.cyanHover }
            }}
          >
            Quay lại danh sách
          </Button>
        </Card>
      </Box>
    );
  }

  const schedule = getScheduleStatus(promotion);
  const selectedProductIds = Array.isArray(promotion.productIds) ? promotion.productIds : [];
  const selectedIdSet = new Set(selectedProductIds.map(String));
  const selectedProducts = allProducts.filter((product) => selectedIdSet.has(String(getProductId(product))));
  const categoryName = (product) => {
    const found = categories.find((c) => String(c.categoryId) === String(product.categoryId));
    return found ? categoryFullName(found) : product.categoryName || 'Chưa phân loại';
  };

  return (
    <Box sx={{ color: C.text, pb: 6 }}>
      {/* ─── TIÊU ĐỀ & NÚT CHỈNH SỬA SANG BÊN PHẢI ─── */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2
        }}
      >
        <Typography variant="h3" sx={{ fontWeight: 800, color: C.text, fontSize: { xs: 22, sm: 28 } }}>
          Chi tiết khuyến mãi
        </Typography>

        <Button
          variant="contained"
          startIcon={<EditOutlined style={{ fontSize: 15 }} />}
          onClick={() => navigate(`/promotions/${promotion.promotionId}/edit`)}
          sx={{
            textTransform: 'none',
            borderRadius: 2.5,
            bgcolor: C.cyan,
            color: C.text,
            fontWeight: 700,
            fontSize: 13.5,
            px: 2.5,
            height: 44,
            boxShadow: 'none',
            '&:hover': {
              bgcolor: C.cyanHover,
              boxShadow: 'none'
            }
          }}
        >
          Chỉnh sửa
        </Button>
      </Box>

      {/* ─── CARD 1: TỔNG QUAN CHƯƠNG TRÌNH (DÀN ĐỀU 4 CỘT) ─── */}
      <Card sx={cardSx}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 3,
            width: '100%'
          }}
        >
          {/* Cột 1: Tên chương trình - Nổi bật trong badge vàng nhạt */}
          <Box sx={{ minWidth: 0, flex: { sm: '0 0 auto' } }}>
            <Typography sx={{ fontSize: 12, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Tên chương trình
            </Typography>
            <Box sx={{ mt: 1 }}>
              <Box
                sx={{
                  display: 'inline-block',
                  px: 2,
                  py: 0.6,
                  borderRadius: 2.5,
                  fontWeight: 800,
                  fontSize: 15,
                  bgcolor: C.cream,
                  color: C.creamText,
                  whiteSpace: 'nowrap'
                }}
              >
                {promotion.name}
              </Box>
            </Box>
            {promotion.description && (
              <Typography sx={{ mt: 0.75, fontSize: 13, color: C.muted, lineHeight: 1.5, maxWidth: 360 }}>
                {promotion.description}
              </Typography>
            )}
          </Box>

          {/* Cột 2: Mức giảm - Hiển thị bình thường */}
          <Box sx={{ minWidth: 0, flex: { sm: '0 0 auto' } }}>
            <Typography sx={{ fontSize: 12, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Mức giảm giá
            </Typography>
            <Typography sx={{ mt: 1, fontSize: 18, fontWeight: 800, color: C.text }}>
              {discountText(promotion)}
            </Typography>
          </Box>

          {/* Cột 3: Thời hạn áp dụng */}
          <Box sx={{ minWidth: 0, flex: { sm: '0 0 auto' } }}>
            <Typography sx={{ fontSize: 12, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Thời hạn áp dụng
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>
                Từ: {dateText(promotion.startDate)}
              </Typography>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>
                Đến: {dateText(promotion.endDate)}
              </Typography>
            </Stack>
          </Box>

          {/* Cột 4: Trạng thái (Chỉ hiển thị trạng thái thời gian, đã bỏ bật/tắt) */}
          <Box sx={{ minWidth: 0, flex: { sm: '0 0 auto' } }}>
            <Typography sx={{ fontSize: 12, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Trạng thái
            </Typography>
            <Box sx={{ mt: 1 }}>
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  px: 1.5,
                  py: 0.4,
                  borderRadius: 1.75,
                  fontSize: 13,
                  fontWeight: 600,
                  bgcolor:
                    schedule.code === 'ONGOING'
                      ? C.cream
                      : schedule.code === 'UPCOMING'
                      ? '#E0F2FE'
                      : '#F1F5F9',
                  color:
                    schedule.code === 'ONGOING'
                      ? C.creamText
                      : schedule.code === 'UPCOMING'
                      ? '#0369A1'
                      : C.muted
                }}
              >
                {schedule.label}
              </Box>
            </Box>
          </Box>
        </Box>
      </Card>

      {/* ─── CARD 2: ĐIỀU KIỆN ÁP DỤNG ─── */}
      <Card sx={cardSx}>
        <Typography sx={{ fontWeight: 800, fontSize: 16, color: C.text, mb: 2.5 }}>
          Điều kiện áp dụng
        </Typography>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 6,
            width: '100%'
          }}
        >
          <Box sx={{ minWidth: 0, flex: { sm: '0 0 auto' } }}>
            <Typography sx={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>Loại giảm giá</Typography>
            <Typography sx={{ mt: 0.75, fontSize: 15, fontWeight: 700, color: C.text }}>
              {promotion.discountType === 'PERCENT'
                ? 'Theo phần trăm (%)'
                : 'Số tiền cố định (VNĐ)'}
            </Typography>
          </Box>

          <Box sx={{ minWidth: 0, flex: { sm: '0 0 auto' } }}>
            <Typography sx={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>Đơn hàng tối thiểu</Typography>
            <Typography sx={{ mt: 0.75, fontSize: 15, fontWeight: 700, color: C.text }}>
              {Number(promotion.minOrderValue) > 0 ? money(promotion.minOrderValue) : 'Không yêu cầu'}
            </Typography>
          </Box>

          {Number(promotion.minOrderValue) > 0 && (
            <Box sx={{ minWidth: 0, flex: { sm: '0 0 auto' } }}>
              <Typography sx={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>Lượt dùng</Typography>
              <Typography sx={{ mt: 0.75, fontSize: 15, fontWeight: 700, color: C.text }}>
                {promotion.usageLimit ? `${promotion.usedCount || 0}/${promotion.usageLimit} lượt` : `${promotion.usedCount || 0} lượt (chưa đặt giới hạn)`}
              </Typography>
            </Box>
          )}
        </Box>
      </Card>


      {/* ─── CARD 3: PHẠM VI ÁP DỤNG ─── */}
      <Card sx={cardSx}>
        <Typography sx={{ fontWeight: 800, fontSize: 16, color: C.text, mb: 2 }}>
          Phạm vi áp dụng
        </Typography>

        {promotion.applyScope === 'SELECTED' ? (
          <Box>
            <Typography sx={{ fontSize: 13.5, color: C.muted, mb: 2 }}>
              Khuyến mãi chỉ áp dụng cho {selectedProductIds.length} sản phẩm được chọn dưới đây:
            </Typography>

            {productsLoading ? (
              <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={30} sx={{ color: C.cyan }} />
              </Box>
            ) : selectedProducts.length === 0 ? (
              <Typography sx={{ fontSize: 13.5, color: C.muted, py: 2 }}>
                {selectedProductIds.length === 0
                  ? 'Chưa có sản phẩm nào được liên kết với chương trình.'
                  : 'Không tìm thấy thông tin sản phẩm trong kho dữ liệu.'}
              </Typography>
            ) : (
              <TableContainer sx={{ border: `1px solid ${C.borderLight}`, borderRadius: 2.5, overflow: 'hidden' }}>
                <Table
                  sx={{
                    '& th': {
                      bgcolor: '#F8FAFC',
                      color: C.subtle,
                      fontSize: 11.5,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: 0.4,
                      py: 1.5,
                      borderBottom: `1px solid ${C.borderLight}`
                    },
                    '& td': {
                      borderColor: C.borderLight,
                      py: 1.75,
                      fontSize: 13.5,
                      color: C.text
                    }
                  }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell align="center" sx={{ width: 64, pl: 3 }}>STT</TableCell>
                      <TableCell sx={{ width: 72 }} />
                      <TableCell>Sản phẩm</TableCell>
                      <TableCell>Danh mục</TableCell>
                      <TableCell align="center" sx={{ width: 120 }}>Tồn kho</TableCell>
                      <TableCell align="right" sx={{ width: 200, pr: 3 }}>Giá bán</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedProducts.map((product, index) => {
                      const id = getProductId(product);
                      const name = getProductName(product);
                      const img = getProductImage(product);
                      const price = getProductPrice(product);

                      return (
                        <TableRow key={id} hover sx={{ '&:hover': { bgcolor: '#FAFCFE' } }}>
                          <TableCell align="center" sx={{ pl: 3, color: `${C.muted} !important` }}>
                            {index + 1}
                          </TableCell>
                          <TableCell>
                            <Box
                              sx={{
                                width: 48,
                                height: 48,
                                borderRadius: 2,
                                border: `1px solid ${C.borderLight}`,
                                bgcolor: '#F8FAFC',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden'
                              }}
                            >
                              {img ? (
                                <Box
                                  component="img"
                                  src={img}
                                  alt={name}
                                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <PictureOutlined style={{ fontSize: 18, color: C.subtle }} />
                              )}
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontWeight: 600, color: C.text, fontSize: 14 }}>
                              {name}
                            </Typography>
                            <Typography sx={{ fontSize: 12, color: C.muted }}>{product.sku || '—'}</Typography>
                          </TableCell>
                          <TableCell sx={{ color: `${C.muted} !important` }}>{categoryName(product)}</TableCell>
                          <TableCell align="center" sx={{ color: Number(product.totalStock) > 0 ? undefined : '#EF4444 !important' }}>
                            {Number(product.totalStock || 0).toLocaleString('vi-VN')}
                          </TableCell>
                          <TableCell align="right" sx={{ pr: 3 }}>
                            <Typography sx={{ fontWeight: 700, color: C.text, fontSize: 14 }}>
                              {price}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        ) : (
          <Box
            sx={{
              p: 2.5,
              borderRadius: 2.5,
              bgcolor: '#F8FAFC',
              border: `1px solid ${C.borderLight}`
            }}
          >
            <Typography sx={{ fontWeight: 700, fontSize: 14, color: C.text }}>
              Toàn bộ sản phẩm trong cửa hàng
            </Typography>
            <Typography sx={{ mt: 0.5, fontSize: 13, color: C.muted }}>
              Chương trình khuyến mãi được tự động áp dụng cho tất cả các sản phẩm khi đơn hàng đạt đủ điều kiện.
            </Typography>
          </Box>
        )}
      </Card>
    </Box>
  );
}
