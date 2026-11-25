import { useEffect, useRef, useState } from 'react';
import { Alert, Box, GlobalStyles, Snackbar, useMediaQuery } from '@mui/material';
import { getProducts } from '../../services/productService';
import { createSale, getPriceRanges, getVariantSales } from '../../services/salesService';
import { useAuth } from '../auth/AuthProvider';
// Quét mã vạch (phần kho/mã vạch): máy quét USB/Bluetooth, ô tìm kiếm hoặc camera → thêm vào hóa đơn.
import useBarcodeScanner from '../warehouse/useBarcodeScanner';
import { addScannedLine, scanToCartLine } from '../warehouse/scanToCart';
import CameraScanDialog from '../warehouse/CameraScanDialog';
import { useCrumbs } from '../../layouts/crumbs';
import usePosOrders from './usePosOrders';
import ProductSearch from './ProductSearch';
import CartLines from './CartLines';
import CheckoutPanel from './CheckoutPanel';
import VariantDialog from './VariantDialog';
import DiscountDialog from './DiscountDialog';
import ReceiptDialog from './ReceiptDialog';
import ProductInfoDialog from './ProductInfoDialog';
import { FAMILY_DISCOUNT_PERCENT, NO_EFFECTS } from './salesFormat';

const noEffectStyles = {
  [`.${NO_EFFECTS} .MuiButtonBase-root, .${NO_EFFECTS} .MuiButtonBase-root::after`]: { transition: 'none !important' },
  [`.${NO_EFFECTS} .MuiButton-root:active::after`]: { opacity: '0 !important' },
  [`.${NO_EFFECTS} .MuiIconButton-root:hover, .${NO_EFFECTS} .MuiButton-text:hover`]: { backgroundColor: 'transparent !important' }
};

