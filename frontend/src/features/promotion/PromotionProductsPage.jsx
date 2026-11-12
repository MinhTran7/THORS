import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  CircularProgress,
  IconButton,
  Button,
  Badge,
  Dialog,
  Snackbar,
  Alert
} from '@mui/material';
import {
  SearchOutlined,
  ShoppingCartOutlined,
  CheckCircleFilled,
  TagOutlined,
  CloseOutlined,
  CheckOutlined,
  MinusOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { api, post } from 'services/http';
import { StoreCrumb } from 'features/account/components/StoreAccount';

const GREEN = '#A5DE3D';
const CYAN = '#8EECF5';
const CYAN_HOVER = '#A2F2FA';
const CYAN_INK = '#0E3A41';
const PRICE_RED = '#DC2626';
const INK = '#1F2937';
const MUTED = '#6B7280';
const PAGE_SIZE = 40;

const money = (val) => `${(Number(val) || 0).toLocaleString('vi-VN')}₫`;

const priceRange = (min, max) => {
  const minNum = Number(min || 0);
  const maxNum = Number(max || 0);
  if (!maxNum || minNum === maxNum) {
    return money(minNum);
  }
  return `${money(minNum)} - ${money(maxNum)}`;
};

const pad = (n) => String(n).padStart(2, '0');

const formatDate = (val) => {
  const d = new Date(val);
  return val && !Number.isNaN(d.getTime()) ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '—';
};

const formatDateTime = (val) => {
  const d = new Date(val);
  return val && !Number.isNaN(d.getTime()) ? `${pad(d.getHours())}:${pad(d.getMinutes())} ${formatDate(val)}` : '—';
};

const formatShortMoney = (val) => {
  const num = Number(val) || 0;
  if (num >= 1000000) {
    const tr = num / 1000000;
    return `${Number.isInteger(tr) ? tr : tr.toFixed(1).replace('.', ',')}tr₫`;
  }
  if (num >= 1000) {
    return `${Math.round(num / 1000)}k₫`;
  }
  return `${num}₫`;
};

const discountParts = (p) => {
  if (!p) return [0, '%'];
  const v = Number(p.discountValue) || 0;
  if (['PERCENT', 'PERCENTAGE'].includes(p.discountType)) return [v, '%'];
  return v >= 1000 ? [Math.round(v / 1000), 'K'] : [v, 'đ'];
};

const getItemProductId = (item) => {
  if (!item) return null;
  const val = item.productId ?? item.product_id ?? item.productid ?? item.id;
  const num = Number(val);
  return !Number.isNaN(num) && num > 0 ? num : null;
};

export default function PromotionProductsPage() {
  const { promotionId } = useParams();
  const navigate = useNavigate();

  const [promotion, setPromotion] = useState(() => {
    try {
      const raw = sessionStorage.getItem('thors:applied_voucher');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (String(parsed.promotionId) === String(promotionId)) {
          return parsed;
        }
      }
    } catch {}
    return null;
  });
  const [products, setProducts] = useState([]);
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [conditionOpen, setConditionOpen] = useState(false);

  const [variantDialogOpen, setVariantDialogOpen] = useState(false);
  const [variantProduct, setVariantProduct] = useState(null);
  const [variants, setVariants] = useState([]);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [variantQuantity, setVariantQuantity] = useState(1);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const fetchProducts = useCallback(
    (kw) => {
      setLoading(true);
      const queryParam = kw ? `&q=${encodeURIComponent(kw.trim())}` : '';
      api(`/shop/products?promotionId=${promotionId}&size=${PAGE_SIZE}${queryParam}`)
        .then((res) => {
          setProducts(res?.items || []);
        })
        .catch(() => {
          setProducts([]);
        })
        .finally(() => setLoading(false));
    },
    [promotionId]
  );

  const refreshCart = useCallback(() => {
    api('/cart')
      .then((res) => {
        setCartItems(res?.items || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshCart();
    window.addEventListener('thors:cart-changed', refreshCart);
    return () => window.removeEventListener('thors:cart-changed', refreshCart);
  }, [refreshCart]);

  useEffect(() => {
    let active = true;
    api(`/promotions/${promotionId}`)
      .then((promoRes) => {
        if (!active) return;
        if (promoRes) {
          setPromotion(promoRes);
          try {
            sessionStorage.setItem('thors:applied_voucher', JSON.stringify(promoRes));
          } catch {}
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [promotionId]);

  useEffect(() => {
    fetchProducts(search);
  }, [fetchProducts, search]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
  };

  const isAllScope = !promotion?.applyScope || promotion?.applyScope === 'ALL';

  const allowedProductIds = useMemo(() => {
    const ids = new Set((promotion?.productIds || []).map(Number));
    products.forEach((p) => {
      const pid = getItemProductId(p);
      if (pid) ids.add(pid);
    });
    return ids;
  }, [promotion, products]);

  const eligibleCartItems = useMemo(() => {
    if (!promotion) return [];
    return cartItems.filter((item) => {
      const pid = getItemProductId(item);
      return pid && (isAllScope || allowedProductIds.has(pid));
    });
  }, [promotion, cartItems, isAllScope, allowedProductIds]);

  const eligibleCartTotal = useMemo(() => {
    return eligibleCartItems.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
      0
    );
  }, [eligibleCartItems]);

  const eligibleCartCount = useMemo(() => {
    const uniqueProductIds = new Set(
      eligibleCartItems.map((item) => getItemProductId(item)).filter(Boolean)
    );
    return uniqueProductIds.size;
  }, [eligibleCartItems]);

  const minOrder = Number(promotion?.minOrderValue || 0);
  const isEligible = minOrder > 0 ? eligibleCartTotal >= minOrder : eligibleCartCount > 0;
  const progressPercent = minOrder > 0 ? Math.min(100, Math.round((eligibleCartTotal / minOrder) * 100)) : 100;
  const diffToMeet = Math.max(0, minOrder - eligibleCartTotal);

  const handleGoToCart = () => {
    if (promotion) {
      try {
        sessionStorage.setItem('thors:applied_voucher', JSON.stringify(promotion));
      } catch {}
    }
    navigate('/cart');
  };

  const isPercent = ['PERCENT', 'PERCENTAGE'].includes(promotion?.discountType);
  const discountVal = Number(promotion?.discountValue || 0);
  const discountText = isPercent
    ? `${discountVal}%`
    : discountVal >= 1000
    ? `${Math.round(discountVal / 1000)}k₫`
    : `${discountVal}₫`;

  const openVariantDialog = async (item) => {
    setVariantProduct(item);
    setVariantDialogOpen(true);
    setLoadingVariants(true);
    setSelectedSize('');
    setSelectedColor('');
    setVariantQuantity(1);
    try {
      const res = await api(`/shop/products/${item.productId}`);
      const vars = res?.variants || [];
      setVariants(vars);
      const inStock = vars.find((v) => Number(v.stock) > 0) || vars[0];
      if (inStock) {
        setSelectedSize(inStock.size || '');
        setSelectedColor(inStock.color || '');
      }
    } catch {
      setVariants([]);
    } finally {
      setLoadingVariants(false);
    }
  };

  const sizes = useMemo(() => {
    return [...new Set(variants.map((v) => v.size).filter(Boolean))];
  }, [variants]);

  const colors = useMemo(() => {
    return [...new Set(variants.map((v) => v.color).filter(Boolean))];
  }, [variants]);

  const selectedVariant = useMemo(() => {
    return variants.find(
      (v) => (!v.size || v.size === selectedSize) && (!v.color || v.color === selectedColor)
    );
  }, [variants, selectedSize, selectedColor]);

  const variantStock = Number(selectedVariant?.stock || 0);

  const handleAddToCart = async () => {
    if (!selectedVariant || variantStock <= 0) return;
    setAddingToCart(true);
    try {
      await post('/cart/items', { detailId: selectedVariant.detailId, quantity: variantQuantity });
      window.dispatchEvent(new Event('thors:cart-changed'));
      const cartRes = await api('/cart').catch(() => ({ items: [] }));
      setCartItems(cartRes?.items || []);
      setVariantDialogOpen(false);
      setSnackbarMessage('Đã thêm sản phẩm vào giỏ hàng thành công!');
    } catch (err) {
      if (err.status === 401) {
        navigate('/login?redirect=' + encodeURIComponent(window.location.pathname));
      } else {
        setSnackbarMessage(err.message || 'Không thể thêm vào giỏ hàng');
      }
    } finally {
      setAddingToCart(false);
    }
  };

  const conditionRows = useMemo(() => {
    if (!promotion) return [];
    return [
      ['Đơn tối thiểu', Number(promotion.minOrderValue) > 0 ? money(promotion.minOrderValue) : 'Không yêu cầu'],
      isPercent && promotion.maxDiscountAmount ? ['Giảm tối đa', money(promotion.maxDiscountAmount)] : null,
      ['Bắt đầu', formatDateTime(promotion.startDate)],
      ['Kết thúc', formatDateTime(promotion.endDate)],
      ['Sản phẩm áp dụng', promotion.applyScope === 'ALL' ? 'Toàn bộ cửa hàng' : 'Một số sản phẩm']
    ].filter(Boolean);
  }, [promotion, isPercent]);

  return (
    <Box sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 1, sm: 2 }, mt: { xs: -1, md: -2.5 }, pb: 6 }}>
      <Box sx={{ mb: 2 }}>
        <StoreCrumb
          back={{ to: '/promotions', label: 'Khuyến mãi', icon: <TagOutlined /> }}
          current="Sản phẩm có thể áp dụng voucher"
        />
      </Box>

      {promotion && (
        <Box
          sx={{
            mb: 2.5,
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'stretch', md: 'center' },
            justifyContent: 'space-between',
            gap: 2.5
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'stretch', maxWidth: { xs: '100%', md: 450 } }}>
            <Box
              sx={{
                bgcolor: '#FEF08A',
                width: { xs: 24, sm: 32 },
                flexShrink: 0,
                borderRadius: '4px 0 0 4px',
                borderRight: '1px dashed #FDE047'
              }}
            />

            <Box
              sx={{
                bgcolor: '#FFFFFF',
                border: '1px solid #E5E7EB',
                borderLeft: 'none',
                borderRadius: '0 4px 4px 0',
                p: 1.5,
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}
            >
              <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: INK, lineHeight: 1.3 }}>
                Giảm {discountText} {isPercent && promotion.maxDiscountAmount > 0 ? `Giảm tối đa ${formatShortMoney(promotion.maxDiscountAmount)}` : ''}
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: MUTED, mt: 0.5 }}>
                Đơn Tối Thiểu {formatShortMoney(promotion.minOrderValue)}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: 11.5, color: MUTED }}>
                  HSD: {formatDate(promotion.endDate)}
                </Typography>
                <Typography
                  onClick={() => setConditionOpen(true)}
                  sx={{
                    fontSize: 11.5,
                    color: '#0284C7',
                    fontWeight: 600,
                    cursor: 'pointer',
                    '&:hover': { textDecoration: 'underline' }
                  }}
                >
                  Điều Kiện
                </Typography>
              </Box>
            </Box>
          </Box>

          <Box sx={{ flex: 1, maxWidth: { xs: '100%', md: 480 }, pl: { md: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.25 }}>
              <Box sx={{ position: 'relative', flex: 1, py: 1 }}>
                <Box sx={{ height: 4, bgcolor: '#E5E7EB', borderRadius: 2, width: '100%', position: 'relative' }}>
                  <Box
                    sx={{
                      height: '100%',
                      bgcolor: isEligible ? GREEN : CYAN,
                      borderRadius: 2,
                      width: `${progressPercent}%`,
                      transition: 'width .3s ease'
                    }}
                  />
                </Box>
                <Box
                  sx={{
                    position: 'absolute',
                    right: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    bgcolor: isEligible ? GREEN : '#FFFFFF',
                    border: isEligible ? `2px solid ${GREEN}` : '2px solid #D1D5DB',
                    color: isEligible ? '#FFFFFF' : '#9CA3AF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11
                  }}
                >
                  <CheckOutlined style={{ fontSize: 10 }} />
                </Box>
              </Box>

              <Button
                variant="contained"
                size="small"
                onClick={handleGoToCart}
                sx={{
                  bgcolor: `${CYAN} !important`,
                  color: `${CYAN_INK} !important`,
                  fontWeight: 700,
                  fontSize: 12.5,
                  borderRadius: '4px',
                  height: 32,
                  px: 1.5,
                  boxShadow: 'none',
                  textTransform: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  flexShrink: 0,
                  '&:hover': { bgcolor: `${CYAN_HOVER} !important`, boxShadow: 'none' }
                }}
              >
                <Badge
                  badgeContent={eligibleCartCount}
                  showZero
                  sx={{
                    '& .MuiBadge-badge': {
                      bgcolor: '#FEF08A !important',
                      color: '#854D0E !important',
                      fontWeight: 800,
                      fontSize: 10,
                      height: 16,
                      minWidth: 16
                    }
                  }}
                >
                  <ShoppingCartOutlined style={{ fontSize: 14 }} />
                </Badge>
                <span>Giỏ Hàng</span>
              </Button>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              {isEligible ? (
                <>
                  <CheckCircleFilled style={{ color: GREEN, fontSize: 15 }} />
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>
                    Đã đạt mức chi tiêu tối thiểu để sử dụng mã
                  </Typography>
                </>
              ) : (
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK }}>
                  Mua thêm <strong style={{ color: PRICE_RED }}>{money(diffToMeet)}</strong> để sử dụng mã
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      )}

      <Box sx={{ mb: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Tìm kiếm các sản phẩm có thể áp dụng voucher..."
          value={search}
          onChange={handleSearchChange}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlined style={{ color: '#9CA3AF', fontSize: 15 }} />
              </InputAdornment>
            )
          }}
          sx={{
            flex: 1,
            maxWidth: { xs: '100%', sm: 420 },
            '& .MuiOutlinedInput-root': {
              borderRadius: '4px',
              bgcolor: '#FFFFFF',
              fontSize: 13,
              '& fieldset': { borderColor: '#E5E7EB' },
              '&:hover fieldset, &.Mui-focused fieldset': { borderColor: CYAN }
            }
          }}
        />

        <Typography sx={{ fontSize: 13, color: MUTED }}>
          {products.length} sản phẩm
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}>
          <CircularProgress size={36} sx={{ color: CYAN_INK }} />
        </Box>
      ) : products.length === 0 ? (
        <Box sx={{ bgcolor: '#FFF6DA', py: { xs: 8, sm: 9 }, px: 2, textAlign: 'center' }}>
          <Box component="h2" sx={{ m: 0, fontSize: { xs: 26, sm: 30 } }}>
            {search ? 'Không tìm thấy sản phẩm nào' : 'Hiện chưa có sản phẩm nào'}
          </Box>
          <Box component="p" sx={{ m: 0, mt: 1.5, fontSize: 15, color: MUTED, maxWidth: 420, mx: 'auto', lineHeight: 1.6 }}>
            {search ? 'Không có sản phẩm nào khớp với từ khóa của bạn. Thử từ khóa khác nhé.' : 'Voucher này hiện chưa áp dụng cho sản phẩm nào.'}
          </Box>
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, 1fr)',
              sm: 'repeat(3, 1fr)',
              md: 'repeat(4, 1fr)',
              lg: 'repeat(6, 1fr)'
            },
            gap: 1.25
          }}
        >
          {products.map((item) => {
            const outOfStock = Number(item.totalStock || 0) === 0;
            return (
              <Box
                key={item.productId}
                component={RouterLink}
                to={`/shop/products/${item.productId}`}
                sx={{
                  bgcolor: '#FFFFFF',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  border: '1px solid #E5E7EB',
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform .15s, box-shadow .15s',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.08)'
                  }
                }}
              >
                <Box sx={{ position: 'relative', width: '100%', pt: '100%', bgcolor: '#FAF6EC' }}>
                  {item.imageUrl ? (
                    <Box
                      component="img"
                      src={item.imageUrl}
                      alt={item.productName}
                      sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#9CA3AF',
                        fontSize: 12,
                        fontWeight: 600
                      }}
                    >
                      THORS
                    </Box>
                  )}

                  {outOfStock && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        bgcolor: 'rgba(0,0,0,0.65)',
                        color: '#FFFFFF',
                        fontSize: 9.5,
                        fontWeight: 700,
                        px: 0.75,
                        py: 0.2,
                        borderRadius: '2px'
                      }}
                    >
                      HẾT HÀNG
                    </Box>
                  )}
                </Box>

                <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: INK,
                      lineHeight: 1.3,
                      height: 31,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      mb: 0.75
                    }}
                  >
                    {item.productName}
                  </Typography>

                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 'auto', pt: 0.5 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: INK, lineHeight: 1.2 }}>
                      {priceRange(item.minPrice, item.maxPrice)}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openVariantDialog(item);
                      }}
                      sx={{
                        bgcolor: `${CYAN} !important`,
                        color: `${CYAN_INK} !important`,
                        width: 26,
                        height: 26,
                        flexShrink: 0,
                        ml: 0.5,
                        '&:hover': { bgcolor: `${CYAN_HOVER} !important` }
                      }}
                    >
                      <ShoppingCartOutlined style={{ fontSize: 12 }} />
                    </IconButton>
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {promotion && (
        <Dialog
          open={conditionOpen}
          onClose={() => setConditionOpen(false)}
          maxWidth="xs"
          fullWidth
          slotProps={{
            paper: {
              sx: {
                borderRadius: '24px',
                overflowY: 'auto',
                scrollbarWidth: 'none',
                '&::-webkit-scrollbar': { display: 'none' },
                color: INK
              }
            }
          }}
        >
          <Box sx={{ position: 'relative', bgcolor: '#FFF6DA', textAlign: 'center', p: '32px 28px 24px' }}>
            <IconButton
              onClick={() => setConditionOpen(false)}
              sx={{ position: 'absolute', top: 14, right: 14, width: 34, height: 34, bgcolor: '#FFFFFF', '&:hover': { bgcolor: '#FFFFFF' } }}
            >
              <CloseOutlined style={{ fontSize: 12, color: MUTED }} />
            </IconButton>
            <Box sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', color: MUTED }}>
              {isPercent ? 'GIẢM GIÁ' : 'GIẢM TIỀN'}
            </Box>
            <Box sx={{ fontSize: 56, fontWeight: 800, letterSpacing: '-2px', lineHeight: 1.1 }}>
              {discountParts(promotion)[0]}
              {discountParts(promotion)[1]}
            </Box>
            <Typography component="h2" sx={{ m: 0, mt: 0.5, fontSize: 18, fontWeight: 700 }}>
              {promotion.name}
            </Typography>
            {promotion.description && (
              <Typography sx={{ mt: 0.75, fontSize: 13.5, color: MUTED, lineHeight: 1.5 }}>
                {promotion.description}
              </Typography>
            )}
          </Box>

          <Box sx={{ borderTop: '2px dashed #E7CF8A' }} />

          <Box sx={{ p: '8px 28px 28px' }}>
            {conditionRows.map(([label, val], i) => (
              <Box
                key={label}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 2,
                  py: 1.5,
                  borderTop: i ? '1px solid #E7EBEE' : 0,
                  fontSize: 14
                }}
              >
                <Typography component="span" sx={{ color: MUTED, fontSize: 14 }}>
                  {label}
                </Typography>
                <Typography component="span" sx={{ fontWeight: 600, textAlign: 'right', fontSize: 14 }}>
                  {val}
                </Typography>
              </Box>
            ))}

            <Button
              fullWidth
              disableRipple
              onClick={() => setConditionOpen(false)}
              sx={{
                mt: 2,
                height: 50,
                fontSize: 14,
                fontWeight: 800,
                borderRadius: '14px',
                bgcolor: `${CYAN} !important`,
                color: `${CYAN_INK} !important`,
                boxShadow: 'none !important',
                textTransform: 'none',
                '&:hover': { bgcolor: `${CYAN_HOVER} !important` }
              }}
            >
              ĐÃ HIỂU
            </Button>
          </Box>
        </Dialog>
      )}

      <Dialog
        open={variantDialogOpen}
        onClose={() => setVariantDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        slotProps={{
          paper: {
            sx: {
              maxWidth: 500,
              width: '100%',
              borderRadius: 3.5,
              m: 2,
              p: 0,
              overflow: 'hidden',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }
          }
        }}
      >
        <Box sx={{ p: { xs: 2.25, sm: 2.75 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography sx={{ fontSize: 16.5, fontWeight: 800, color: '#0F172A' }}>
              Chọn biến thể sản phẩm
            </Typography>
            <IconButton size="small" onClick={() => setVariantDialogOpen(false)}>
              <CloseOutlined style={{ fontSize: 13 }} />
            </IconButton>
          </Box>

          {loadingVariants ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <CircularProgress size={28} sx={{ color: CYAN }} />
            </Box>
          ) : (
            <>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 1.5,
                  pb: 1.75,
                  borderBottom: '1px solid #F1F5F9'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box
                    component="img"
                    src={variantProduct?.imageUrl || ''}
                    alt={variantProduct?.productName}
                    sx={{
                      width: 58,
                      height: 58,
                      borderRadius: 2,
                      objectFit: 'cover',
                      bgcolor: '#F8FAFC',
                      border: '1px solid #E2E8F0'
                    }}
                  />
                  <Box>
                    <Typography sx={{ fontSize: 15, fontWeight: 800, color: '#0F172A', lineHeight: 1.25 }}>
                      {variantProduct?.productName}
                    </Typography>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', mt: 0.35 }}>
                      {selectedVariant ? money(selectedVariant.price) : priceRange(variantProduct?.minPrice, variantProduct?.maxPrice)}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#64748B', lineHeight: 1.2 }}>
                    Tồn: {selectedVariant ? variantStock : variantProduct?.totalStock || 0}
                  </Typography>
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#64748B', mt: 0.35 }}>
                    {selectedSize ? `Size ${selectedSize}` : 'Chưa chọn size'}
                    {' · '}
                    {selectedColor ? `Màu ${selectedColor}` : 'Chưa chọn màu'}
                  </Typography>
                </Box>
              </Box>

              {sizes.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#475569', mb: 0.85 }}>
                    Kích cỡ
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.85 }}>
                    {sizes.map((size) => {
                      const isSelected = selectedSize === size;
                      const hasStock = variants.some((v) => String(v.size ?? '') === size && Number(v.stock || 0) > 0);

                      return (
                        <Box
                          key={size}
                          component="button"
                          type="button"
                          disabled={!hasStock}
                          onClick={() => setSelectedSize(size)}
                          sx={{
                            minWidth: 42,
                            height: 35,
                            px: 1.5,
                            borderRadius: 1.75,
                            fontFamily: 'inherit',
                            fontSize: 12.5,
                            fontWeight: isSelected ? 700 : 500,
                            bgcolor: isSelected ? '#F0FDFA' : '#FFFFFF',
                            color: !hasStock ? '#CBD5E1' : isSelected ? '#0F172A' : '#475569',
                            border: isSelected ? `1.5px solid ${CYAN_INK}` : '1.5px solid #E2E8F0',
                            cursor: hasStock ? 'pointer' : 'not-allowed',
                            opacity: hasStock ? 1 : 0.4,
                            outline: 'none',
                            '&:hover': hasStock ? { borderColor: isSelected ? CYAN_INK : '#94A3B8' } : {}
                          }}
                        >
                          {size}
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              )}

              {colors.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#475569', mb: 0.85 }}>
                    Màu sắc
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.85 }}>
                    {colors.map((color) => {
                      const isSelected = selectedColor === color;
                      const inStock = variants.some(
                        (v) =>
                          String(v.color ?? '') === color &&
                          (selectedSize ? String(v.size ?? '') === selectedSize : true) &&
                          Number(v.stock || 0) > 0
                      );

                      return (
                        <Box
                          key={color}
                          component="button"
                          type="button"
                          disabled={!inStock}
                          onClick={() => setSelectedColor(color)}
                          sx={{
                            minWidth: 50,
                            height: 35,
                            px: 1.75,
                            borderRadius: 1.75,
                            fontFamily: 'inherit',
                            fontSize: 12.5,
                            fontWeight: isSelected ? 700 : 500,
                            bgcolor: isSelected ? '#F0FDFA' : '#FFFFFF',
                            color: !inStock ? '#CBD5E1' : isSelected ? '#0F172A' : '#475569',
                            border: isSelected ? `1.5px solid ${CYAN_INK}` : '1.5px solid #E2E8F0',
                            cursor: inStock ? 'pointer' : 'not-allowed',
                            opacity: inStock ? 1 : 0.4,
                            outline: 'none',
                            '&:hover': inStock ? { borderColor: isSelected ? CYAN_INK : '#94A3B8' } : {}
                          }}
                        >
                          {color}
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              )}

              <Box sx={{ mt: 2, mb: 2 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#475569', mb: 0.85 }}>
                  Số lượng
                </Typography>
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: 35,
                    border: '1px solid #E2E8F0',
                    borderRadius: 1.5,
                    px: 0.5
                  }}
                >
                  <IconButton
                    size="small"
                    disabled={variantQuantity <= 1}
                    onClick={() => setVariantQuantity((q) => Math.max(1, q - 1))}
                    sx={{ p: 0.75 }}
                  >
                    <MinusOutlined style={{ fontSize: 11, color: '#475569' }} />
                  </IconButton>
                  <Box
                    component="input"
                    type="text"
                    inputMode="numeric"
                    value={variantQuantity}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      const max = variantStock || 9999;
                      setVariantQuantity(val ? Math.min(parseInt(val, 10), max) : 1);
                    }}
                    sx={{
                      width: 36,
                      textAlign: 'center',
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#0F172A',
                      border: 'none',
                      outline: 'none',
                      bgcolor: 'transparent',
                      p: 0
                    }}
                  />
                  <IconButton
                    size="small"
                    disabled={Boolean(selectedVariant && variantQuantity >= variantStock)}
                    onClick={() => setVariantQuantity((q) => q + 1)}
                    sx={{ p: 0.75 }}
                  >
                    <PlusOutlined style={{ fontSize: 11, color: '#475569' }} />
                  </IconButton>
                </Box>
              </Box>

              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  pt: 2,
                  borderTop: '1px solid #F1F5F9'
                }}
              >
                <Box>
                  <Typography sx={{ fontSize: 11.5, color: '#64748B' }}>
                    {selectedVariant ? `Thành tiền · ${variantQuantity} sản phẩm` : 'Giá sản phẩm'}
                  </Typography>
                  <Typography sx={{ fontSize: 17, fontWeight: 800, color: '#0F172A', mt: 0.25 }}>
                    {selectedVariant ? money(Number(selectedVariant.price || 0) * variantQuantity) : priceRange(variantProduct?.minPrice, variantProduct?.maxPrice)}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Button
                    type="button"
                    onClick={() => setVariantDialogOpen(false)}
                    sx={{
                      bgcolor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      color: '#334155',
                      fontWeight: 600,
                      fontSize: 12.5,
                      height: 36,
                      px: 2,
                      borderRadius: 1.5,
                      textTransform: 'none',
                      '&:hover': { bgcolor: '#F8FAFC' }
                    }}
                  >
                    Hủy
                  </Button>

                  <Button
                    type="button"
                    variant="contained"
                    disabled={!selectedVariant || variantStock <= 0 || addingToCart}
                    onClick={handleAddToCart}
                    startIcon={addingToCart ? <CircularProgress size={14} sx={{ color: CYAN_INK }} /> : <ShoppingCartOutlined style={{ fontSize: 14 }} />}
                    sx={{
                      bgcolor: `${CYAN} !important`,
                      color: `${CYAN_INK} !important`,
                      fontWeight: 700,
                      fontSize: 12.5,
                      height: 36,
                      px: 2,
                      borderRadius: 1.5,
                      textTransform: 'none',
                      boxShadow: 'none',
                      '&:hover': { bgcolor: `${CYAN_HOVER} !important`, boxShadow: 'none' }
                    }}
                  >
                    Thêm vào giỏ hàng
                  </Button>
                </Box>
              </Box>
            </>
          )}
        </Box>
      </Dialog>

      <Snackbar
        open={Boolean(snackbarMessage)}
        autoHideDuration={3000}
        onClose={() => setSnackbarMessage('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert onClose={() => setSnackbarMessage('')} severity="success" sx={{ width: '100%', borderRadius: 2 }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}
