import { useEffect, useRef, useState } from 'react';
import { Alert, Box, GlobalStyles, Snackbar, useMediaQuery } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import { ordersApi } from 'features/order/api';
import CameraScanDialog from 'features/warehouse/CameraScanDialog';
import useBarcodeScanner from 'features/warehouse/useBarcodeScanner';
import { useCrumbs } from 'layouts/crumbs';
import { cancelTransfer, createSale } from 'services/salesService';
import CartLines from '../components/CartLines';
import CheckoutPanel from '../components/CheckoutPanel';
import DiscountDialog from '../components/DiscountDialog';
import ProductInfoDialog from '../components/ProductInfoDialog';
import ProductSearch from '../components/ProductSearch';
import ReceiptDialog from '../components/ReceiptDialog';
import TransferDialog from '../components/TransferDialog';
import VariantDialog from '../components/VariantDialog';
import { usePosOrders, useSaleProducts, useTransferWatcher } from '../hooks';
import { C, NO_EFFECTS, noEffectStyles } from '../theme';
import { FAMILY_DISCOUNT_PERCENT, isPaid, saleTotals } from '../utils';

const LOCKED = 'Hóa đơn đang chờ chuyển khoản. Mở mã QR để hủy thanh toán chuyển khoản nếu cần sửa hóa đơn.';

