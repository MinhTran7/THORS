import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, ClickAwayListener, Dialog, IconButton, InputAdornment, Snackbar, TextField, Typography, useMediaQuery } from '@mui/material';
import {
  SearchOutlined,
  ScanOutlined,
  FileTextOutlined,
  EditOutlined,
  CloseOutlined,
  PlusOutlined,
  MinusOutlined,
  DeleteOutlined,
  CheckOutlined,
  DollarOutlined,
  BankOutlined,
  ShoppingCartOutlined
} from '@ant-design/icons';
import { getProducts, getProductById } from '../../services/productService';
import { api } from '../../services/http';
import { useAuth } from '../auth/AuthProvider';
// Quét mã vạch (phần kho/mã vạch): máy quét USB/Bluetooth, ô tìm kiếm hoặc camera → thêm vào hóa đơn.
import useBarcodeScanner from '../warehouse/useBarcodeScanner';
import { addScannedLine, scanToCartLine } from '../warehouse/scanToCart';
import CameraScanDialog from '../warehouse/CameraScanDialog';
import { useCrumbs } from '../../layouts/crumbs';
import ReceiptDialog from './ReceiptDialog';
import ProductInfoDialog from './ProductInfoDialog';

const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;
const formatNumberInput = (val) => {
  const digits = String(val ?? '').replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString('vi-VN') : '';
};
const isActive = (value) => String(value ?? '').toUpperCase() === 'ACTIVE';
const getId = (p) => p?.productId ?? p?.id;
const getVariantId = (v) => v?.detailId ?? v?.variantId ?? v?.id;
const getStock = (v) => Number(v?.stockQuantity ?? v?.stock ?? 0);
const getPrice = (v) => Number(v?.price ?? v?.salePrice ?? v?.sale_price ?? 0);
const getList = (data) => (Array.isArray(data) ? data : (data?.content ?? data?.data ?? []));
const getProductStock = (p) => Number(p?.stockQuantity ?? p?.totalStock ?? p?.stock ?? p?.quantity ?? 0);