const isActive = (value) => String(value ?? '').toUpperCase() === 'ACTIVE';
const variantSalesOf = (productId) => getVariantSales(productId).catch(() => ({}));

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
  const [priceRanges, setPriceRanges] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [picking, setPicking] = useState(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [infoLine, setInfoLine] = useState(null);
  // Hóa đơn vừa bán: { sale, received, change }
  const [completed, setCompleted] = useState(null);

  const {
    restoredOrders,
    orders,
    ordersRef,
    activeOrder,
    cart,
    setActiveOrderId,
    updateOrder,
    updateActiveOrder,
    setCart,
    otherTabsQty,
    syncStock,
    addOrder,
    removeOrder,
    clearActiveOrder
  } = usePosOrders(account?.id);

  const { payment, discount, discountType, customerPaid } = activeOrder;
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const discountNumber = Math.max(0, Number(discount) || 0);
  const discountValue =
    discountType === 'percent'
      ? Math.round((subtotal * Math.min(100, discountNumber)) / 100)
      : Math.min(subtotal, Math.round(discountNumber));
  const total = subtotal - discountValue;
  const rawPaidNumber = Number(String(customerPaid || '').replace(/\D/g, '')) || 0;
  const changeAmount = customerPaid === '' ? 0 : Math.max(0, rawPaidNumber - total);

  useEffect(() => {
    reloadProducts((err) => setError(err.message || 'Không thể tải danh sách sản phẩm.')).finally(() => setLoading(false));
    restoredOrders.filter((o) => o.cart.length).forEach((o) => refreshCartPrices(o.id));
  }, []);

  function reloadProducts(onError = () => {}) {
    getPriceRanges()
      .then(setPriceRanges)
      .catch(() => setPriceRanges({}));
    return getProducts()
      .then((res) => setProducts(res.filter((p) => isActive(p.status))))
      .catch(onError);
  }

  // ---- Hóa đơn chờ ----

  function addOrderTab() {
    setError(addOrder());
  }

  function switchOrderTab(id) {
    setActiveOrderId(id);
    setError('');
  }

  function closeOrderTab(id, e) {
    e?.stopPropagation();
    if (orders.length <= 1) {
      cancelInvoice();
      return;
    }
    removeOrder(id);
  }

  function cancelInvoice() {
    if (!cart.length) {
      setError('Hóa đơn đang trống, không có gì để hủy.');
      return;
    }
    clearActiveOrder();
    setError('');
    setSuccess('Đã hủy hóa đơn.');
  }

  // ---- Thêm, sửa dòng hàng ----

  function pickProduct(product, line) {
    setError('');
    setPicking({ product, line });
  }

  // Sửa dòng: bỏ dòng cũ, gộp vào dòng cùng biến thể nếu có, nếu không thì thay đúng vị trí
  function confirmVariant(newLine, editingKey) {
    syncStock(newLine.key, newLine.stock);
    setCart((current) => {
      const existing = current.find((line) => line.key === newLine.key && line.key !== editingKey);
      const rest = current.filter((line) => line.key !== editingKey);
      if (existing)
        return rest.map((line) => (line.key === newLine.key ? { ...line, quantity: existing.quantity + newLine.quantity } : line));
      return editingKey ? current.map((line) => (line.key === editingKey ? newLine : line)) : [...current, newLine];
    });
    setPicking(null);
  }

  function stepQuantity(key, delta) {
    setCart((current) =>
      current
        .map((line) => {
          if (line.key !== key) return line;
          const quantity = line.quantity + delta;
          if (quantity <= 0) return null;
          return { ...line, quantity: delta > 0 ? Math.min(quantity, line.stock - otherTabsQty(key)) : quantity };
        })
        .filter(Boolean)
    );
  }

  function setLineQuantity(line, qty) {
    if (qty === 0) {
      setCart((current) => current.filter((item) => item.key !== line.key));
      return;
    }
    const others = otherTabsQty(line.key);
    const max = Math.max(1, line.stock - others);
    if (qty > max)
      setError(
        `${line.name} · ${line.color} · ${line.size}: chỉ còn ${line.stock} trong kho${others ? `, hóa đơn chờ khác đang giữ ${others}` : ''}.`
      );
    setCart((current) => current.map((item) => (item.key === line.key ? { ...item, quantity: Math.min(qty, max) } : item)));
  }

  // ---- Quét mã vạch → thêm vào hóa đơn đang mở (quét lại cùng mã thì +1, không vượt tồn kho) ----

  async function addScanned(code) {
    setError('');
    setSuccess('');
    try {
      const line = await scanToCartLine(code);
      const sale = (await variantSalesOf(line.productId))[line.variantId];
      line.originalPrice = line.price;
      line.price = Number(sale?.price ?? line.price);
      line.stock = sale?.available ?? line.stock;
      syncStock(line.key, line.stock);
      const inThis = cartRef.current.find((item) => item.key === line.key)?.quantity ?? 0;
      const others = otherTabsQty(line.key);
      if (others && inThis + others >= line.stock) {
        const message = `${line.name} · ${line.color} · ${line.size}: đã đủ ${line.stock} (hết tồn kho), hóa đơn chờ khác đang giữ ${others}.`;
        setError(message);
        return { ok: false, message };
      }
      const result = addScannedLine(cartRef.current, line);
      if (result.error) {
        setError(result.error);
        return { ok: false, message: result.error };
      }
      cartRef.current = result.cart;
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
  useBarcodeScanner(addScanned, !picking && !completed && !discountOpen && !cameraOpen);

  // ---- Thanh toán ----

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

    const order = activeOrder;
    try {
      const sale = await createSale({
        requestId: order.requestId,
        items: cart.map((line) => ({ detailId: line.variantId, quantity: line.quantity })),
        discountAmount: discountValue,
        paymentMethod: payment === 'Cash' ? 'CASH' : 'BANK_TRANSFER',
        expectedSubtotal: subtotal
      });
      const cash = payment === 'Cash';
      setCompleted({
        sale,
        received: cash && rawPaidNumber > 0 ? rawPaidNumber : Number(sale.totalAmount),
        change: cash ? changeAmount : 0
      });
      removeOrder(order.id);
      reloadProducts();
    } catch (err) {
      if (err.code === 'PRICE_CHANGED') await refreshCartPrices(order.id);
      setError(err.message || 'Không thể tạo đơn hàng. Vui lòng thử lại.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  // Lấy lại giá sau khuyến mãi và số lượng còn bán được cho các sản phẩm trong hóa đơn
  async function refreshCartPrices(orderId) {
    const ids = [...new Set((ordersRef.current.find((o) => o.id === orderId)?.cart ?? []).map((line) => line.productId))];
    const sales = Object.assign({}, ...(await Promise.all(ids.map(variantSalesOf))));
    updateOrder(orderId, (o) => ({
      ...o,
      cart: o.cart.map((line) => {
        const sale = sales[line.variantId];
        return sale ? { ...line, price: Number(sale.price), stock: sale.available } : line;
      })
    }));
  }

  return (
    <Box
      className={NO_EFFECTS}
      sx={{
        maxWidth: 1600,
        mx: 'auto',
        color: '#0F172A',
        display: { lg: 'flex' },
        flexDirection: 'column',
        height: { lg: 'calc(100vh - 135px)' }
      }}
    >
      <GlobalStyles styles={noEffectStyles} />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 390px' },
          gap: 2.5,
          gridTemplateRows: { lg: 'minmax(0, 1fr)' },
          flex: 1,
          minHeight: 0
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <ProductSearch
            products={products}
            priceRanges={priceRanges}
            loading={loading}
            onPick={pickProduct}
            onScan={addScanned}
            onOpenCamera={() => setCameraOpen(true)}
          />
          <CartLines
            cart={cart}
            otherTabsQty={otherTabsQty}
            onInfo={setInfoLine}
            onEdit={(line) => pickProduct({ productId: line.productId, productName: line.name, primaryImageUrl: line.image }, line)}
            onStep={stepQuantity}
            onSetQuantity={setLineQuantity}
            onRemove={(key) => setCart((current) => current.filter((item) => item.key !== key))}
          />
        </Box>

        <CheckoutPanel
          orders={orders}
          activeOrder={activeOrder}
          onSwitch={switchOrderTab}
          onCloseTab={closeOrderTab}
          onAddTab={addOrderTab}
          subtotal={subtotal}
          discountType={discountType}
          discountNumber={discountNumber}
          discountValue={discountValue}
          onOpenDiscount={() => setDiscountOpen(true)}
          total={total}
          payment={payment}
          onPayment={(value) => updateActiveOrder({ payment: value })}
          customerPaid={customerPaid}
          onCustomerPaid={(value) => updateActiveOrder({ customerPaid: value })}
          changeAmount={changeAmount}
          submitting={submitting}
          onComplete={completeSale}
          onCancel={cancelInvoice}
        />
      </Box>

      <VariantDialog
        target={picking}
        cart={cart}
        otherTabsQty={otherTabsQty}
        onConfirm={confirmVariant}
        onError={setError}
        onClose={() => setPicking(null)}
      />

      <DiscountDialog
        open={discountOpen}
        type={discountType}
        value={discount}
        subtotal={subtotal}
        maxPercent={account?.role === 'FAMILY_MEMBER' ? FAMILY_DISCOUNT_PERCENT : null}
        onApply={(type, value) => {
          updateActiveOrder({ discount: value, discountType: type });
          setDiscountOpen(false);
        }}
        onClose={() => setDiscountOpen(false)}
      />

      {cameraOpen && <CameraScanDialog title="Quét mã thêm vào hóa đơn" onDetected={addScanned} onClose={() => setCameraOpen(false)} />}

      <Snackbar
        open={Boolean(error || success)}
        autoHideDuration={5000}
        onClose={(_, reason) => {
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

      <ReceiptDialog
        open={Boolean(completed)}
        onClose={() => setCompleted(null)}
        sale={completed?.sale}
        receivedAmount={completed?.received}
        changeAmount={completed?.change}
      />

      <ProductInfoDialog line={infoLine} onClose={() => setInfoLine(null)} />
    </Box>
  );
}