export default function InStoreSalesPage() {
  const { account } = useAuth();
  useCrumbs(['Bán hàng tại quầy', 'Bán hàng']);
  const isDesktop = useMediaQuery((theme) => theme.breakpoints.up('lg'));

  const { products, priceRanges, loading, reload } = useSaleProducts();
  const pos = usePosOrders(account?.id);
  const { activeOrder, cart } = pos;
  const locked = Boolean(activeOrder.transfer);
  const { subtotal, discount, total, paid, change } = saleTotals(activeOrder);

  const [notice, setNotice] = useState({ error: '', success: '' });
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [picking, setPicking] = useState(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [infoLine, setInfoLine] = useState(null);
  const [completed, setCompleted] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferWorking, setTransferWorking] = useState(false);

  const showError = (error) => setNotice({ error, success: '' });
  const showSuccess = (success) => setNotice({ error: '', success });

  // Màn hình lớn: khóa cuộn trang, chỉ cuộn trong danh sách hàng
  useEffect(() => {
    if (!isDesktop) return undefined;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prev;
    };
  }, [isDesktop]);

  useEffect(() => {
    reload().catch((err) => setNotice({ error: err.message || 'Không thể tải danh sách sản phẩm.', success: '' }));
  }, [reload]);

  function addTab() {
    showError(pos.addOrder());
  }

  function switchTab(id) {
    pos.setActiveOrderId(id);
    setTransferOpen(Boolean(pos.orders.find((o) => o.id === id).transfer));
    showError('');
  }

  function openTransfer(id) {
    pos.setActiveOrderId(id);
    setTransferOpen(true);
    showError(LOCKED);
  }

  function closeTab(id, e) {
    e?.stopPropagation();
    if (pos.orders.find((o) => o.id === id).transfer) openTransfer(id);
    else if (pos.orders.length <= 1) cancelInvoice();
    else pos.removeOrder(id);
  }

  function cancelInvoice() {
    if (!cart.length) return showError('Hóa đơn đang trống, không có gì để hủy.');
    pos.clearActiveOrder();
    showSuccess('Đã hủy hóa đơn.');
  }

  function pickProduct(product, line) {
    if (locked) return showError(LOCKED);
    showError('');
    setPicking({ product, line });
  }

  async function addScanned(code) {
    if (locked) {
      showError(LOCKED);
      return { ok: false, message: LOCKED };
    }
    try {
      const message = await pos.addScanned(code);
      showSuccess(message);
      return { ok: true, message };
    } catch (err) {
      showError(err.message);
      return { ok: false, message: err.message };
    }
  }

  // Máy quét cắm vào là dùng: bóp cò ở bất kỳ đâu trên trang (trừ khi đang mở hộp thoại khác)
  useBarcodeScanner(addScanned, !picking && !completed && !discountOpen && !cameraOpen && !transferOpen);

  function showReceipt(tabId, sale, received = Number(sale.totalAmount)) {
    setTransferOpen(false);
    pos.removeOrder(tabId);
    setCompleted({ sale, received, change: Math.max(0, received - Number(sale.totalAmount)) });
    reload();
  }

  useTransferWatcher(pos.orders, (tabId, sale) => {
    const order = pos.orders.find((o) => o.id === tabId);
    if (!order) return;
    showSuccess(`${order.label} đã nhận chuyển khoản.`);
    showReceipt(tabId, sale);
  });

  async function createQr(tabId, transfer) {
    try {
      const { bin, accountNumber, accountName } = await ordersApi.createPayOSLink(transfer.orderId);
      pos.setTransfer(tabId, { ...transfer, link: { bin, accountNumber, accountName }, error: '' });
    } catch (err) {
      pos.setTransfer(tabId, { ...transfer, link: null, error: err.message || 'Không tạo được mã QR.' });
    }
  }

  async function runTransfer(action) {
    const tabId = activeOrder.id;
    setTransferWorking(true);
    try {
      await action(tabId, activeOrder.transfer);
    } catch (err) {
      showError(err.message || 'Không thể thực hiện thao tác.');
    } finally {
      setTransferWorking(false);
    }
  }

  const cancelQr = () =>
    runTransfer(async (tabId, transfer) => {
      const sale = await cancelTransfer(transfer.orderId);
      if (isPaid(sale)) {
        showSuccess('Khách đã chuyển khoản thành công nên không hủy được.');
        showReceipt(tabId, sale);
        return;
      }
      pos.reopenOrder(tabId);
      setTransferOpen(false);
      showSuccess('Đã hủy thanh toán chuyển khoản.');
    });

  async function completeSale(paymentMethod) {
    if (!cart.length) return showError('Vui lòng thêm sản phẩm vào hóa đơn.');
    const cash = paymentMethod === 'CASH';
    if (cash && activeOrder.customerPaid !== '' && paid < total) return showError('Tiền khách trả chưa đủ.');
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    showError('');
    const order = activeOrder;
    try {
      const sale = await createSale({
        requestId: order.requestId,
        items: cart.map((line) => ({ detailId: line.variantId, quantity: line.quantity })),
        discountAmount: discount,
        paymentMethod,
        expectedSubtotal: subtotal
      });
      if (isPaid(sale)) {
        showReceipt(order.id, sale, cash && paid > 0 ? paid : undefined);
        return;
      }
      await createQr(order.id, {
        orderId: sale.orderId,
        orderNumber: sale.orderNumber,
        amount: Number(sale.totalAmount)
      });
      setTransferOpen(true);
    } catch (err) {
      if (err.code === 'PRICE_CHANGED') await pos.refreshPrices(order.id);
      showError(err.message || 'Không thể tạo đơn hàng. Vui lòng thử lại.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const message = notice.error || notice.success;

  return (
    <Box
      className={NO_EFFECTS}
      sx={{
        maxWidth: 1600,
        mx: 'auto',
        color: C.text,
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
          gridTemplateRows: { lg: 'minmax(0, 1fr)' },
          gap: 2.5,
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
            locked={locked}
            otherTabsQty={pos.otherTabsQty}
            onInfo={setInfoLine}
            onEdit={(line) => pickProduct({ productId: line.productId, productName: line.name, primaryImageUrl: line.image }, line)}
            onStep={pos.stepLine}
            onSetQuantity={(line, qty) => {
              const error = pos.setLineQuantity(line, qty);
              if (error) showError(error);
            }}
            onRemove={pos.removeLine}
          />
        </Box>

        <CheckoutPanel
          orders={pos.orders}
          activeOrder={activeOrder}
          onSwitch={switchTab}
          onCloseTab={closeTab}
          onAddTab={addTab}
          subtotal={subtotal}
          discountType={activeOrder.discountType}
          discountNumber={Number(activeOrder.discount) || 0}
          discountValue={discount}
          onOpenDiscount={() => setDiscountOpen(true)}
          total={total}
          customerPaid={activeOrder.customerPaid}
          onCustomerPaid={(customerPaid) => pos.updateActiveOrder({ customerPaid })}
          changeAmount={change}
          submitting={submitting}
          onComplete={() => completeSale('CASH')}
          onTransfer={() => completeSale('TRANSFER')}
          onCancel={cancelInvoice}
          onOpenTransfer={() => setTransferOpen(true)}
        />
      </Box>

      <VariantDialog
        target={picking}
        cart={cart}
        otherTabsQty={pos.otherTabsQty}
        onConfirm={(line, editingKey) => {
          pos.putLine(line, editingKey);
          setPicking(null);
        }}
        onError={showError}
        onClose={() => setPicking(null)}
      />

      <DiscountDialog
        open={discountOpen}
        type={activeOrder.discountType}
        value={activeOrder.discount}
        subtotal={subtotal}
        maxPercent={account?.role === 'FAMILY_MEMBER' ? FAMILY_DISCOUNT_PERCENT : null}
        onApply={(discountType, value) => {
          pos.updateActiveOrder({ discount: value, discountType });
          setDiscountOpen(false);
        }}
        onClose={() => setDiscountOpen(false)}
      />

      {cameraOpen && <CameraScanDialog title="Quét mã thêm vào hóa đơn" onDetected={addScanned} onClose={() => setCameraOpen(false)} />}

      <Snackbar
        open={Boolean(message)}
        autoHideDuration={5000}
        onClose={(_, reason) => reason !== 'clickaway' && showError('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ top: { xs: 64, sm: 72 } }}
      >
        <Alert severity={notice.error ? 'error' : 'success'} variant="filled" onClose={() => showError('')} sx={{ width: '100%' }}>
          {message}
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

      {transferOpen && locked && (
        <TransferDialog
          order={activeOrder}
          working={transferWorking}
          onRetry={() => runTransfer((tabId, transfer) => createQr(tabId, transfer))}
          onCancel={cancelQr}
          onClose={() => setTransferOpen(false)}
        />
      )}
    </Box>
  );
}
