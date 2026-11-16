import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import useSWR, { useSWRConfig } from 'swr';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { QrcodeOutlined, RollbackOutlined, ShoppingOutlined } from '@ant-design/icons';
import { Stack } from 'features/account/components/Flex';
import { useCrumbs } from 'layouts/crumbs';
import { useAuth } from 'features/auth/AuthProvider';
import { STORE_NAME } from 'features/account/constants';
import { formatLogDate, formatTime } from 'features/account/format';
import { brand, cardSx } from 'features/account/tokens';
import { OutlineButton } from 'features/account/components/Brand';
import { StatusPill } from 'features/account/components/Chips';
import { bodyCellSx, headCellSx, NoticeBox, PageHeader } from 'features/account/components/Blocks';
import { FINAL_STATUSES, LIVE_INTERVAL, LIVE_SWR, ordersApi, refreshAllOrders } from './api';
import { CUSTOMER_ACTIONS, OWNER_ACTIONS, carrierLabel, ownerActionsFor } from './orderActions';
import AddressNotFoundDialog, { ADDRESS_NOT_FOUND, INVALID_ADDRESS_REASON } from './AddressNotFoundDialog';
import DeliveryChoice from './DeliveryChoice';
import { ghnReady } from './GhnAddressFields';
import { formatVnd, orderStatusMeta, paymentMethodLabel, paymentStatusMeta, preparationMeta, shipmentStatusLabel } from './constants';
import PayOSPaymentModal from './components/PayOSPaymentModal';
import RefundAccountForm, { initialRefundAccount, validateRefundAccount } from './components/RefundAccountForm';
import { generateVietQrUrl } from 'utils/vietqr';

// "Vietcombank · 0123456789 · NGUYEN VAN A"
const accountText = (a) => [a?.bankName || a?.bankBin, a?.accountNumber, a?.accountName].filter(Boolean).join(' · ');

/** Owner: nhập giúp / sửa tài khoản nhận hoàn của khách (khi khách báo qua điện thoại). */
function OwnerRefundAccount({ order, onSave }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => initialRefundAccount(order.refundAccount || order.payerAccount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const problem = validateRefundAccount(form);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(form);
      setOpen(false);
    } catch (e) {
      setError(e.message || 'Không lưu được tài khoản nhận tiền hoàn.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button size="small" onClick={() => setOpen(true)} sx={{ mt: 1, textTransform: 'none', fontWeight: 600 }}>
        {order.refundAccount ? 'Sửa tài khoản nhận hoàn' : 'Nhập tài khoản nhận hoàn của khách'}
      </Button>
    );
  }
  return (
    <Box sx={{ mt: 1.5, p: 2, border: `1px solid ${brand.line}`, borderRadius: 2 }}>
      <RefundAccountForm value={form} onChange={setForm} disabled={saving} />
      {error && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1.5 }}>
        <Button size="small" disabled={saving} onClick={() => setOpen(false)}>
          Hủy
        </Button>
        <Button size="small" variant="contained" disableElevation disabled={saving} onClick={save}>
          {saving ? 'Đang lưu…' : 'Lưu và tạo mã QR'}
        </Button>
      </Box>
    </Box>
  );
}

/**
 * Khách: tài khoản nhận tiền hoàn khi đơn đang "Chờ hoàn tiền". Trên trang chỉ một dòng + nút;
 * form nhập mở trong hộp thoại (cùng kiểu hộp "Hủy đơn") để trang gọn.
 */
