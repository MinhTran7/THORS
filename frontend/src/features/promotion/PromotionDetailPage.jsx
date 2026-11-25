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
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, PictureOutlined, StopOutlined } from '@ant-design/icons';
import { getPromotionById, getPromotionOrders } from 'services/promotionService';
import { getProducts } from 'services/productService';
import { categoryFullName, getCategories } from 'services/categoryService';
import { useCrumbs } from '../../layouts/crumbs';
import { orderStatusMeta } from 'features/order/constants';
import { ConfirmDialog, NoticeDialog } from './PromotionForm';
import { deleteAction, endEarlyAction } from './promotionActions';
import {
  discountText,
  editBlockedMessage,
  formatDateTime,
  KIND,
  kindOf,
  money,
  priceRange,
  productRows,
  SCHEDULE_LABEL
} from './promotionFormat';

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

const secondaryButtonSx = {
  textTransform: 'none',
  borderRadius: 2.5,
  bgcolor: C.surface,
  border: `1px solid ${C.border}`,
  fontWeight: 700,
  fontSize: 13.5,
  px: 2,
  height: 44,
  '&:hover': { bgcolor: C.bg }
};

const tableSx = {
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
};

// Màu nhãn trạng thái đơn theo tone của features/order/constants
const TONE = {
  success: { bg: '#DCFCE7', color: '#166534' },
  warning: { bg: '#FEF9C3', color: '#854D0E' },
  danger: { bg: '#FEE2E2', color: '#B91C1C' },
  neutral: { bg: '#F1F5F9', color: '#475569' }
};