export default function InStoreSalesPage() {
  const { account } = useAuth();
  useCrumbs(['Bán hàng tại quầy', 'Bán hàng']);

  const isDesktop = useMediaQuery((theme) => theme.breakpoints.up('lg'));

  useEffect(() => {
    if (!isDesktop) return undefined;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prev;
    };
  }, [isDesktop]);

  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState(null);
  const [infoLine, setInfoLine] = useState(null);

  // Quản lý nhiều tab hóa đơn chờ kiểu Sapo
  const [orders, setOrders] = useState([
    {
      id: 1,
      label: 'Hóa đơn 1',
      cart: [],
      payment: 'Cash',
      discount: '',
      discountType: 'amount',
      customerPaid: ''
    }
  ]);
  const [activeOrderId, setActiveOrderId] = useState(1);

  const activeOrder = useMemo(() => {
    return orders.find((o) => o.id === activeOrderId) || orders[0] || {};
  }, [orders, activeOrderId]);

  function updateActiveOrder(patchOrFn) {
    setOrders((prev) =>
      prev.map((ord) => {
        if (ord.id !== activeOrderId) return ord;
        return typeof patchOrFn === 'function' ? patchOrFn(ord) : { ...ord, ...patchOrFn };
      })
    );
  }

  const cart = activeOrder.cart || [];
  const payment = activeOrder.payment || 'Cash';
  const discount = activeOrder.discount || '';
  const discountType = activeOrder.discountType || 'amount';
  const customerPaid = activeOrder.customerPaid ?? '';
  const setCustomerPaid = (val) => updateActiveOrder({ customerPaid: val });

  const setCart = (action) => {
    updateActiveOrder((ord) => ({
      ...ord,
      cart: typeof action === 'function' ? action(ord.cart || []) : action
    }));
  };

  const setPayment = (val) => updateActiveOrder({ payment: val });

  // Popup giảm giá (VNĐ hoặc %)
  const [discountOpen, setDiscountOpen] = useState(false);
  const [draftType, setDraftType] = useState('amount');
  const [draftValue, setDraftValue] = useState('');
  const [draftError, setDraftError] = useState('');

  function openDiscount() {
    setDraftType(discountType);
    setDraftValue(discount);
    setDraftError('');
    setDiscountOpen(true);
  }

  function applyDiscount() {
    const value = Number(draftValue) || 0;
    if (value < 0) return setDraftError('Giá trị giảm không hợp lệ.');
    if (draftType === 'percent' && value > 100) return setDraftError('Phần trăm giảm tối đa là 100%.');
    if (draftType === 'amount' && value > subtotal) return setDraftError('Giảm giá không được vượt quá tổng tiền hàng.');
    updateActiveOrder({ discount: draftValue, discountType: draftType });
    setDiscountOpen(false);
  }

  function addOrderTab() {
    if (orders.length >= 8) {
      setError('Đã đạt giới hạn tối đa 8 hóa đơn chờ.');
      return;
    }
    const newId = Date.now();
    const existingNums = orders.map((o) => {
      const m = o.label.match(/\d+/);
      return m ? parseInt(m[0], 10) : 0;
    });
    let nextNum = 1;
    while (existingNums.includes(nextNum)) nextNum++;

    const newOrder = {
      id: newId,
      label: `Hóa đơn ${nextNum}`,
      cart: [],
      payment: 'Cash',
      discount: '',
      discountType: 'amount',
      customerPaid: ''
    };
    setOrders((prev) => [...prev, newOrder]);
    setActiveOrderId(newId);
    setError('');
  }

  function switchOrderTab(id) {
    setActiveOrderId(id);
    setError('');
  }

  function closeOrderTab(id, e) {
    e?.stopPropagation();
    if (orders.length <= 1) {
      clearInvoice();
      return;
    }
    setOrders((prev) => {
      const next = prev.filter((o) => o.id !== id);
      if (activeOrderId === id) {
        setActiveOrderId(next[next.length - 1].id);
      }
      return next;
    });
  }

  // Modal chọn biến thể sản phẩm
  const [variantProduct, setVariantProduct] = useState(null);
  const [variantDialogOpen, setVariantDialogOpen] = useState(false);
  const [variants, setVariants] = useState([]);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [variantQuantity, setVariantQuantity] = useState(1);
  const [loadingVariants, setLoadingVariants] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Modal hóa đơn sau thanh toán
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [completedCart, setCompletedCart] = useState([]);
  const [completedAt, setCompletedAt] = useState(null);
  const [completedPayment, setCompletedPayment] = useState({ received: 0, change: 0 });

  useEffect(() => {
    getProducts()
      .then((res) => {
        setProducts(getList(res?.data ?? res).filter((p) => isActive(p.status)));
      })
      .catch((err) => setError(err.message || 'Không thể tải danh sách sản phẩm.'))
      .finally(() => setLoading(false));
  }, []);

  const visibleProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return products.filter((p) => [p.productName, p.sku].some((value) => String(value || '').toLowerCase().includes(keyword)));
  }, [products, search]);

  const sizes = useMemo(() => [...new Set(variants.map((v) => String(v.size ?? '')).filter(Boolean))], [variants]);

  const colors = useMemo(() => [...new Set(variants.map((v) => String(v.color ?? '')).filter(Boolean))], [variants]);

  const selectedVariant = useMemo(() => {
    if (!selectedSize || !selectedColor) return null;
    return variants.find((v) => String(v.size ?? '') === selectedSize && String(v.color ?? '') === selectedColor) || null;
  }, [variants, selectedSize, selectedColor]);

  const priceRange = useMemo(() => {
    const prices = variants.map(getPrice).filter((price) => price > 0);
    if (!prices.length) return 'Liên hệ';
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? money(min) : `${Number(min).toLocaleString('vi-VN')}–${Number(max).toLocaleString('vi-VN')} đ`;
  }, [variants]);

  async function addProduct(product) {
    const id = getId(product);
    if (id == null || addingId !== null) return;

    setAddingId(id);
    setError('');
    setLoadingVariants(true);

    try {
      const res = await getProductById(id);
      const data = res?.data ?? res;
      const detail = data?.data ?? data;
      const item = detail?.product ?? detail;
      const rawVariants = detail?.variants ?? item?.variants ?? detail?.productVariants ?? item?.productVariants ?? [];

      const activeVariants = Array.isArray(rawVariants) ? rawVariants.filter((v) => isActive(v.status)) : [];

      if (!activeVariants.length) {
        setError('Sản phẩm chưa có biến thể hoạt động.');
        return;
      }

      const image =
        detail?.images?.[0]?.imageUrl ||
        item?.images?.[0]?.imageUrl ||
        product.primaryImageUrl ||
        product.imageUrl ||
        product.thumbnailUrl ||
        product.mainImageUrl ||
        '';

      setVariantProduct({ ...product, ...item, productId: id, image });
      setVariants(activeVariants);
      setSelectedSize('');
      setSelectedColor('');
      setVariantQuantity(1);
      setVariantDialogOpen(true);
    } catch (err) {
      setError(err.message || 'Không thể tải biến thể sản phẩm.');
    } finally {
      setAddingId(null);
      setLoadingVariants(false);
    }
  }

  function closeDialog() {
    setVariantDialogOpen(false);
  }

  function resetDialog() {
    setVariantProduct(null);
    setVariants([]);
    setSelectedSize('');
    setSelectedColor('');
    setVariantQuantity(1);
  }

  function chooseSize(size) {
    setSelectedSize((prev) => (prev === size ? '' : size));
  }

  function chooseColor(color) {
    setSelectedColor((prev) => (prev === color ? '' : color));
  }

  function confirmVariant() {
    if (!variantProduct || !selectedVariant || getStock(selectedVariant) <= 0) {
      setError('Vui lòng chọn kích cỡ và màu sắc còn hàng.');
      return;
    }

    const productId = getId(variantProduct);
    const variantId = getVariantId(selectedVariant);

    if (variantId == null) {
      setError('Không tìm thấy thông tin biến thể.');
      return;
    }

    const key = `${productId}-${variantId}`;
    const existing = cart.find((line) => line.key === key);
    const stock = getStock(selectedVariant);

    const newQuantity = (existing ? existing.quantity : 0) + variantQuantity;
    if (newQuantity > stock) {
      setError('Số lượng vượt quá tồn kho khả dụng.');
      return;
    }

    if (existing) {
      setCart((current) => current.map((line) => (line.key === key ? { ...line, quantity: newQuantity } : line)));
    } else {
      setCart((current) => [
        ...current,
        {
          key,
          productId,
          variantId,
          name: variantProduct.productName || 'Sản phẩm',
          image: variantProduct.image || '',
          size: selectedVariant.size ?? '',
          color: selectedVariant.color ?? '',
          price: getPrice(selectedVariant),
          stock,
          quantity: variantQuantity
        }
      ]);
    }

    closeDialog();
  }

  // ---- Quét mã vạch → thêm vào hóa đơn đang mở (quét lại cùng mã thì +1, không vượt tồn kho) ----
  const [cameraOpen, setCameraOpen] = useState(false);
  const searchInputRef = useRef(null);
  const cartRef = useRef(cart);
  cartRef.current = cart;

  async function addScanned(code) {
    setError('');
    setSuccess('');
    try {
      const line = await scanToCartLine(code);
      const result = addScannedLine(cartRef.current, line);
      if (result.error) {
        setError(result.error);
        return { ok: false, message: result.error };
      }
      cartRef.current = result.cart; // several fast scans before the next render still add up
      setCart(result.cart);
      const quantity = result.cart.find((item) => item.key === line.key)?.quantity ?? 1;
      const message = `Đã thêm ${line.name} · ${line.color} · ${line.size} (SL: ${quantity})`;
      setSuccess(message);
      return { ok: true, message };
    } catch (err) {
      setError(err.message);
      return { ok: false, message: err.message };
    }
  }

  // Máy quét cắm vào là dùng: bóp cò ở bất kỳ đâu trên trang (trừ khi đang mở hộp thoại khác).
  useBarcodeScanner(addScanned, !variantDialogOpen && !receiptOpen && !discountOpen && !cameraOpen);

  function updateQuantity(key, delta) {
    setCart((current) =>
      current
        .map((line) => {
          if (line.key !== key) return line;
          const quantity = line.quantity + delta;
          return quantity <= 0 ? null : { ...line, quantity: Math.min(quantity, line.stock) };
        })
        .filter(Boolean)
    );
  }

  function setQuantity(key, value) {
    const qty = parseInt(value, 10);
    if (isNaN(qty) || qty <= 0) return;
    setCart((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        return { ...line, quantity: Math.min(qty, line.stock) };
      })
    );
  }

  const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const discountNumber = Math.max(0, Number(discount) || 0);
  const discountValue =
    discountType === 'percent'
      ? Math.round((subtotal * Math.min(100, discountNumber)) / 100)
      : Math.min(subtotal, Math.round(discountNumber));
  const total = subtotal - discountValue;
  const rawPaidNumber = Number(String(customerPaid || '').replace(/\D/g, '')) || 0;
  const changeAmount = customerPaid === '' ? 0 : Math.max(0, rawPaidNumber - total);

  async function completeSale() {
    setError('');

    if (!cart.length) {
      setError('Vui lòng thêm sản phẩm vào hóa đơn.');
      return;
    }

    if (payment === 'Cash' && customerPaid !== '' && rawPaidNumber < total) {
      setError('Tiền khách trả chưa đủ.');
      return;
    }

    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);

    try {
      const result = await api('/sales/in-store', {
        method: 'POST',
        body: {
          items: cart.map((line) => ({
            detailId: line.variantId,
            quantity: line.quantity
          })),
          discountAmount: discountValue,
          paymentMethod: payment === 'Cash' ? 'CASH' : 'BANK_TRANSFER'
        }
      });

      setCompletedSale(result);
      setCompletedCart([...cart]);
      setCompletedAt(new Date());
      setCompletedPayment({
        received: payment === 'Cash' && rawPaidNumber > 0 ? rawPaidNumber : total,
        change: payment === 'Cash' ? changeAmount : 0
      });
      setReceiptOpen(true);

      setOrders((prev) => {
        if (prev.length > 1) {
          const next = prev.filter((o) => o.id !== activeOrderId);
          setActiveOrderId(next[0].id);
          return next;
        }
        return [
          {
            id: Date.now(),
            label: 'Hóa đơn 1',
            cart: [],
            payment: 'Cash',
            discount: '',
            discountType: 'amount',
            customerPaid: ''
          }
        ];
      });

      getProducts()
        .then((res) => {
          setProducts(getList(res?.data ?? res).filter((p) => isActive(p.status)));
        })
        .catch(() => {});
    } catch (err) {
      setError(err.message || 'Không thể tạo đơn hàng. Vui lòng thử lại.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function clearInvoice() {
    if (!cart.length) {
      setError('Hóa đơn đang trống, không có gì để xóa.');
      return;
    }
    updateActiveOrder({
      cart: [],
      discount: '',
      discountType: 'amount',
      customerPaid: ''
    });
    setError('');
    setSuccess('Đã xóa hóa đơn.');
  }

  function handleReceiptClose() {
    setReceiptOpen(false);
    setCompletedSale(null);
    setCompletedCart([]);
    setCompletedAt(null);
    setCompletedPayment({ received: 0, change: 0 });
  }

  return (
    <Box
      sx={{
        maxWidth: 1600,
        mx: 'auto',
        color: '#0F172A',
        display: { lg: 'flex' },
        flexDirection: 'column',
        height: { lg: 'calc(100vh - 135px)' }
      }}
    >
      {/* ─── BỐ CỤC CHÍNH (2 CỘT) ─── */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1fr 390px' },
          gap: 2.5,
          gridTemplateRows: { lg: 'minmax(0, 1fr)' },
          flex: 1,
          minHeight: 0
        }}
      >
        {/* CỘT TRÁI: TÌM KIẾM & SẢN PHẨM ĐÃ CHỌN */}
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
            <ClickAwayListener onClickAway={() => setSearchOpen(false)}>
              <Box sx={{ position: 'relative', flex: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Tìm theo tên sản phẩm hoặc mã SKU"
                  inputRef={searchInputRef}
                  value={search}
                  onFocus={() => setSearchOpen(true)}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setSearchOpen(true);
                  }}
                  onKeyDown={async (e) => {
                    // Máy quét gõ mã vào ô này rồi Enter (hoặc người gõ mã vạch TH… rồi Enter) → thêm vào hóa đơn.
                    const code = search.trim();
                    if (e.key !== 'Enter' || !/^TH\d{6,}(-\d+)?$/i.test(code)) return;
                    e.preventDefault();
                    const result = await addScanned(code);
                    if (result.ok) {
                      setSearch('');
                      setSearchOpen(false);
                    }
                  }}
                  slotProps={{
                    input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchOutlined style={{ color: '#94A3B8', fontSize: 16 }} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          aria-label="Quét mã bằng camera"
                          title="Có máy quét: cứ bóp cò là thêm vào hóa đơn. Không có máy quét: bấm để quét bằng camera."
                          onClick={() => setCameraOpen(true)}
                        >
                          <ScanOutlined style={{ color: '#64748B', fontSize: 18 }} />
                        </IconButton>
                      </InputAdornment>
                    )
                    }
                  }}
                  sx={{
                    bgcolor: '#FFFFFF',
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2.5,
                      height: 42,
                      '& fieldset': { borderColor: '#E2E8F0' },
                      '&:hover fieldset': { borderColor: '#8EECF5' },
                      '&.Mui-focused fieldset': { borderColor: '#8EECF5' }
                    }
                  }}
                />

                {searchOpen && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 48,
                      left: 0,
                      right: 0,
                      zIndex: 20,
                      bgcolor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: 2.5,
                      boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)',
                      maxHeight: 380,
                      overflowY: 'auto',
                      py: 0.5
                    }}
                  >
                    {loading ? (
                      <Box sx={{ py: 3, textAlign: 'center' }}>
                        <CircularProgress size={24} sx={{ color: '#8EECF5' }} />
                      </Box>
                    ) : !visibleProducts.length ? (
                      <Typography sx={{ py: 3, textAlign: 'center', color: '#64748B', fontSize: 13 }}>
                        Không tìm thấy sản phẩm phù hợp.
                      </Typography>
                    ) : (
                      visibleProducts.map((product) => {
                        const id = getId(product);
                        const stock = getProductStock(product);
                        const isOut = stock <= 0;
                        const min = product.minPrice;
                        const max = product.maxPrice;
                        const priceText =
                          min == null
                            ? 'Liên hệ'
                            : max == null || Number(min) === Number(max)
                              ? money(min)
                              : `${Number(min).toLocaleString('vi-VN')}–${Number(max).toLocaleString('vi-VN')} đ`;
                        const image =
                          product.primaryImageUrl ||
                          product.imageUrl ||
                          product.thumbnailUrl ||
                          product.mainImageUrl ||
                          product.images?.[0]?.imageUrl ||
                          '';

                        return (
                          <Box
                            key={id}
                            onClick={() => {
                              setSearchOpen(false);
                              addProduct(product);
                            }}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1.25,
                              px: 1.5,
                              py: 1,
                              cursor: 'pointer',
                              opacity: isOut ? 0.55 : 1,
                              '&:hover': { bgcolor: '#F0FDFF' }
                            }}
                          >
                            <Box
                              sx={{
                                width: 40,
                                height: 40,
                                borderRadius: 1.5,
                                bgcolor: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                flexShrink: 0,
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {image ? (
                                <Box component="img" src={image} alt={product.productName} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <ShoppingCartOutlined style={{ fontSize: 16, color: '#CBD5E1' }} />
                              )}
                            </Box>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography
                                sx={{ fontSize: 13, fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                              >
                                {product.productName}
                              </Typography>
                              <Typography sx={{ fontSize: 11.5, color: '#94A3B8' }}>{product.sku || '—'}</Typography>
                            </Box>
                            <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                              <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>{priceText}</Typography>
                              <Typography sx={{ fontSize: 11.5, color: isOut ? '#EF4444' : '#64748B' }}>
                                {isOut ? 'Hết hàng' : `Tồn: ${stock}`}
                              </Typography>
                            </Box>
                          </Box>
                        );
                      })
                    )}
                  </Box>
                )}
              </Box>
            </ClickAwayListener>
          </Box>

          <Box
            sx={{
              bgcolor: '#FFFFFF',
              borderRadius: 3.5,
              border: '1px solid #E2E8F0',
              p: { xs: 2, sm: 2.5 },
              boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              '&::-webkit-scrollbar': { display: 'none' }
            }}
          >
          {/* Danh sách món hàng trong giỏ */}
          <Box
            sx={{
              flex: '1 0 auto',
              minHeight: { xs: 240, lg: 0 },
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {!cart.length ? (
              <Box
                sx={{
                  flex: 1,
                  minHeight: { xs: 240, lg: 0 },
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: '#F8FAFC',
                  borderRadius: 2.5,
                  p: 2,
                  textAlign: 'center'
                }}
              >
                <ShoppingCartOutlined style={{ fontSize: 30, color: '#CBD5E1', marginBottom: 8 }} />
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>Chưa có sản phẩm nào</Typography>
                <Typography sx={{ fontSize: 11.5, color: '#94A3B8', mt: 0.25 }}>Tìm và chọn sản phẩm ở thanh tìm kiếm để thêm vào hóa đơn</Typography>
              </Box>
            ) : (
              cart.map((line, index) => (
                <Box key={line.key} sx={{ py: 1.25, borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 1.25 }}>
                  <Typography sx={{ width: 22, fontSize: 12.5, fontWeight: 700, color: '#94A3B8', textAlign: 'center', flexShrink: 0 }}>
                    {index + 1}
                  </Typography>
                  <Box
                    component="img"
                    src={line.image || ''}
                    alt={line.name}
                    onClick={() => setInfoLine(line)}
                    sx={{
                      cursor: 'pointer',
                      width: 44,
                      height: 44,
                      borderRadius: 2,
                      objectFit: 'cover',
                      bgcolor: '#F8FAFC',
                      flexShrink: 0,
                      border: '1px solid #E2E8F0',
                      transition: 'border-color .15s',
                      '&:hover': { borderColor: '#8EECF5' }
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#0F172A',
                        lineHeight: 1.3,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {line.name}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25, flexWrap: 'wrap' }}>
                      {(line.size || line.color) && (
                        <Typography sx={{ fontSize: 11.5, color: '#64748B' }}>
                          {[line.size, line.color].filter(Boolean).join(' · ')}
                        </Typography>
                      )}
                      {(line.size || line.color) && <Typography sx={{ fontSize: 11.5, color: '#CBD5E1' }}>•</Typography>}
                      <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: '#475569' }}>{money(line.price)}</Typography>
                    </Box>
                  </Box>
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      flexShrink: 0
                    }}
                  >
                    <IconButton size="small" onClick={() => updateQuantity(line.key, -1)} sx={{ p: 0.5 }}>
                      <MinusOutlined style={{ fontSize: 10, color: '#475569' }} />
                    </IconButton>
                    <Box
                      component="input"
                      type="text"
                      inputMode="numeric"
                      value={line.quantity}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setQuantity(line.key, val ? parseInt(val, 10) : 1);
                      }}
                      sx={{
                        width: 32,
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
                      disabled={line.quantity >= line.stock}
                      onClick={() => updateQuantity(line.key, 1)}
                      sx={{ p: 0.5 }}
                    >
                      <PlusOutlined style={{ fontSize: 10, color: '#475569' }} />
                    </IconButton>
                  </Box>
                  <Typography sx={{ minWidth: 90, textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: '#0F172A', flexShrink: 0 }}>
                    {money(line.price * line.quantity)}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => setCart((prev) => prev.filter((item) => item.key !== line.key))}
                    sx={{ p: 0.5, color: '#94A3B8', flexShrink: 0, '&:hover': { color: '#EF4444' } }}
                  >
                    <CloseOutlined style={{ fontSize: 11 }} />
                  </IconButton>
                </Box>
              ))
            )}
          </Box>
          </Box>
        </Box>

        {/* CỘT PHẢI: TỔNG TIỀN & THANH TOÁN */}
        <Box
          sx={{
            bgcolor: '#FFFFFF',
            borderRadius: 3.5,
            border: '1px solid #E2E8F0',
            px: { xs: 2, sm: 2.25 },
            py: 1.5,
            boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            '& > *': { flexShrink: 0 }
          }}
        >
          {/* Thanh danh sách tab hóa đơn chờ kiểu Sapo */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5, overflowX: 'auto', pb: 0.25 }}>
            {orders.map((ord) => {
              const isActiveTab = ord.id === activeOrderId;

              return (
                <Box
                  key={ord.id}
                  onClick={() => switchOrderTab(ord.id)}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.75,
                    px: 1.25,
                    py: 0.5,
                    borderRadius: 2,
                    cursor: 'pointer',
                    bgcolor: isActiveTab ? '#FEF9C3' : '#F1F5F9',
                    border: '1.5px solid',
                    borderColor: isActiveTab ? '#FDE047' : '#E2E8F0',
                    color: isActiveTab ? '#854D0E' : '#64748B',
                    fontWeight: 600,
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                    boxSizing: 'border-box',
                    transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                    '&:hover': {
                      bgcolor: isActiveTab ? '#FEF9C3' : '#E2E8F0',
                      color: '#0F172A'
                    }
                  }}
                >
                  <span>{ord.label}</span>
                  {orders.length > 1 && (
                    <Box
                      component="span"
                      onClick={(e) => closeOrderTab(ord.id, e)}
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 15,
                        height: 15,
                        borderRadius: 99,
                        fontSize: 11,
                        color: '#94A3B8',
                        ml: 0.25,
                        '&:hover': { bgcolor: '#FEE2E2', color: '#EF4444' }
                      }}
                      title="Đóng hóa đơn này"
                    >
                      ×
                    </Box>
                  )}
                </Box>
              );
            })}

            {/* Nút thêm tab hóa đơn mới (+) */}
            <Box
              component="button"
              type="button"
              onClick={addOrderTab}
              title="Mở thêm hóa đơn cho khách tiếp theo"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 1.75,
                bgcolor: '#FFFFFF',
                border: '1.5px dashed #CBD5E1',
                color: '#475569',
                cursor: 'pointer',
                fontSize: 15,
                fontWeight: 700,
                flexShrink: 0,
                outline: 'none',
                transition: 'all 0.15s ease',
                '&:hover': {
                  borderColor: '#0F172A',
                  color: '#0F172A',
                  bgcolor: '#F8FAFC'
                }
              }}
            >
              +
            </Box>
          </Box>

          {/* Header hóa đơn */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5, mb: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FileTextOutlined style={{ fontSize: 18, color: '#0F172A' }} />
              <Typography sx={{ fontSize: 16.5, fontWeight: 800, color: '#0F172A' }}>{activeOrder?.label || 'Hóa đơn hiện tại'}</Typography>
            </Box>
            <Box
              sx={{
                bgcolor: '#FEF9C3',
                color: '#854D0E',
                border: '1px solid #FDE047',
                borderRadius: 99,
                px: 1.25,
                py: 0.35,
                fontSize: 11.5,
                fontWeight: 700
              }}
            >
              Đang tạo
            </Box>
          </Box>

          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column'
            }}
          >
          {/* Tổng tiền hàng & Giảm giá */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 0.75, borderTop: '1px solid #F1F5F9' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography sx={{ fontSize: 13, color: '#64748B' }}>Tổng tiền hàng</Typography>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>{money(subtotal)}</Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography sx={{ fontSize: 13, color: '#64748B' }}>
                  Giảm giá{discountType === 'percent' && discountNumber > 0 ? ` (${discountNumber}%)` : ''}
                </Typography>
                <IconButton
                  size="small"
                  onClick={openDiscount}
                  sx={{ p: 0.25, color: '#64748B', '&:hover': { color: '#0F172A' } }}
                >
                  <EditOutlined style={{ fontSize: 12 }} />
                </IconButton>
              </Box>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: discountValue > 0 ? '#10B981' : '#0F172A' }}>
                {discountValue > 0 ? `-${money(discountValue)}` : '-0 đ'}
              </Typography>
            </Box>

            {/* Tổng phải trả */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                pt: 0.5,
                mt: 0.25,
                borderTop: '1px dashed #E2E8F0'
              }}
            >
              <Typography sx={{ fontSize: 14.5, fontWeight: 800, color: '#0F172A' }}>Tổng phải trả</Typography>
              <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>{money(total)}</Typography>
            </Box>
          </Box>

          {/* Phương thức thanh toán */}
          <Box sx={{ mt: 0.75 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#334155', mb: 0.5 }}>Phương thức thanh toán</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <Box
                component="button"
                type="button"
                onClick={() => setPayment('Cash')}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  fontFamily: 'inherit',
                  bgcolor: payment === 'Cash' ? '#FEF9C3' : '#FFFFFF',
                  border: `1.5px solid ${payment === 'Cash' ? '#FDE047' : '#E2E8F0'}`,
                  color: payment === 'Cash' ? '#854D0E' : '#475569',
                  fontWeight: 700,
                  fontSize: 13,
                  height: 34,
                  borderRadius: 2.5,
                  cursor: 'pointer',
                  boxShadow: 'none',
                  outline: 'none',
                  transition: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  userSelect: 'none',
                  '&:hover': {
                    bgcolor: payment === 'Cash' ? '#FEF9C3' : '#F8FAFC'
                  }
                }}
              >
                <DollarOutlined />
                <span>Tiền mặt</span>
              </Box>

              <Box
                component="button"
                type="button"
                onClick={() => setPayment('Bank transfer')}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  fontFamily: 'inherit',
                  bgcolor: payment === 'Bank transfer' ? '#FEF9C3' : '#FFFFFF',
                  border: `1.5px solid ${payment === 'Bank transfer' ? '#FDE047' : '#E2E8F0'}`,
                  color: payment === 'Bank transfer' ? '#854D0E' : '#475569',
                  fontWeight: 700,
                  fontSize: 13,
                  height: 34,
                  borderRadius: 2.5,
                  cursor: 'pointer',
                  boxShadow: 'none',
                  outline: 'none',
                  transition: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  userSelect: 'none',
                  '&:hover': {
                    bgcolor: payment === 'Bank transfer' ? '#FEF9C3' : '#F8FAFC'
                  }
                }}
              >
                <BankOutlined />
                <span>Chuyển khoản</span>
              </Box>
            </Box>
            {payment === 'Cash' && (
              <Box sx={{ mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>Tiền khách trả</Typography>
                  <TextField
                    size="small"
                    inputMode="numeric"
                    placeholder={total > 0 ? Number(total).toLocaleString('vi-VN') : '0'}
                    value={customerPaid}
                    onChange={(e) => setCustomerPaid(formatNumberInput(e.target.value))}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">đ</InputAdornment>
                    }}
                    sx={{
                      width: 140,
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                        height: 32,
                        fontSize: 13,
                        fontWeight: 700
                      },
                      '& input': { textAlign: 'right', py: 0.5 }
                    }}
                  />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>Tiền trả lại khách</Typography>
                  <Typography sx={{ fontSize: 14, fontWeight: 800, color: changeAmount > 0 ? '#10B981' : '#0F172A' }}>
                    {money(changeAmount)}
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>

          </Box>

          <Box sx={{ mt: 'auto', pt: 1 }}>
            <Button
              fullWidth
              variant="contained"
              onClick={completeSale}
              disabled={submitting}
              startIcon={!submitting && <CheckOutlined />}
              sx={{
                bgcolor: '#8EECF5',
                color: '#0F172A',
                fontWeight: 800,
                fontSize: 13.5,
                height: 38,
                borderRadius: 2.5,
                textTransform: 'none',
                boxShadow: 'none',
                '&:hover': {
                  bgcolor: '#76DCED',
                  boxShadow: '0 2px 10px rgba(142, 236, 245, 0.45)'
                },
                '&.Mui-disabled': {
                  bgcolor: '#E2E8F0',
                  color: '#94A3B8'
                }
              }}
            >
              {submitting ? 'Đang xử lý...' : 'Hoàn tất thanh toán'}
            </Button>

            <Box sx={{ textAlign: 'center', mt: 0.75 }}>
              <Button
                size="small"
                onClick={clearInvoice}
                startIcon={<DeleteOutlined style={{ fontSize: 12 }} />}
                sx={{
                  color: '#64748B',
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: 'none',
                  '&:hover': { color: '#EF4444', bgcolor: 'transparent' }
                }}
              >
                Xóa hóa đơn
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ─── MODAL CHỌN BIẾN THỂ SẢN PHẨM (ẢNH 2) ─── */}
      <Dialog
        open={variantDialogOpen}
        onClose={closeDialog}
        TransitionProps={{ onExited: resetDialog }}
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
          {/* Header Modal */}
          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: 16.5, fontWeight: 800, color: '#0F172A' }}>Chọn biến thể sản phẩm</Typography>
          </Box>

          {loadingVariants ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <CircularProgress size={28} sx={{ color: '#8EECF5' }} />
            </Box>
          ) : (
            <>
              {/* Tóm tắt sản phẩm đang chọn */}
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
                    src={variantProduct?.image || ''}
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
                    <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', mt: 0.35 }}>{priceRange}</Typography>
                  </Box>
                </Box>

                {/* Thông tin Tồn kho & Biến thể góc phải (cùng size và màu) */}
                <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#64748B', lineHeight: 1.2 }}>
                    {selectedVariant
                      ? `Tồn: ${getStock(selectedVariant)}`
                      : variantProduct
                        ? `Tồn: ${getProductStock(variantProduct)}`
                        : ''}
                  </Typography>
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#64748B', mt: 0.35 }}>
                    {selectedSize ? `Size ${selectedSize}` : 'Chưa chọn size'}
                    {' · '}
                    {selectedColor ? `Màu ${selectedColor}` : 'Chưa chọn màu'}
                  </Typography>
                </Box>
              </Box>

              {/* Bộ chọn Kích cỡ */}
              <Box sx={{ mt: 2 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#475569', mb: 0.85 }}>Kích cỡ</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.85 }}>
                  {sizes.map((size) => {
                    const isSelected = selectedSize === size;
                    const hasStock = variants.some((v) => String(v.size ?? '') === size && getStock(v) > 0);

                    return (
                      <Box
                        key={size}
                        component="button"
                        type="button"
                        disabled={!hasStock}
                        onClick={() => chooseSize(size)}
                        sx={{
                          minWidth: 42,
                          height: 35,
                          px: 1.5,
                          borderRadius: 1.75,
                          fontFamily: 'inherit',
                          fontSize: 12.5,
                          fontWeight: isSelected ? 700 : 500,
                          bgcolor: '#FFFFFF',
                          color: !hasStock ? '#CBD5E1' : isSelected ? '#0F172A' : '#475569',
                          border: isSelected ? '1.5px solid #64748B' : '1.5px solid #E2E8F0',
                          cursor: hasStock ? 'pointer' : 'not-allowed',
                          opacity: hasStock ? 1 : 0.4,
                          outline: 'none',
                          transition: 'none',
                          '&:hover': hasStock
                            ? {
                                borderColor: isSelected ? '#64748B' : '#94A3B8'
                              }
                            : {}
                        }}
                      >
                        {size}
                      </Box>
                    );
                  })}
                </Box>
              </Box>

              {/* Bộ chọn Màu sắc */}
              <Box sx={{ mt: 2 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#475569', mb: 0.85 }}>Màu sắc</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.85 }}>
                  {colors.map((color) => {
                    const isSelected = selectedColor === color;
                    const inStock = variants.some(
                      (v) =>
                        String(v.color ?? '') === color && (selectedSize ? String(v.size ?? '') === selectedSize : true) && getStock(v) > 0
                    );

                    return (
                      <Box
                        key={color}
                        component="button"
                        type="button"
                        disabled={!inStock}
                        onClick={() => chooseColor(color)}
                        sx={{
                          minWidth: 50,
                          height: 35,
                          px: 1.75,
                          borderRadius: 1.75,
                          fontFamily: 'inherit',
                          fontSize: 12.5,
                          fontWeight: isSelected ? 700 : 500,
                          bgcolor: '#FFFFFF',
                          color: !inStock ? '#CBD5E1' : isSelected ? '#0F172A' : '#475569',
                          border: isSelected ? '1.5px solid #64748B' : '1.5px solid #E2E8F0',
                          cursor: inStock ? 'pointer' : 'not-allowed',
                          opacity: inStock ? 1 : 0.4,
                          outline: 'none',
                          transition: 'none',
                          '&:hover': inStock
                            ? {
                                borderColor: isSelected ? '#64748B' : '#94A3B8'
                              }
                            : {}
                        }}
                      >
                        {color}
                      </Box>
                    );
                  })}
                </Box>
              </Box>

              {/* Bộ chọn Số lượng */}
              <Box sx={{ mt: 2, mb: 2 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#475569', mb: 0.85 }}>Số lượng</Typography>
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: 35
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
                      const max = selectedVariant ? getStock(selectedVariant) : 9999;
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
                    disabled={Boolean(selectedVariant && variantQuantity >= getStock(selectedVariant))}
                    onClick={() => setVariantQuantity((q) => q + 1)}
                    sx={{ p: 0.75 }}
                  >
                    <PlusOutlined style={{ fontSize: 11, color: '#475569' }} />
                  </IconButton>
                </Box>
              </Box>

              {/* Footer Modal */}
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
                    {selectedVariant ? money(getPrice(selectedVariant) * variantQuantity) : priceRange}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Button
                    type="button"
                    onClick={closeDialog}
                    sx={{
                      bgcolor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      color: '#334155',
                      fontWeight: 600,
                      fontSize: 11.5,
                      height: 30,
                      px: 1.5,
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
                    disabled={!selectedVariant || getStock(selectedVariant) <= 0}
                    onClick={confirmVariant}
                    startIcon={<PlusOutlined style={{ fontSize: 10 }} />}
                    sx={{
                      bgcolor: '#8EECF5',
                      color: '#0F172A',
                      fontWeight: 700,
                      fontSize: 11.5,
                      height: 30,
                      px: 1.75,
                      borderRadius: 1.5,
                      textTransform: 'none',
                      boxShadow: 'none',
                      '&:hover': {
                        bgcolor: '#76DCED',
                        boxShadow: '0 2px 8px rgba(142, 236, 245, 0.4)'
                      },
                      '&.Mui-disabled': {
                        bgcolor: '#E2E8F0',
                        color: '#94A3B8'
                      }
                    }}
                  >
                    Thêm vào hóa đơn
                  </Button>
                </Box>
              </Box>
            </>
          )}
        </Box>
      </Dialog>

      {/* ─── POPUP GIẢM GIÁ ─── */}
      <Dialog
        open={discountOpen}
        onClose={() => setDiscountOpen(false)}
        fullWidth
        slotProps={{ paper: { sx: { maxWidth: 380, borderRadius: 3.5, m: 2 } } }}
      >
        <Box sx={{ p: 2.5 }}>
          <Typography sx={{ fontSize: 16.5, fontWeight: 800, color: '#0F172A', mb: 2 }}>Giảm giá</Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}>
            {[
              { value: 'amount', label: 'VNĐ' },
              { value: 'percent', label: '%' }
            ].map((opt) => {
              const selected = draftType === opt.value;
              return (
                <Box
                  key={opt.value}
                  component="button"
                  type="button"
                  onClick={() => {
                    setDraftType(opt.value);
                    setDraftValue('');
                    setDraftError('');
                  }}
                  sx={{
                    fontFamily: 'inherit',
                    fontWeight: 700,
                    fontSize: 13,
                    height: 36,
                    borderRadius: 2.5,
                    cursor: 'pointer',
                    outline: 'none',
                    bgcolor: selected ? '#FEF9C3' : '#FFFFFF',
                    border: `1.5px solid ${selected ? '#FDE047' : '#E2E8F0'}`,
                    color: selected ? '#854D0E' : '#475569'
                  }}
                >
                  {opt.label}
                </Box>
              );
            })}
          </Box>

          <TextField
            fullWidth
            autoFocus
            size="small"
            type="number"
            placeholder={draftType === 'percent' ? 'Nhập % giảm' : 'Nhập số tiền giảm'}
            value={draftValue}
            onChange={(e) => {
              setDraftValue(e.target.value);
              setDraftError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && applyDiscount()}
            error={Boolean(draftError)}
            helperText={
              draftError ||
              (draftType === 'percent' && Number(draftValue) > 0
                ? `= ${money(Math.round((subtotal * Math.min(100, Number(draftValue))) / 100))}`
                : `Tổng tiền hàng: ${money(subtotal)}`)
            }
            inputProps={{ min: 0, max: draftType === 'percent' ? 100 : subtotal }}
            InputProps={{ endAdornment: <InputAdornment position="end">{draftType === 'percent' ? '%' : 'đ'}</InputAdornment> }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, height: 40 } }}
          />

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2.5 }}>
            <Button
              type="button"
              onClick={() => setDiscountOpen(false)}
              sx={{
                border: '1px solid #E2E8F0',
                color: '#334155',
                fontWeight: 600,
                fontSize: 12.5,
                height: 34,
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
              onClick={applyDiscount}
              sx={{
                bgcolor: '#8EECF5',
                color: '#0F172A',
                fontWeight: 700,
                fontSize: 12.5,
                height: 34,
                px: 2,
                borderRadius: 1.5,
                textTransform: 'none',
                boxShadow: 'none',
                '&:hover': { bgcolor: '#76DCED', boxShadow: 'none' }
              }}
            >
              Áp dụng
            </Button>
          </Box>
        </Box>
      </Dialog>

      {cameraOpen && <CameraScanDialog title="Quét mã thêm vào hóa đơn" onDetected={addScanned} onClose={() => setCameraOpen(false)} />}

      <Snackbar
        open={Boolean(error || success)}
        autoHideDuration={5000}
        onClose={(e, reason) => {
          if (reason === 'clickaway') return;
          setError('');
          setSuccess('');
        }}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ top: { xs: 64, sm: 72 } }}
      >
        <Alert
          severity={error ? 'error' : 'success'}
          variant="filled"
          onClose={() => {
            setError('');
            setSuccess('');
          }}
          sx={{ width: '100%' }}
        >
          {error || success}
        </Alert>
      </Snackbar>

      {/* Modal Hóa đơn sau thanh toán */}
      <ReceiptDialog
        open={receiptOpen}
        onClose={handleReceiptClose}
        saleData={completedSale}
        cartItems={completedCart}
        sellerName={account?.fullName ?? ''}
        completedAt={completedAt}
        receivedAmount={completedPayment.received}
        changeAmount={completedPayment.change}
      />

      <ProductInfoDialog line={infoLine} onClose={() => setInfoLine(null)} />
    </Box>
  );
}