function CustomerRefundBox({ order, onSave }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => initialRefundAccount(order.refundAccount || order.payerAccount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openDialog = () => {
    setForm(initialRefundAccount(order.refundAccount || order.payerAccount));
    setError('');
    setOpen(true);
  };

  const save = async () => {
    const problem = validateRefundAccount(form);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(form);
      setOpen(false);
    } catch (e) {
      setError(e.message || 'Không lưu được tài khoản nhận tiền hoàn.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Box sx={{ mt: 1, fontSize: 14, color: C.muted }}>
        {order.refundAccount ? (
          <>
            Nhận tiền hoàn vào: <strong>{accountText(order.refundAccount)}</strong>
          </>
        ) : (
          'Bạn chưa gửi tài khoản nhận tiền hoàn.'
        )}{' '}
        <Button size="small" onClick={openDialog} sx={{ textTransform: 'none', fontWeight: 700, color: C.accent }}>
          {order.refundAccount ? 'Sửa' : 'Nhập tài khoản'}
        </Button>
      </Box>

      <Dialog
        open={open}
        onClose={() => !saving && setOpen(false)}
        fullWidth
        maxWidth="xs"
        slotProps={{
          paper: {
            sx: {
              ...storeDialogPaperSx,
              ...storeInputsSx,
              '& .MuiButton-root': { borderRadius: '14px', fontFamily: SANS, textTransform: 'none', fontWeight: 700 }
            }
          }
        }}
      >
        <DialogTitle>Tài khoản nhận tiền hoàn</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: C.muted, mb: 2 }}>
            Cửa hàng sẽ chuyển trả {formatVnd(order.totalAmount)} vào tài khoản này.
          </Typography>
          <RefundAccountForm
            value={form}
            onChange={setForm}
            disabled={saving}
            prefilled={!order.refundAccount && Boolean(order.payerAccount)}
          />
          {error && (
            <Typography color="error" variant="body2" sx={{ mt: 1 }}>
              {error}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button disabled={saving} onClick={() => setOpen(false)}>
            Quay lại
          </Button>
          <Button variant="contained" disableElevation disabled={saving} onClick={save}>
            {saving ? 'Đang lưu…' : 'Gửi tài khoản'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
import CustomerReturnDialog from '../returns/CustomerReturnDialog';
import {
  C,
  SANS,
  SERIF,
  StatusText,
  StoreThumb,
  dangerBtnSx,
  eyebrowSx as storeEyebrowSx,
  pageTitleSx,
  panelSx,
  panelTitleSx,
  storeBtnSx,
  storeDialogPaperSx,
  storeInputsSx
} from './storeStyle';
import { StoreCrumb } from 'features/account/components/StoreAccount';

const dateTime = (value) => (value ? `${formatLogDate(value)} · ${formatTime(value)}` : null);

// Các bước khách thấy trên thanh tiến trình, và số bước đã xong theo trạng thái đơn
const STEP_LABELS = ['Đặt hàng', 'Xác nhận', 'Vận chuyển', 'Đã giao', 'Hoàn thành'];
const COMPLETED_STEPS = { AWAITING_PAYMENT: 0, PENDING_CONFIRMATION: 1, AWAITING_PICKUP: 2, SHIPPING: 3, DELIVERED: 4, COMPLETED: 5 };
const CLOSED = ['CANCELLED', 'REJECTED', 'EXPIRED'];

// Nhãn của bước đang chờ, để khách không hiểu nhầm là bước đó đã xong
const CURRENT_STEP_LABEL = {
  AWAITING_PAYMENT: 'Chờ thanh toán',
  PENDING_CONFIRMATION: 'Chờ xác nhận',
  AWAITING_PICKUP: 'Chờ lấy hàng',
  SHIPPING: 'Đang giao',
  DELIVERED: 'Chờ hoàn tất'
};

function customerHint(order) {
  const self = order.shipment?.carrier === 'SELF';
  switch (order.orderStatus) {
    case 'AWAITING_PAYMENT':
      return 'Vui lòng thanh toán để cửa hàng xử lý đơn hàng.';
    case 'PENDING_CONFIRMATION':
      return 'Cửa hàng đang xem xét đơn hàng của bạn.';
    case 'AWAITING_PICKUP':
      return order.shipment?.trackingNumber ? 'Cửa hàng đã gửi đơn cho đơn vị vận chuyển, đang chờ đến lấy hàng.' : 'Cửa hàng đang chuẩn bị hàng.';
    case 'SHIPPING':
      return self ? 'Cửa hàng đang giao hàng đến bạn.' : 'Đơn vị vận chuyển đang giao hàng đến bạn.';
    case 'DELIVERED':
      return 'Nếu đã nhận đủ hàng, hãy bấm "Đã nhận hàng". Đơn sẽ tự hoàn tất sau 7 ngày kể từ khi giao.';
    case 'COMPLETED':
      return `Cảm ơn bạn đã mua hàng tại ${STORE_NAME}.`;
    default:
      return null;
  }
}

function Section({ title, children }) {
  return (
    <Box sx={{ ...cardSx, p: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: brand.ink, mb: 1.5 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function Info({ label, children }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ py: 0.9 }}>
      <Typography variant="body1" sx={{ color: brand.muted, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body1" component="div" sx={{ color: brand.ink, textAlign: 'right', wordBreak: 'break-word' }}>
        {children ?? '—'}
      </Typography>
    </Stack>
  );
}

function Amount({ label, value, negative = false, strong = false }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ py: 0.75 }}>
      <Typography variant="body1" sx={{ color: strong ? brand.ink : brand.muted, fontWeight: strong ? 700 : 400 }}>
        {label}
      </Typography>
      <Typography variant="body1" sx={{ color: brand.ink, fontWeight: strong ? 700 : 500, fontSize: strong ? 22 : undefined }}>
        {negative ? '− ' : ''}
        {formatVnd(value)}
      </Typography>
    </Stack>
  );
}

function ActionButtons({ actions, busy, onAction }) {
  return actions.map((action) =>
    action.primary ? (
      <Button key={action.to} variant="contained" disableElevation disabled={busy} onClick={() => onAction(action)}>
        {action.label}
      </Button>
    ) : (
      <OutlineButton key={action.to} disabled={busy} onClick={() => onAction(action)}>
        {action.label}
      </OutlineButton>
    )
  );
}

/* ------------------------------------------------------------------ Khách hàng (giao diện cửa hàng) */

function StorePanel({ title, children, sx }) {
  return (
    <Box component="section" sx={{ ...panelSx, p: { xs: 2.5, sm: 3.5 }, ...sx }}>
      <Box component="h2" sx={panelTitleSx}>
        {title}
      </Box>
      {children}
    </Box>
  );
}

function StoreRow({ label, children, strong = false }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2, py: 0.9, fontSize: 14 }}>
      <Box component="span" sx={{ color: strong ? C.ink : C.muted, fontWeight: strong ? 600 : 400, flexShrink: 0 }}>
        {label}
      </Box>
      <Box component="span" sx={{ textAlign: 'right', wordBreak: 'break-word', ...(strong ? { fontFamily: SERIF, fontSize: 26 } : {}) }}>
        {children ?? '—'}
      </Box>
    </Box>
  );
}

function CustomerView({ order, status, actions, busy, onAction, actionError, onPayNow, payLoading, payError, onOpenReturn, back, onSaveRefund }) {
  const payment = paymentStatusMeta(order.paymentStatus);
  const closed = CLOSED.includes(order.orderStatus);
  const completed = COMPLETED_STEPS[order.orderStatus] ?? 0;
  const shipment = order.shipment;
  const times = [order.orderDate, order.confirmedAt, shipment?.pickedUpAt, shipment?.deliveredAt, null];
  const hint = customerHint(order);
  const canReturn = ['DELIVERED', 'COMPLETED'].includes(order.orderStatus);
  const canPay = order.paymentMethod === 'ONLINE' && order.paymentStatus !== 'PAID' && !closed;

  return (
    <Box>
      {/* Đầu trang: quay lại, mã đơn, trạng thái */}
      <StoreCrumb back={{ to: back.to, label: 'Đơn hàng của tôi', icon: <ShoppingOutlined /> }} current={`Đơn hàng #${order.orderNumber}`} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 2, mb: { xs: 4, sm: 5 } }}>
        <Box>
          <Box component="p" sx={{ ...storeEyebrowSx, mb: 1.5 }}>
            Đặt lúc {dateTime(order.orderDate) ?? '—'}
          </Box>
          <Box component="h1" sx={pageTitleSx}>
            Đơn hàng #{order.orderNumber}
          </Box>
        </Box>
        <StatusText tone={status.tone} label={status.label} sx={{ fontSize: 13 }} />
      </Box>

      {/* Tiến trình đơn */}
      <Box sx={{ bgcolor: C.sand, px: { xs: 2, md: 6 }, py: { xs: 4, sm: 5 }, mb: 3 }}>
        {closed ? (
          <Box sx={{ textAlign: 'center' }}>
            <Box sx={{ fontFamily: SERIF, fontSize: { xs: 24, sm: 30 }, color: C.accent }}>
              {status.label}
              {order.cancelledAt ? ` · ${dateTime(order.cancelledAt)}` : ''}
            </Box>
            {order.cancelReason && (
              <Box component="p" sx={{ m: 0, mt: 1, fontSize: 15, color: C.muted }}>
                Lý do: {order.cancelReason}
              </Box>
            )}
            {/* Đơn đã thanh toán online rồi bị hủy: cửa hàng hoàn tiền thủ công */}
            {order.paymentStatus === 'REFUND_PENDING' && (
              <>
                <Box component="p" sx={{ m: 0, mt: 1.5, fontSize: 15, fontWeight: 600, color: C.ink }}>
                  Cửa hàng sẽ hoàn {formatVnd(order.totalAmount)} cho bạn.
                </Box>
                <CustomerRefundBox order={order} onSave={onSaveRefund} />
              </>
            )}
            {order.paymentStatus === 'REFUNDED' && (
              <Box component="p" sx={{ m: 0, mt: 1.5, fontSize: 15, fontWeight: 600, color: '#15803d' }}>
                Đã hoàn {formatVnd(order.totalAmount)} cho bạn.
              </Box>
            )}
          </Box>
        ) : (
          <>
            <Stepper
              alternativeLabel
              activeStep={completed}
              sx={{
                // Bước đã xong màu đen, bước đang chờ màu đỏ rượu, bước chưa tới màu nhạt
                '& .MuiStepIcon-root': { color: '#D9D3CA' },
                '& .MuiStepIcon-root.Mui-completed': { color: C.ink },
                '& .MuiStepIcon-root.Mui-active': { color: C.accent },
                '& .MuiStepLabel-label': { fontFamily: SANS, fontSize: 13, color: C.muted },
                '& .MuiStepLabel-label.Mui-completed': { color: C.ink, fontWeight: 500 },
                '& .MuiStepLabel-label.Mui-active': { color: C.accent, fontWeight: 600 },
                '& .MuiStepConnector-line': { borderColor: '#CFC8BD' }
              }}
            >
              {STEP_LABELS.map((label, index) => (
                <Step key={label} completed={index < completed}>
                  <StepLabel
                    optional={
                      times[index] ? (
                        <Box component="span" sx={{ display: 'block', fontSize: 12, color: C.muted, mt: 0.25 }}>
                          {dateTime(times[index])}
                        </Box>
                      ) : null
                    }
                  >
                    {index === completed && CURRENT_STEP_LABEL[order.orderStatus] ? CURRENT_STEP_LABEL[order.orderStatus] : label}
                  </StepLabel>
                </Step>
              ))}
            </Stepper>
            {hint && (
              <Box component="p" sx={{ m: 0, mt: 4, fontSize: 14, color: C.muted, textAlign: 'center' }}>
                {hint}
              </Box>
            )}
          </>
        )}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' }, gap: 3, alignItems: 'start' }}>
        {/* Sản phẩm trong đơn */}
        <StorePanel title={`Sản phẩm (${order.lines.length})`}>
          {order.lines.map((line, index) => (
            <Box key={line.orderItemId} sx={{ display: 'flex', gap: { xs: 1.5, sm: 2.5 }, py: 2.5, borderTop: index > 0 ? `1px solid ${C.line}` : 'none', pt: index === 0 ? 0 : 2.5 }}>
              <StoreThumb src={line.imageUrl} name={line.productName} width={88} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ fontSize: 15, fontWeight: 500, lineHeight: 1.4 }}>{line.productName}</Box>
                <Box sx={{ fontSize: 13, color: C.muted, mt: 0.75 }}>{[line.size, line.color].filter(Boolean).join(' · ') || '—'}</Box>
                <Box sx={{ fontSize: 13, color: C.muted, mt: 0.5 }}>Số lượng: {line.quantity}</Box>
              </Box>
              <Box sx={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap' }}>{formatVnd(line.lineTotal)}</Box>
            </Box>
          ))}
        </StorePanel>

        <Box sx={{ display: 'grid', gap: 3 }}>
          {/* Tổng tiền */}
          <StorePanel title="Tóm tắt đơn hàng">
            <StoreRow label="Tổng tiền hàng">{formatVnd(order.itemsAmount)}</StoreRow>
            {order.promotionDiscountAmount > 0 && (
              <StoreRow label={order.promotionName ? `Khuyến mãi · ${order.promotionName}` : 'Khuyến mãi'}>− {formatVnd(order.promotionDiscountAmount)}</StoreRow>
            )}
            {order.couponDiscountAmount > 0 && (
              <StoreRow label={order.couponCode ? `Mã giảm giá · ${order.couponCode}` : 'Mã giảm giá'}>− {formatVnd(order.couponDiscountAmount)}</StoreRow>
            )}
            <StoreRow label="Phí vận chuyển">{formatVnd(order.shippingFee)}</StoreRow>
            <Box sx={{ borderTop: `1px solid ${C.line}`, mt: 1.5, pt: 1.5 }}>
              <StoreRow label="Thành tiền" strong>
                {formatVnd(order.totalAmount)}
              </StoreRow>
            </Box>
          </StorePanel>

          {/* Thanh toán */}
          <StorePanel title="Thanh toán">
            <StoreRow label="Phương thức">{paymentMethodLabel(order.paymentMethod)}</StoreRow>
            <StoreRow label="Trạng thái">
              <StatusText tone={payment.tone} label={payment.label} />
            </StoreRow>
            {order.orderStatus === 'AWAITING_PAYMENT' && order.paymentExpiresAt && <StoreRow label="Hạn thanh toán">{dateTime(order.paymentExpiresAt)}</StoreRow>}
            {canPay && (
              <Box sx={{ mt: 2 }}>
                {payError && (
                  <Alert severity="error" sx={{ mb: 1.5, borderRadius: '14px', fontSize: 13 }}>
                    {payError}
                  </Alert>
                )}
                <Box component="button" type="button" disabled={payLoading} onClick={onPayNow} sx={{ ...storeBtnSx('dark'), width: '100%' }}>
                  {payLoading ? <CircularProgress size={14} color="inherit" /> : <QrcodeOutlined />}
                  {payLoading ? 'ĐANG TẠO MÃ…' : 'THANH TOÁN QUA VIETQR'}
                </Box>
              </Box>
            )}
          </StorePanel>

          {/* Địa chỉ nhận hàng */}
          <StorePanel title="Địa chỉ nhận hàng">
            <Box sx={{ fontSize: 15, fontWeight: 600 }}>{order.deliveryName || '—'}</Box>
            <Box sx={{ fontSize: 14, color: C.muted, mt: 0.5 }}>{order.deliveryPhone || '—'}</Box>
            <Box sx={{ fontSize: 14, mt: 1.25, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{order.deliveryAddress || '—'}</Box>
          </StorePanel>

          {/* Thao tác của khách */}
          {(actions.length > 0 || canReturn) && (
            <Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                {actions
                  .filter((action) => action.primary)
                  .map((action) => (
                    <Box key={action.to} component="button" type="button" disabled={busy} onClick={() => onAction(action)} sx={{ ...storeBtnSx('dark'), width: '100%' }}>
                      {action.label.toUpperCase()}
                    </Box>
                  ))}
                {canReturn && (
                  <Box component="button" type="button" onClick={onOpenReturn} sx={{ ...storeBtnSx('outline'), width: '100%' }}>
                    <RollbackOutlined /> YÊU CẦU TRẢ HÀNG / HOÀN TIỀN
                  </Box>
                )}
                {actions
                  .filter((action) => !action.primary)
                  .map((action) => (
                    <Box key={action.to} component="button" type="button" disabled={busy} onClick={() => onAction(action)} sx={{ ...dangerBtnSx, width: '100%' }}>
                      {action.label.toUpperCase()}
                    </Box>
                  ))}
              </Box>
              {actionError && (
                <Box component="p" role="alert" sx={{ m: 0, mt: 1.5, fontSize: 14, color: C.accent }}>
                  {actionError}
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/* ------------------------------------------------------------------ Chủ shop và người xử lý đơn */

function StaffView({ order, status, actions, busy, onAction, actionError, back, onPayNow, payLoading, payError, onMarkRefunded, refundBusy, canRefund, onSaveRefund }) {
  const payment = paymentStatusMeta(order.paymentStatus);
  const prep = order.preparationStatus && order.preparationStatus !== 'NOT_STARTED' ? preparationMeta(order.preparationStatus) : null;
  const staffView = Boolean(order.customer);
  const shipment = order.shipment;

  return (
    <>
      <PageHeader
        back={back}
        title={`Đơn hàng ${order.orderNumber}`}
        subtitle={`Đặt lúc ${dateTime(order.orderDate) ?? '—'}`}
        action={
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <StatusPill tone={status.tone} label={status.label} />
            {prep && staffView && <StatusPill tone={prep.tone} label={prep.label} />}
            <ActionButtons actions={actions} busy={busy} onAction={onAction} />
          </Stack>
        }
      />

      {actionError && (
        <Typography color="error" variant="body2" sx={{ mb: 1.5, textAlign: 'right' }}>
          {actionError}
        </Typography>
      )}

      <Box sx={{ display: 'grid', gap: 3 }}>
        {/* Hàng trên: giao hàng, thanh toán và xử lý, vận chuyển */}
        <Box
          sx={{
            display: 'grid',
            gap: 3,
            alignItems: 'stretch',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: shipment ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))' }
          }}
        >
          <Section title="Giao hàng">
            <Info label="Người nhận">{order.deliveryName}</Info>
            <Info label="Điện thoại">{order.deliveryPhone}</Info>
            <Info label="Địa chỉ">{order.deliveryAddress}</Info>
            {staffView && (
              <Info label="Tài khoản">
                {order.customer.fullName} · {order.customer.email}
              </Info>
            )}
          </Section>

          <Section title="Thanh toán và xử lý">
            <Info label="Phương thức">{paymentMethodLabel(order.paymentMethod)}</Info>
            <Info label="Trạng thái">
              <StatusPill tone={payment.tone} label={payment.label} />
            </Info>
            {order.orderStatus === 'AWAITING_PAYMENT' && order.paymentExpiresAt && <Info label="Hạn thanh toán">{dateTime(order.paymentExpiresAt)}</Info>}
            {/* Đã thanh toán online nhưng bị hủy / từ chối: chủ shop chuyển khoản trả lại rồi xác nhận */}
            {order.paymentStatus === 'REFUND_PENDING' && (
              <Alert
                severity="warning"
                sx={{ mt: 1.5, fontSize: 13 }}
                action={
                  canRefund &&
                  order.refundAccount && (
                    <Button
                      color="inherit"
                      size="small"
                      disabled={refundBusy}
                      onClick={onMarkRefunded}
                      sx={{ fontWeight: 700, textTransform: 'none', whiteSpace: 'nowrap' }}
                    >
                      {refundBusy ? 'Đang lưu…' : 'Đã hoàn tiền'}
                    </Button>
                  )
                }
              >
                Cần hoàn <strong>{formatVnd(order.totalAmount)}</strong> cho khách.{' '}
                {order.refundAccount
                  ? 'Quét mã VietQR bên dưới bằng app ngân hàng để chuyển trả, rồi bấm "Đã hoàn tiền".'
                  : `Chưa có tài khoản nhận hoàn: chờ khách nhập trong chi tiết đơn, hoặc gọi khách (${order.deliveryPhone || 'SĐT trong đơn'}) rồi nhập giúp bên dưới.`}
              </Alert>
            )}
            {/* Owner nhập / sửa tài khoản nhận hoàn của khách -> ra mã VietQR */}
            {order.paymentStatus === 'REFUND_PENDING' && canRefund && (
              <OwnerRefundAccount order={order} onSave={onSaveRefund} />
            )}
            {order.paymentStatus === 'REFUND_PENDING' && order.refundAccount && (
              <Box sx={{ mt: 1.5, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Mã VietQR có sẵn số tiền + nội dung "Hoan tien DH..." */}
                <Box
                  component="img"
                  alt="Mã VietQR hoàn tiền"
                  src={generateVietQrUrl({
                    bankCode: order.refundAccount.bankBin,
                    accountNumber: order.refundAccount.accountNumber,
                    accountName: order.refundAccount.accountName,
                    amount: order.totalAmount,
                    memo: `Hoan tien ${String(order.orderNumber || '').replace(/[^a-zA-Z0-9]/g, '')}`.slice(0, 25),
                    template: 'compact2'
                  })}
                  sx={{ width: 180, height: 230, objectFit: 'contain', border: `1px solid ${brand.line}`, borderRadius: 1.5, bgcolor: '#fff' }}
                />
                <Box sx={{ fontSize: 13, display: 'grid', gap: 0.5 }}>
                  <Box>Ngân hàng: <strong>{order.refundAccount.bankName || order.refundAccount.bankBin}</strong></Box>
                  <Box>Số tài khoản: <strong>{order.refundAccount.accountNumber}</strong></Box>
                  <Box>Chủ tài khoản: <strong>{order.refundAccount.accountName}</strong></Box>
                  <Box>Số tiền: <strong>{formatVnd(order.totalAmount)}</strong></Box>
                </Box>
              </Box>
            )}
            {order.paymentMethod === 'ONLINE' && order.paymentStatus !== 'PAID' && !CLOSED.includes(order.orderStatus) && (
              <Box sx={{ mt: 1.5, pt: 1, borderTop: `1px dashed ${brand.line}` }}>
                {payError && (
                  <Alert severity="error" sx={{ mb: 1, fontSize: 13 }}>
                    {payError}
                  </Alert>
                )}
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={payLoading ? <CircularProgress size={16} color="inherit" /> : <QrcodeOutlined />}
                  disabled={payLoading}
                  onClick={onPayNow}
                  sx={{
                    bgcolor: '#16a34a',
                    '&:hover': { bgcolor: '#15803d' },
                    textTransform: 'none',
                    fontWeight: 600,
                    py: 0.75
                  }}
                >
                  {payLoading ? 'Đang tạo mã…' : 'Tạo mã thanh toán PayOS / VietQR'}
                </Button>
              </Box>
            )}
            {order.confirmedAt && (
              <Info label="Xác nhận lúc">
                {dateTime(order.confirmedAt)}
                {staffView && order.confirmedByName ? ` · ${order.confirmedByName}` : ''}
              </Info>
            )}
            {order.cancelledAt && <Info label="Đã hủy lúc">{dateTime(order.cancelledAt)}</Info>}
            {order.cancelReason && <Info label="Lý do">{order.cancelReason}</Info>}
          </Section>

          {shipment && (
            <Section title="Vận chuyển">
              <Info label="Hình thức">{shipment.carrier ? carrierLabel(shipment.carrier) : null}</Info>
              {shipment.trackingNumber && <Info label="Mã vận đơn">{shipment.trackingNumber}</Info>}
              <Info label="Trạng thái">{shipment.status ? shipmentStatusLabel(shipment.status) : null}</Info>
              {shipment.pickedUpAt && <Info label="Đã lấy hàng">{dateTime(shipment.pickedUpAt)}</Info>}
              {shipment.deliveredAt && <Info label="Đã giao">{dateTime(shipment.deliveredAt)}</Info>}
            </Section>
          )}
        </Box>

        {/* Hàng dưới: bảng sản phẩm và tổng tiền */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 2fr) minmax(0, 1fr)' }, gap: 3, alignItems: 'start' }}>
          <Box sx={{ ...cardSx, overflow: 'hidden' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: brand.ink, p: 3, pb: 2 }}>
              Sản phẩm đã đặt
            </Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 540 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={headCellSx}>Sản phẩm</TableCell>
                    <TableCell sx={{ ...headCellSx, textAlign: 'right' }}>Đơn giá</TableCell>
                    <TableCell sx={{ ...headCellSx, textAlign: 'right' }}>SL</TableCell>
                    <TableCell sx={{ ...headCellSx, textAlign: 'right' }}>Thành tiền</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {order.lines.map((line) => (
                    <TableRow key={line.orderItemId}>
                      <TableCell sx={bodyCellSx}>
                        <Stack direction="row" spacing={2} alignItems="center">
                          <Box
                            component={line.imageUrl ? 'img' : 'div'}
                            src={line.imageUrl || undefined}
                            alt={line.productName}
                            sx={{ width: 64, height: 64, borderRadius: '10px', objectFit: 'cover', bgcolor: brand.neutralBg, flexShrink: 0 }}
                          />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body1" sx={{ fontWeight: 600, color: brand.ink }}>
                              {line.productName}
                            </Typography>
                            <Typography variant="body2" sx={{ color: brand.muted }}>
                              {[line.size, line.color].filter(Boolean).join(' · ') || '—'}
                            </Typography>
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ ...bodyCellSx, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatVnd(line.unitPrice)}</TableCell>
                      <TableCell sx={{ ...bodyCellSx, textAlign: 'right' }}>{line.quantity}</TableCell>
                      <TableCell sx={{ ...bodyCellSx, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{formatVnd(line.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Box>

          <Section title="Tổng kết thanh toán">
            <Amount label="Tiền hàng" value={order.itemsAmount} />
            {order.promotionDiscountAmount > 0 && (
              <Amount label={order.promotionName ? `Khuyến mãi · ${order.promotionName}` : 'Khuyến mãi'} value={order.promotionDiscountAmount} negative />
            )}
            {order.couponDiscountAmount > 0 && (
              <Amount label={order.couponCode ? `Mã giảm giá · ${order.couponCode}` : 'Mã giảm giá'} value={order.couponDiscountAmount} negative />
            )}
            <Amount label="Phí vận chuyển" value={order.shippingFee} />
            <Box sx={{ borderTop: `1px solid ${brand.line}`, mt: 1, pt: 1 }}>
              <Amount label="Tổng cộng" value={order.totalAmount} strong />
            </Box>
          </Section>
        </Box>
      </Box>
    </>
  );
}

/* ------------------------------------------------------------------ Trang */

export default function OrderDetailPage() {
  useCrumbs(['Đơn hàng', 'Chi tiết đơn hàng']);
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { account } = useAuth();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: order, error, isLoading, mutate } = useSWR(['order', id], () => ordersApi.detail(id), {
    ...LIVE_SWR,
    // Đơn đã kết thúc thì không cần hỏi lại nữa
    refreshInterval: (latest) => (latest && FINAL_STATUSES.includes(latest.orderStatus) ? 0 : LIVE_INTERVAL)
  });

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [dialog, setDialog] = useState(null); // thao tác đang chờ nhập lý do hoặc chọn hình thức giao
  const [reason, setReason] = useState('');
  const [carrier, setCarrier] = useState('SELF');
  const [ghn, setGhn] = useState(null); // { provinceId, districtId, wardCode, weightG } khi gửi GHN
  const [addressBlocked, setAddressBlocked] = useState(false); // không tìm thấy địa chỉ giao -> không bàn giao
  const [addressAlert, setAddressAlert] = useState(null); // { order, message } khi backend báo không tìm thấy địa chỉ

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [paymentData, setPaymentData] = useState(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState('');

  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [refundBusy, setRefundBusy] = useState(false);
  // Tài khoản nhận hoàn khi khách hủy đơn đã thanh toán (null = không cần)
  const [refundForm, setRefundForm] = useState(null);
  const [returnSuccessMsg, setReturnSuccessMsg] = useState('');

  // Tự động kiểm tra trạng thái thanh toán nếu quay lại từ PayOS với URL ?payment=success
  const orderIdVal = order?.id || Number(id);

  useEffect(() => {
    if (searchParams.get('payment') === 'success' && orderIdVal && order?.paymentStatus !== 'PAID') {
      ordersApi.checkPayOSStatus(orderIdVal).then((res) => {
        if (res.paid) mutate();
      }).catch(() => {});
    }
  }, [searchParams, orderIdVal, order?.paymentStatus, mutate]);

  const handlePayNow = async () => {
    if (!orderIdVal) return;
    setPayLoading(true);
    setPayError('');
    try {
      const res = await ordersApi.createPayOSLink(orderIdVal);
      setPaymentData(res);
      setPayModalOpen(true);
    } catch (err) {
      setPayError(err.message || 'Không thể tạo liên kết thanh toán PayOS.');
    } finally {
      setPayLoading(false);
    }
  };

  const back = { to: '/orders', label: 'Quay lại danh sách đơn' };

  // Chỉ hiện màn hình lỗi khi chưa có dữ liệu; nếu lần tải lại ngầm bị lỗi thì vẫn giữ dữ liệu cũ
  if (error && !order) {
    return (
      <Box>
        <PageHeader back={back} title="Chi tiết đơn hàng" />
        <NoticeBox title="Không xem được đơn hàng">{error.message}</NoticeBox>
      </Box>
    );
  }
  if (isLoading || !order) {
    return (
      <Box>
        <PageHeader back={back} title="Chi tiết đơn hàng" />
        <Typography sx={{ color: brand.muted }}>Đang tải đơn hàng…</Typography>
      </Box>
    );
  }

  const isCustomer = account.role === 'CUSTOMER';
  const status = orderStatusMeta(order.orderStatus);
  const actions = isCustomer
    ? (CUSTOMER_ACTIONS[order.orderStatus] ?? [])
    : account.role === 'OWNER'
      ? ownerActionsFor(order)
      : [];

  const run = async (action, why, carrierValue) => {
    const refund = action.to === 'CANCELLED' ? refundForm : null;
    if (refund) {
      const problem = validateRefundAccount(refund);
      if (problem) {
        setActionError(problem);
        return;
      }
    }
    setBusy(true);
    setActionError('');
    try {
      await ordersApi.changeStatus(id, action.to, why, carrierValue, ghn, refund);
      setDialog(null);
      setReason('');
      await mutate();
      refreshAllOrders(globalMutate); // để danh sách và số đếm trên tab cũng cập nhật theo
    } catch (e) {
      if (e.code === ADDRESS_NOT_FOUND) {
        // Hiện hộp thoại giữa màn hình để chủ shop không bỏ sót, thay cho dòng báo lỗi nhỏ
        setDialog(null);
        setAddressAlert({ order, message: e.message });
      } else {
        setActionError(e.message || 'Không đổi được trạng thái đơn.');
      }
    } finally {
      setBusy(false);
    }
  };

  // Từ hộp thoại "Không tìm thấy địa chỉ": mở luồng từ chối đơn, điền sẵn lý do địa chỉ không hợp lệ
  const rejectForInvalidAddress = () => {
    const reject = (OWNER_ACTIONS[order.orderStatus] ?? []).find((a) => a.to === 'REJECTED');
    setAddressAlert(null);
    if (!reject) return;
    setActionError('');
    setReason(INVALID_ADDRESS_REASON);
    setDialog(reject);
  };

  const start = (action) => {
    setActionError('');
    setRefundForm(
      isCustomer && action.to === 'CANCELLED' && order.paymentMethod === 'ONLINE' && order.paymentStatus === 'PAID'
        ? initialRefundAccount(order.payerAccount)
        : null
    );
    if (action.askReason || action.askCarrier) {
      setReason('');
      setCarrier('SELF');
      setGhn(null);
      setAddressBlocked(false);
      setDialog(action);
    } else {
      run(action);
    }
  };

  // Owner xác nhận đã chuyển khoản hoàn tiền cho khách
  const markRefunded = async () => {
    if (!window.confirm(`Xác nhận đã chuyển khoản trả lại ${formatVnd(order.totalAmount)} cho khách?`)) return;
    setRefundBusy(true);
    setActionError('');
    try {
      await ordersApi.markRefunded(order.id);
      await mutate();
      refreshAllOrders(globalMutate);
    } catch (e) {
      setActionError(e.message || 'Không lưu được trạng thái hoàn tiền.');
    } finally {
      setRefundBusy(false);
    }
  };

  const viewProps = {
    order,
    status,
    actions,
    busy,
    onAction: start,
    actionError: dialog ? '' : actionError,
    onPayNow: handlePayNow,
    payLoading,
    payError,
    onOpenReturn: () => setReturnDialogOpen(true)
  };

  return (
    <Box>
      {returnSuccessMsg && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setReturnSuccessMsg('')}>
          {returnSuccessMsg}
        </Alert>
      )}
      {isCustomer ? (
        <CustomerView
          {...viewProps}
          back={back}
          onSaveRefund={async (account) => {
            await ordersApi.saveRefundAccount(order.id, account);
            await mutate();
          }}
        />
      ) : (
        <StaffView
          {...viewProps}
          back={back}
          onMarkRefunded={markRefunded}
          refundBusy={refundBusy}
          canRefund={account.role === 'OWNER'}
          onSaveRefund={async (refund) => {
            await ordersApi.saveRefundAccount(order.id, refund);
            await mutate();
          }}
        />
      )}

      <Dialog
        open={Boolean(dialog)}
        onClose={() => !busy && setDialog(null)}
        fullWidth
        maxWidth="xs"
        slotProps={isCustomer ? { paper: { sx: { ...storeDialogPaperSx, ...storeInputsSx, '& .MuiButton-root': { borderRadius: '14px', fontFamily: SANS, textTransform: 'none', fontWeight: 700 } } } } : undefined}
      >
        <DialogTitle>{dialog?.label}</DialogTitle>
        <DialogContent>
          {dialog?.askCarrier ? (
            <DeliveryChoice
              orderId={order.id}
              address={order.deliveryAddress}
              carrier={carrier}
              onChange={setCarrier}
              ghn={ghn}
              onGhnChange={setGhn}
              onBlockedChange={setAddressBlocked}
            />
          ) : (
            <>
            {['CANCELLED', 'REJECTED'].includes(dialog?.to) && order.paymentMethod === 'ONLINE' && order.paymentStatus === 'PAID' && (
              <Alert severity="info" sx={{ mb: 1, fontSize: 13 }}>
                {isCustomer
                  ? `Đơn đã thanh toán ${formatVnd(order.totalAmount)}. Sau khi hủy, cửa hàng sẽ hoàn tiền vào tài khoản bạn đã dùng để thanh toán.`
                  : `Khách đã thanh toán ${formatVnd(order.totalAmount)}. Từ chối xong, đơn sẽ ở trạng thái "Chờ hoàn tiền" để bạn hoàn lại cho khách.`}
              </Alert>
            )}
            {refundForm && (
              <Box sx={{ mb: 2 }}>
                <RefundAccountForm
                  value={refundForm}
                  onChange={setRefundForm}
                  disabled={busy}
                  prefilled={Boolean(order.payerAccount?.accountNumber)}
                />
              </Box>
            )}
            <TextField
              autoFocus={!refundForm}
              fullWidth
              multiline
              minRows={2}
              margin="dense"
              label="Lý do (không bắt buộc)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              inputProps={{ maxLength: 255 }}
            />
            </>
          )}
          {actionError && (
            <Typography color="error" variant="body2" sx={{ mt: 1 }}>
              {actionError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button disabled={busy} onClick={() => setDialog(null)}>
            Quay lại
          </Button>
          <Button
            variant="contained"
            color={dialog?.askCarrier ? 'primary' : 'error'}
            disableElevation
            disabled={busy || (dialog?.askCarrier && (addressBlocked || (carrier === 'GHN' && !ghnReady(ghn))))}
            onClick={() => run(dialog, reason, carrier)}
          >
            {busy ? 'Đang xử lý...' : 'Xác nhận'}
          </Button>
        </DialogActions>
      </Dialog>

      <AddressNotFoundDialog
        value={addressAlert}
        onClose={() => setAddressAlert(null)}
        onReject={order.orderStatus === 'PENDING_CONFIRMATION' ? rejectForInvalidAddress : undefined}
      />

      {/* Modal thanh toán PayOS / VietQR */}
      <PayOSPaymentModal
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        paymentData={paymentData}
        onSuccess={() => {
          mutate();
        }}
        onCancelled={() => mutate()}
      />

      {/* Modal Trả hàng / Hoàn tiền cho Khách hàng */}
      {returnDialogOpen && (
        <CustomerReturnDialog
          open={returnDialogOpen}
          onClose={() => setReturnDialogOpen(false)}
          orderData={order}
          isPublic={false}
          onSuccess={(msg) => {
            setReturnSuccessMsg(msg);
            mutate();
          }}
        />
      )}
    </Box>
  );
}
