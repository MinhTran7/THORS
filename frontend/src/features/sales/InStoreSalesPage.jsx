import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, CircularProgress, Dialog, IconButton, InputAdornment, MenuItem, TextField, Typography } from '@mui/material';
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
import { useCrumbs } from '../../layouts/crumbs';
import ReceiptDialog from './ReceiptDialog';

const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;
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

  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState('Tất cả danh mục');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState(null);

  // Quản lý nhiều tab hóa đơn chờ kiểu Sapo
  const [orders, setOrders] = useState([
    {
      id: 1,
      label: 'Hóa đơn 1',
      cart: [],
      customer: '',
      payment: 'Cash',
      received: '',
      discount: '',
      isEditingDiscount: false
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
  const customer = activeOrder.customer || '';
  const payment = activeOrder.payment || 'Cash';
  const received = activeOrder.received || '';
  const discount = activeOrder.discount || '';
  const isEditingDiscount = Boolean(activeOrder.isEditingDiscount);

  const setCart = (action) => {
    updateActiveOrder((ord) => ({
      ...ord,
      cart: typeof action === 'function' ? action(ord.cart || []) : action
    }));
  };

  const setCustomer = (val) => updateActiveOrder({ customer: val });
  const setPayment = (val) => updateActiveOrder({ payment: val });
  const setReceived = (val) => updateActiveOrder({ received: val });
  const setDiscount = (val) => updateActiveOrder({ discount: val });
  const setIsEditingDiscount = (action) => {
    updateActiveOrder((ord) => ({
      ...ord,
      isEditingDiscount: typeof action === 'function' ? action(Boolean(ord.isEditingDiscount)) : action
    }));
  };

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
      customer: '',
      payment: 'Cash',
      received: '',
      discount: '',
      isEditingDiscount: false
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
  const [loadingVariants, setLoadingVariants] = useState(false);

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Modal hóa đơn sau thanh toán
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [completedCart, setCompletedCart] = useState([]);
  const [completedCustomer, setCompletedCustomer] = useState('');
  const [completedReceived, setCompletedReceived] = useState(0);
  const [completedChange, setCompletedChange] = useState(0);
  const [completedAt, setCompletedAt] = useState(null);

  useEffect(() => {
    getProducts()
      .then((res) => {
        setProducts(getList(res?.data ?? res).filter((p) => isActive(p.status)));
      })
      .catch((err) => setError(err.message || 'Không thể tải danh sách sản phẩm.'))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => ['Tất cả danh mục', ...new Set(products.map((p) => p.categoryName).filter(Boolean))], [products]);

  const visibleProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchesCategory = category === 'Tất cả danh mục' || p.categoryName === category;
      const matchesSearch = [p.productName, p.sku].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword)
      );
      return matchesCategory && matchesSearch;
    });
  }, [products, category, search]);

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

    if (existing && existing.quantity >= stock) {
      setError('Số lượng trong giỏ đã đạt mức tồn kho tối đa.');
      return;
    }

    if (existing) {
      setCart((current) => current.map((line) => (line.key === key ? { ...line, quantity: line.quantity + 1 } : line)));
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
          quantity: 1
        }
      ]);
    }

    closeDialog();
  }

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

  const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const discountValue = Math.min(subtotal, Math.max(0, Number(discount) || 0));
  const total = subtotal - discountValue;
  const receivedValue = Math.max(0, Number(received) || 0);
  const change = Math.max(0, receivedValue - total);

  async function completeSale() {
    setError('');

    if (!cart.length) {
      setError('Vui lòng thêm ít nhất một sản phẩm vào hóa đơn.');
      return;
    }

    const discountNum = Math.round(Number(discount) || 0);

    if (discountNum < 0 || !Number.isInteger(discountNum)) {
      setError('Giảm giá phải là số nguyên dương hợp lệ.');
      return;
    }

    if (discountNum > subtotal) {
      setError('Giảm giá không được vượt quá tổng tiền hàng.');
      return;
    }

    if (payment === 'Cash' && receivedValue < total) {
      setError('Số tiền khách đưa chưa đủ để thanh toán.');
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
          discountAmount: discountNum,
          paymentMethod: payment === 'Cash' ? 'CASH' : 'BANK_TRANSFER',
          customerName: customer.trim() || null
        }
      });

      setCompletedSale(result);
      setCompletedCart([...cart]);
      setCompletedCustomer(customer.trim());
      setCompletedReceived(receivedValue);
      setCompletedChange(payment === 'Cash' ? Math.max(0, receivedValue - total) : 0);
      setCompletedAt(new Date());
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
            customer: '',
            payment: 'Cash',
            received: '',
            discount: '',
            isEditingDiscount: false
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
    updateActiveOrder({
      cart: [],
      discount: '',
      received: '',
      customer: '',
      isEditingDiscount: false
    });
    setError('');
  }

  function handleReceiptClose() {
    setReceiptOpen(false);
    setCompletedSale(null);
    setCompletedCart([]);
    setCompletedCustomer('');
    setCompletedReceived(0);
    setCompletedChange(0);
    setCompletedAt(null);
    setCustomer('');
    setPayment('Cash');
  }

  return (
    <Box sx={{ maxWidth: 1600, mx: 'auto', color: '#0F172A', pb: 4 }}>
      {/* ─── TIÊU ĐỀ TRÊN CÙNG ─── */}
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="h3" sx={{ fontWeight: 800, color: '#0F172A', fontSize: { xs: 22, sm: 26 } }}>
          Bán hàng tại quầy
        </Typography>
      </Box>

      {/* ─── BỐ CỤC CHÍNH (2 CỘT) ─── */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1fr 390px' },
          gap: 2.5,
          alignItems: 'start'
        }}
      >
        {/* CỘT TRÁI: TÌM KIẾM, BỘ LỌC & DANH SÁCH SẢN PHẨM */}
        <Box>
          {/* Thanh tìm kiếm & Dropdown danh mục */}
          <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Tìm theo tên sản phẩm hoặc mã SKU"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined style={{ color: '#94A3B8', fontSize: 16 }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <ScanOutlined style={{ color: '#64748B', fontSize: 18, cursor: 'pointer' }} />
                  </InputAdornment>
                )
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

            <TextField
              select
              size="small"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              sx={{
                minWidth: { xs: 150, sm: 200 },
                bgcolor: '#FFFFFF',
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2.5,
                  height: 42,
                  '& fieldset': { borderColor: '#E2E8F0' },
                  '&:hover fieldset': { borderColor: '#8EECF5' },
                  '&.Mui-focused fieldset': { borderColor: '#8EECF5' }
                }
              }}
            >
              {categories.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {/* Lưới sản phẩm */}
          {loading ? (
            <Box sx={{ py: 10, textAlign: 'center' }}>
              <CircularProgress size={36} sx={{ color: '#8EECF5' }} />
            </Box>
          ) : !visibleProducts.length ? (
            <Box sx={{ py: 10, textAlign: 'center', bgcolor: '#FFFFFF', borderRadius: 3, border: '1px solid #E2E8F0' }}>
              <Typography sx={{ color: '#64748B', fontSize: 14 }}>Không tìm thấy sản phẩm phù hợp.</Typography>
            </Box>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, 1fr)',
                  md: 'repeat(3, 1fr)',
                  lg: 'repeat(4, 1fr)'
                },
                gap: 2
              }}
            >
              {visibleProducts.map((product) => {
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
                    onClick={() => addProduct(product)}
                    sx={{
                      bgcolor: '#FFFFFF',
                      borderRadius: 2,
                      border: '1px solid #E2E8F0',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        borderColor: '#8EECF5',
                        boxShadow: '0 2px 8px rgba(142, 236, 245, 0.25)',
                        transform: 'translateY(-1px)'
                      }
                    }}
                  >
                    {/* Hình ảnh sản phẩm */}
                    <Box
                      sx={{
                        width: '100%',
                        height: 100,
                        bgcolor: '#F8FAFC',
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden'
                      }}
                    >
                      {/* Badge Tồn kho góc trên bên trái */}
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 5,
                          left: 5,
                          zIndex: 2,
                          bgcolor: isOut ? '#F1F5F9' : '#FFFFFF',
                          color: isOut ? '#94A3B8' : '#334155',
                          border: '1px solid #E2E8F0',
                          borderRadius: 99,
                          px: 0.85,
                          py: 0.15,
                          fontSize: 9.5,
                          fontWeight: 700,
                          boxShadow: isOut ? 'none' : '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                      >
                        {isOut ? 'Hết hàng' : `Tồn: ${stock}`}
                      </Box>

                      {image ? (
                        <Box
                          component="img"
                          src={image}
                          alt={product.productName}
                          sx={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover'
                          }}
                        />
                      ) : (
                        <ShoppingCartOutlined style={{ fontSize: 24, color: '#CBD5E1' }} />
                      )}
                    </Box>

                    {/* Tên & Giá sản phẩm */}
                    <Box sx={{ px: 1, py: 0.75, display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                      <Typography
                        sx={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: '#0F172A',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          lineHeight: 1.25,
                          mb: 0.25,
                          letterSpacing: '-0.15px'
                        }}
                        title={product.productName}
                      >
                        {product.productName}
                      </Typography>

                      <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#0F172A' }}>{priceText}</Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>

        {/* CỘT PHẢI: HÓA ĐƠN HIỆN TẠI & TABS HÓA ĐƠN KIỂU SAPO */}
        <Box
          sx={{
            bgcolor: '#FFFFFF',
            borderRadius: 3.5,
            border: '1px solid #E2E8F0',
            p: { xs: 2, sm: 2.5 },
            boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
            position: 'sticky',
            top: 20
          }}
        >
          {/* Thanh danh sách tab hóa đơn chờ kiểu Sapo */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 2, overflowX: 'auto', pb: 0.5 }}>
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
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
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

          {/* Danh sách món hàng trong giỏ */}
          <Box
            sx={{
              minHeight: 180,
              maxHeight: 280,
              overflowY: 'auto',
              scrollbarGutter: 'stable',
              pr: 0.5,
              mb: 2,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {!cart.length ? (
              <Box
                sx={{
                  flex: 1,
                  minHeight: 180,
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
                <Typography sx={{ fontSize: 11.5, color: '#94A3B8', mt: 0.25 }}>Chọn sản phẩm bên trái để thêm vào hóa đơn</Typography>
              </Box>
            ) : (
              cart.map((line) => (
                <Box key={line.key} sx={{ py: 1.5, borderBottom: '1px solid #F1F5F9' }}>
                  <Box sx={{ display: 'flex', gap: 1.25 }}>
                    {/* Thumbnail */}
                    <Box
                      component="img"
                      src={line.image || ''}
                      alt={line.name}
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: 2,
                        objectFit: 'cover',
                        bgcolor: '#F8FAFC',
                        flexShrink: 0,
                        border: '1px solid #E2E8F0'
                      }}
                    />

                    {/* Chi tiết tên & biến thể */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Typography
                          sx={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: '#0F172A',
                            lineHeight: 1.3,
                            pr: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {line.name}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={() => setCart((prev) => prev.filter((item) => item.key !== line.key))}
                          sx={{ p: 0.25, color: '#94A3B8', '&:hover': { color: '#EF4444' } }}
                        >
                          <CloseOutlined style={{ fontSize: 11 }} />
                        </IconButton>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25, flexWrap: 'wrap' }}>
                        {(line.size || line.color) && (
                          <Typography sx={{ fontSize: 11.5, color: '#64748B' }}>
                            {[line.size, line.color].filter(Boolean).join(' · ')}
                          </Typography>
                        )}
                        {(line.size || line.color) && <Typography sx={{ fontSize: 11.5, color: '#CBD5E1' }}>•</Typography>}
                        <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: '#475569' }}>Đơn giá: {money(line.price)}</Typography>
                      </Box>

                      {/* Tăng giảm số lượng & Thành tiền dòng */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                        <Box
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            border: '1px solid #E2E8F0',
                            borderRadius: 1.5,
                            bgcolor: '#FFFFFF'
                          }}
                        >
                          <IconButton size="small" onClick={() => updateQuantity(line.key, -1)} sx={{ p: 0.5, borderRadius: 1 }}>
                            <MinusOutlined style={{ fontSize: 10, color: '#475569' }} />
                          </IconButton>
                          <Typography sx={{ minWidth: 26, textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>
                            {line.quantity}
                          </Typography>
                          <IconButton
                            size="small"
                            disabled={line.quantity >= line.stock}
                            onClick={() => updateQuantity(line.key, 1)}
                            sx={{ p: 0.5, borderRadius: 1 }}
                          >
                            <PlusOutlined style={{ fontSize: 10, color: '#475569' }} />
                          </IconButton>
                        </Box>

                        <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>
                          {money(line.price * line.quantity)}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>
              ))
            )}
          </Box>

          {/* Tổng tiền hàng & Giảm giá */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, py: 1.5, borderTop: '1px solid #F1F5F9' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography sx={{ fontSize: 13, color: '#64748B' }}>Tổng tiền hàng</Typography>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>{money(subtotal)}</Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography sx={{ fontSize: 13, color: '#64748B' }}>Giảm giá</Typography>
                <IconButton
                  size="small"
                  onClick={() => setIsEditingDiscount((prev) => !prev)}
                  sx={{ p: 0.25, color: '#64748B', '&:hover': { color: '#0F172A' } }}
                >
                  <EditOutlined style={{ fontSize: 12 }} />
                </IconButton>
              </Box>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: discountValue > 0 ? '#10B981' : '#0F172A' }}>
                {discountValue > 0 ? `-${money(discountValue)}` : '-0 đ'}
              </Typography>
            </Box>

            {isEditingDiscount && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                <TextField
                  size="small"
                  type="number"
                  placeholder="Số tiền giảm (₫)"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  inputProps={{ min: 0, max: subtotal }}
                  sx={{
                    flex: 1,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      height: 36,
                      fontSize: 12.5
                    }
                  }}
                />
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => setIsEditingDiscount(false)}
                  sx={{
                    bgcolor: '#8EECF5',
                    color: '#0F172A',
                    fontWeight: 700,
                    height: 36,
                    borderRadius: 2,
                    boxShadow: 'none',
                    textTransform: 'none',
                    '&:hover': { bgcolor: '#76DCED' }
                  }}
                >
                  Xong
                </Button>
              </Box>
            )}

            {/* Tổng phải trả */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                pt: 1,
                mt: 0.5,
                borderTop: '1px dashed #E2E8F0'
              }}
            >
              <Typography sx={{ fontSize: 14.5, fontWeight: 800, color: '#0F172A' }}>Tổng phải trả</Typography>
              <Typography sx={{ fontSize: 24, fontWeight: 800, color: '#0F172A' }}>{money(total)}</Typography>
            </Box>
          </Box>

          {/* Phương thức thanh toán */}
          <Box sx={{ mt: 2 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#334155', mb: 1 }}>Phương thức thanh toán</Typography>
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
                  height: 40,
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
                  height: 40,
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
          </Box>

          {/* Tiền khách đưa & Tiền thừa trả khách (khi chọn Tiền mặt) */}
          {payment === 'Cash' && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1.25,
                mt: 2,
                p: 1.5,
                bgcolor: '#F8FAFC',
                borderRadius: 2.5,
                border: '1px solid #E2E8F0'
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontSize: 13, color: '#475569' }}>Tiền khách đưa</Typography>
                <TextField
                  size="small"
                  type="number"
                  placeholder="0"
                  value={received}
                  onChange={(e) => setReceived(e.target.value)}
                  inputProps={{ min: 0, style: { textAlign: 'right', fontWeight: 700, fontSize: 13.5 } }}
                  sx={{
                    width: 140,
                    bgcolor: '#FFFFFF',
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      height: 34
                    }
                  }}
                />
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontSize: 13, color: '#475569' }}>Tiền thừa trả khách</Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>{money(change)}</Typography>
              </Box>
            </Box>
          )}

          {/* Thông báo lỗi nếu có */}
          {error && (
            <Typography
              sx={{
                color: '#DC2626',
                fontSize: 12,
                fontWeight: 600,
                textAlign: 'center',
                mt: 1.5,
                bgcolor: '#FEF2F2',
                py: 0.75,
                px: 1.5,
                borderRadius: 2,
                border: '1px solid #FEE2E2'
              }}
            >
              {error}
            </Typography>
          )}

          {/* Nút Hoàn tất thanh toán */}
          <Button
            fullWidth
            variant="contained"
            onClick={completeSale}
            disabled={!cart.length || submitting}
            startIcon={!submitting && <CheckOutlined />}
            sx={{
              mt: error ? 1.5 : 2.5,
              bgcolor: '#8EECF5',
              color: '#0F172A',
              fontWeight: 800,
              fontSize: 14,
              height: 44,
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

          {/* Nút Xóa hóa đơn */}
          {cart.length > 0 && (
            <Box sx={{ textAlign: 'center', mt: 1.5 }}>
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
          )}
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
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography sx={{ fontSize: 16.5, fontWeight: 800, color: '#0F172A' }}>Chọn biến thể sản phẩm</Typography>
            <IconButton
              onClick={closeDialog}
              size="small"
              sx={{
                p: 0.5,
                bgcolor: '#F1F5F9',
                color: '#64748B',
                '&:hover': { bgcolor: '#E2E8F0' }
              }}
            >
              <CloseOutlined style={{ fontSize: 12 }} />
            </IconButton>
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
                          fontWeight: isSelected ? 800 : 500,
                          bgcolor: '#FFFFFF',
                          color: !hasStock ? '#CBD5E1' : isSelected ? '#0F172A' : '#475569',
                          border: isSelected ? '2px solid #0F172A' : '1.5px solid #E2E8F0',
                          cursor: hasStock ? 'pointer' : 'not-allowed',
                          opacity: hasStock ? 1 : 0.4,
                          outline: 'none',
                          transition: 'none',
                          '&:hover': hasStock
                            ? {
                                borderColor: isSelected ? '#0F172A' : '#94A3B8'
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
              <Box sx={{ mt: 2, mb: 2.25 }}>
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
                          fontWeight: isSelected ? 800 : 500,
                          bgcolor: '#FFFFFF',
                          color: !inStock ? '#CBD5E1' : isSelected ? '#0F172A' : '#475569',
                          border: isSelected ? '2px solid #0F172A' : '1.5px solid #E2E8F0',
                          cursor: inStock ? 'pointer' : 'not-allowed',
                          opacity: inStock ? 1 : 0.4,
                          outline: 'none',
                          transition: 'none',
                          '&:hover': inStock
                            ? {
                                borderColor: isSelected ? '#0F172A' : '#94A3B8'
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
                    {selectedVariant ? 'Thành tiền · 1 sản phẩm' : 'Giá sản phẩm'}
                  </Typography>
                  <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#0F172A', mt: 0.25 }}>
                    {selectedVariant ? money(getPrice(selectedVariant)) : priceRange}
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

      {/* Modal Hóa đơn sau thanh toán */}
      <ReceiptDialog
        open={receiptOpen}
        onClose={handleReceiptClose}
        saleData={completedSale}
        cartItems={completedCart}
        customerName={completedCustomer}
        sellerName={account?.fullName ?? ''}
        amountReceived={completedReceived}
        changeDue={completedChange}
        completedAt={completedAt}
      />
    </Box>
  );
}