export default function PromotionDetailPage({ kind = 'PRODUCT' }) {
  const navigate = useNavigate();
  const { promotionId } = useParams();
  const { base, title, name } = KIND[kind];

  useCrumbs([title, `Chi tiết ${name}`]);

  const [promotion, setPromotion] = useState(null);
  const [allProducts, setAllProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [orders, setOrders] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadPromotion = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await getPromotionById(promotionId);
        if (mounted && data?.promotionId && kindOf(data) !== kind) {
          navigate(`${KIND[kindOf(data)].base}/${promotionId}`, { replace: true });
          return;
        }
        if (mounted) setPromotion(data);
      } catch (e) {
        if (mounted) {
          setError(e.message || 'Không thể tải thông tin khuyến mãi.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadPromotion();
    return () => {
      mounted = false;
    };
  }, [promotionId, kind, navigate]);

  // Mã giảm giá online: các đơn đã dùng mã
  useEffect(() => {
    if (kind !== 'ORDER') return undefined;
    let mounted = true;
    getPromotionOrders(promotionId)
      .then((res) => mounted && setOrders(res))
      .catch(() => mounted && setOrders([]));
    return () => {
      mounted = false;
    };
  }, [promotionId, kind]);

  useEffect(() => {
    if (kind !== 'PRODUCT') return undefined;
    let mounted = true;
    const loadProducts = async () => {
      try {
        setProductsLoading(true);
        const [response, categoryResponse] = await Promise.all([getProducts(), getCategories().catch(() => [])]);
        if (mounted) {
          setAllProducts(productRows(response));
          setCategories(productRows(categoryResponse));
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
  }, [kind]);

  if (loading) {
    return (
      <Box sx={{ py: 10, textAlign: 'center' }}>
        <CircularProgress size={38} sx={{ color: C.cyan }} />
        <Typography sx={{ mt: 2, color: C.muted, fontSize: 13.5 }}>Đang tải thông tin chi tiết khuyến mãi...</Typography>
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
            onClick={() => navigate(base)}
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

  const schedule = { code: promotion.schedule, label: SCHEDULE_LABEL[promotion.schedule] || '—' };

  const openEdit = () => {
    if (promotion.canEdit || promotion.canAdjust) navigate(`${base}/${promotion.promotionId}/edit`);
    else setNotice(editBlockedMessage(promotion));
  };

  // Kết thúc sớm: tải lại chi tiết; xóa: về danh sách
  const runConfirm = async () => {
    setWorking(true);
    try {
      await confirm.run();
      if (confirm.deletes) navigate(base, { replace: true });
      else setPromotion(await getPromotionById(promotionId));
      setConfirm(null);
    } catch (err) {
      setConfirm(null);
      setNotice(err.message || 'Không thể thực hiện thao tác.');
    } finally {
      setWorking(false);
    }
  };
  const selectedProductIds = Array.isArray(promotion.productIds) ? promotion.productIds : [];
  const selectedIdSet = new Set(selectedProductIds.map(String));
  const selectedProducts = allProducts.filter((product) => selectedIdSet.has(String(product.productId)));
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
          Chi tiết {name}
        </Typography>

        <Stack direction="row" spacing={1}>
          {promotion.canEndEarly && (
            <Button
              startIcon={<StopOutlined style={{ fontSize: 15 }} />}
              onClick={() => setConfirm(endEarlyAction(promotion))}
              sx={{ ...secondaryButtonSx, color: '#B45309' }}
            >
              Kết thúc sớm
            </Button>
          )}
          {promotion.canDelete && (
            <Button
              startIcon={<DeleteOutlined style={{ fontSize: 15 }} />}
              onClick={() => setConfirm(deleteAction(promotion))}
              sx={{ ...secondaryButtonSx, color: '#DC2626' }}
            >
              Xóa
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<EditOutlined style={{ fontSize: 15 }} />}
            onClick={openEdit}
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
        </Stack>
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
            <Typography sx={{ mt: 1, fontSize: 18, fontWeight: 800, color: C.text }}>{discountText(promotion)}</Typography>
          </Box>

          {/* Cột 3: Thời hạn áp dụng */}
          <Box sx={{ minWidth: 0, flex: { sm: '0 0 auto' } }}>
            <Typography sx={{ fontSize: 12, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Thời hạn áp dụng
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>Từ: {formatDateTime(promotion.startDate)}</Typography>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>Đến: {formatDateTime(promotion.endDate)}</Typography>
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
                  bgcolor: schedule.code === 'ONGOING' ? C.cream : schedule.code === 'UPCOMING' ? '#E0F2FE' : '#F1F5F9',
                  color: schedule.code === 'ONGOING' ? C.creamText : schedule.code === 'UPCOMING' ? '#0369A1' : C.muted
                }}
              >
                {schedule.label}
              </Box>
            </Box>
          </Box>
        </Box>
      </Card>

      {/* ─── CARD 2: ĐIỀU KIỆN ÁP DỤNG (chỉ mã giảm giá online) ─── */}
      {kind === 'ORDER' && (
        <Card sx={cardSx}>
          <Typography sx={{ fontWeight: 800, fontSize: 16, color: C.text, mb: 2.5 }}>Điều kiện áp dụng</Typography>

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
                {promotion.discountType === 'PERCENT' ? 'Theo phần trăm (%)' : 'Số tiền cố định (VNĐ)'}
              </Typography>
            </Box>

            <Box sx={{ minWidth: 0, flex: { sm: '0 0 auto' } }}>
              <Typography sx={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>Đơn hàng tối thiểu</Typography>
              <Typography sx={{ mt: 0.75, fontSize: 15, fontWeight: 700, color: C.text }}>{money(promotion.minOrderValue)}</Typography>
            </Box>

            <Box sx={{ minWidth: 0, flex: { sm: '0 0 auto' } }}>
              <Typography sx={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>Lượt dùng</Typography>
              <Typography sx={{ mt: 0.75, fontSize: 15, fontWeight: 700, color: C.text }}>
                {promotion.usedCount || 0}/{promotion.usageLimit} lượt
              </Typography>
            </Box>
          </Box>
        </Card>
      )}

      {/* ─── CARD: ĐƠN ĐÃ DÙNG MÃ (chỉ mã giảm giá online) ─── */}
      {kind === 'ORDER' && (
        <Card sx={cardSx}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 16, color: C.text }}>Đơn đã dùng mã</Typography>
            {orders?.length > 0 && (
              <Typography sx={{ fontSize: 13, color: C.muted }}>
                {orders.length} đơn · đã giảm {money(orders.reduce((sum, o) => sum + Number(o.discountAmount || 0), 0))}
              </Typography>
            )}
          </Box>

          {orders === null ? (
            <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress size={30} sx={{ color: C.cyan }} />
            </Box>
          ) : orders.length === 0 ? (
            <Typography sx={{ fontSize: 13.5, color: C.muted, py: 2 }}>Chưa có đơn hàng nào dùng mã này.</Typography>
          ) : (
            <TableContainer sx={{ border: `1px solid ${C.borderLight}`, borderRadius: 2.5, overflow: 'hidden' }}>
              <Table sx={tableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ pl: 3 }}>Mã đơn</TableCell>
                    <TableCell>Khách hàng</TableCell>
                    <TableCell>Ngày đặt</TableCell>
                    <TableCell align="right">Tiền hàng</TableCell>
                    <TableCell align="right">Được giảm</TableCell>
                    <TableCell align="right">Tổng tiền</TableCell>
                    <TableCell align="center" sx={{ pr: 3 }}>
                      Trạng thái
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orders.map((order) => {
                    const status = orderStatusMeta(order.orderStatus);
                    const tone = TONE[status.tone] || TONE.neutral;
                    return (
                      <TableRow
                        key={order.orderId}
                        hover
                        onClick={() => navigate(`/orders/${order.orderId}`)}
                        sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#FAFCFE' } }}
                      >
                        <TableCell sx={{ pl: 3, fontWeight: '700 !important' }}>{order.orderNumber}</TableCell>
                        <TableCell>{order.customerName || '—'}</TableCell>
                        <TableCell sx={{ color: `${C.muted} !important` }}>{formatDateTime(order.orderDate)}</TableCell>
                        <TableCell align="right">{money(order.itemsAmount)}</TableCell>
                        <TableCell align="right" sx={{ color: '#B45309 !important', fontWeight: '700 !important' }}>
                          − {money(order.discountAmount)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: '700 !important' }}>
                          {money(order.totalAmount)}
                        </TableCell>
                        <TableCell align="center" sx={{ pr: 3 }}>
                          <Box
                            component="span"
                            sx={{
                              px: 1.25,
                              py: 0.4,
                              borderRadius: 99,
                              fontSize: 12,
                              fontWeight: 700,
                              bgcolor: tone.bg,
                              color: tone.color,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {status.label}
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Card>
      )}

      {/* ─── CARD 3: PHẠM VI ÁP DỤNG ─── */}
      {kind === 'PRODUCT' && (
        <Card sx={cardSx}>
          <Typography sx={{ fontWeight: 800, fontSize: 16, color: C.text, mb: 2 }}>Phạm vi áp dụng</Typography>

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
                  <Table sx={tableSx}>
                    <TableHead>
                      <TableRow>
                        <TableCell align="center" sx={{ width: 64, pl: 3 }}>
                          STT
                        </TableCell>
                        <TableCell sx={{ width: 72 }} />
                        <TableCell>Sản phẩm</TableCell>
                        <TableCell>Danh mục</TableCell>
                        <TableCell align="center" sx={{ width: 120 }}>
                          Tồn kho
                        </TableCell>
                        <TableCell align="right" sx={{ width: 200, pr: 3 }}>
                          Giá bán
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedProducts.map((product, index) => {
                        const id = product.productId;
                        const name = product.productName || 'Sản phẩm chưa có tên';
                        const img = product.primaryImageUrl;
                        const price = priceRange(product);

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
                                  <Box component="img" src={img} alt={name} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <PictureOutlined style={{ fontSize: 18, color: C.subtle }} />
                                )}
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Typography sx={{ fontWeight: 600, color: C.text, fontSize: 14 }}>{name}</Typography>
                              <Typography sx={{ fontSize: 12, color: C.muted }}>{product.sku || '—'}</Typography>
                            </TableCell>
                            <TableCell sx={{ color: `${C.muted} !important` }}>{categoryName(product)}</TableCell>
                            <TableCell align="center" sx={{ color: Number(product.totalStock) > 0 ? undefined : '#EF4444 !important' }}>
                              {Number(product.totalStock || 0).toLocaleString('vi-VN')}
                            </TableCell>
                            <TableCell align="right" sx={{ pr: 3 }}>
                              <Typography sx={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{price}</Typography>
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
              <Typography sx={{ fontWeight: 700, fontSize: 14, color: C.text }}>Toàn bộ sản phẩm trong cửa hàng</Typography>
              <Typography sx={{ mt: 0.5, fontSize: 13, color: C.muted }}>
                Khuyến mãi được tự động áp dụng cho tất cả sản phẩm trong cửa hàng.
              </Typography>
            </Box>
          )}
        </Card>
      )}

      <ConfirmDialog confirm={confirm} working={working} onCancel={() => setConfirm(null)} onConfirm={runConfirm} />
      <NoticeDialog message={notice} onClose={() => setNotice('')} />
    </Box>
  );
}
