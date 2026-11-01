import { useState } from 'react';
import { useParams } from 'react-router-dom';
import useSWR from 'swr';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
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
import { Stack } from 'features/account/components/Flex';
import { useCrumbs } from 'layouts/crumbs';
import { useAuth } from 'features/auth/AuthProvider';
import { STORE_NAME } from 'features/account/constants';
import { formatLogDate, formatTime } from 'features/account/format';
import { brand, cardSx } from 'features/account/tokens';
import { OutlineButton } from 'features/account/components/Brand';
import { StatusPill } from 'features/account/components/Chips';
import { bodyCellSx, headCellSx, NoticeBox, PageHeader } from 'features/account/components/Blocks';
import { ordersApi } from './api';
import { CARRIERS, CUSTOMER_ACTIONS, OWNER_ACTIONS, carrierLabel } from './orderActions';
import { formatVnd, orderStatusMeta, paymentMethodLabel, paymentStatusMeta, preparationMeta, shipmentStatusLabel } from './constants';

const dateTime = (value) => (value ? `${formatLogDate(value)} · ${formatTime(value)}` : null);

const TONE_COLOR = { success: 'success.main', danger: 'error.main', warning: 'warning.dark', neutral: 'text.secondary' };

// Các bước khách thấy trên thanh tiến trình, và số bước đã xong theo trạng thái đơn
const STEP_LABELS = ['Đặt hàng', 'Xác nhận', 'Vận chuyển', 'Đã giao', 'Hoàn thành'];
const COMPLETED_STEPS = { AWAITING_PAYMENT: 0, PENDING_CONFIRMATION: 1, AWAITING_PICKUP: 2, SHIPPING: 3, DELIVERED: 4, COMPLETED: 5 };
const CLOSED = ['CANCELLED', 'REJECTED', 'EXPIRED'];

function customerHint(order) {
  const self = order.shipment?.carrier === 'SELF';
  switch (order.orderStatus) {
    case 'AWAITING_PAYMENT':
      return 'Vui lòng thanh toán để cửa hàng xử lý đơn hàng.';
    case 'PENDING_CONFIRMATION':
      return 'Cửa hàng đang xem xét đơn hàng của bạn.';
    case 'AWAITING_PICKUP':
      return 'Cửa hàng đang chuẩn bị hàng.';
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

/* ------------------------------------------------------------------ Khách hàng (kiểu Shopee) */

function CustomerView({ order, status, actions, busy, onAction, actionError }) {
  const payment = paymentStatusMeta(order.paymentStatus);
  const closed = CLOSED.includes(order.orderStatus);
  const completed = COMPLETED_STEPS[order.orderStatus] ?? 0;
  const shipment = order.shipment;
  const times = [order.orderDate, order.confirmedAt, shipment?.pickedUpAt, shipment?.deliveredAt, null];
  const hint = customerHint(order);

  return (
    <Box sx={{ display: 'grid', gap: 2.5 }}>
      {/* Trạng thái và tiến trình */}
      <Box sx={{ ...cardSx, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, px: 3, py: 2, borderBottom: `1px solid ${brand.line}` }}>
          <Typography variant="body2" sx={{ color: brand.muted }}>
            Mã đơn hàng:{' '}
            <Typography component="span" variant="body2" sx={{ color: brand.ink, fontWeight: 700 }}>
              {order.orderNumber}
            </Typography>
            {' · '}Đặt lúc {dateTime(order.orderDate) ?? '—'}
          </Typography>
          <Typography sx={{ fontWeight: 700, letterSpacing: 0.3, color: TONE_COLOR[status.tone] ?? 'text.secondary' }}>{status.label.toUpperCase()}</Typography>
        </Box>
        <Box sx={{ px: { xs: 2, md: 6 }, py: 4 }}>
          {closed ? (
            <Alert severity="error">
              <Typography sx={{ fontWeight: 600 }}>
                {status.label}
                {order.cancelledAt ? ` · ${dateTime(order.cancelledAt)}` : ''}
              </Typography>
              {order.cancelReason && <Typography variant="body2">Lý do: {order.cancelReason}</Typography>}
            </Alert>
          ) : (
            <>
              <Stepper alternativeLabel activeStep={completed}>
                {STEP_LABELS.map((label, index) => (
                  <Step key={label}>
                    <StepLabel
                      optional={times[index] ? <Typography variant="caption" sx={{ color: brand.muted }}>{dateTime(times[index])}</Typography> : null}
                    >
                      {index === 0 && order.orderStatus === 'AWAITING_PAYMENT' ? 'Chờ thanh toán' : label}
                    </StepLabel>
                  </Step>
                ))}
              </Stepper>
              {hint && (
                <Typography variant="body2" sx={{ color: brand.muted, textAlign: 'center', mt: 3 }}>
                  {hint}
                </Typography>
              )}
            </>
          )}
        </Box>
      </Box>

      {/* Địa chỉ nhận hàng và thanh toán */}
      <Box sx={{ display: 'grid', gap: 2.5, alignItems: 'stretch', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
        <Section title="Địa chỉ nhận hàng">
          <Typography variant="body1" sx={{ color: brand.ink, fontWeight: 600 }}>
            {order.deliveryName || '—'}
          </Typography>
          <Typography variant="body2" sx={{ color: brand.muted, mt: 0.25 }}>
            {order.deliveryPhone || '—'}
          </Typography>
          <Typography variant="body2" sx={{ color: brand.ink, mt: 0.5 }}>
            {order.deliveryAddress || '—'}
          </Typography>
        </Section>

        <Section title="Giao hàng và thanh toán">
          {shipment && <Info label="Hình thức giao">{shipment.carrier ? carrierLabel(shipment.carrier) : null}</Info>}
          {shipment?.trackingNumber && <Info label="Mã vận đơn">{shipment.trackingNumber}</Info>}
          {shipment?.status && <Info label="Trạng thái giao">{shipmentStatusLabel(shipment.status)}</Info>}
          <Info label="Phương thức thanh toán">{paymentMethodLabel(order.paymentMethod)}</Info>
          <Info label="Thanh toán">
            <StatusPill tone={payment.tone} label={payment.label} />
          </Info>
          {order.orderStatus === 'AWAITING_PAYMENT' && order.paymentExpiresAt && <Info label="Hạn thanh toán">{dateTime(order.paymentExpiresAt)}</Info>}
        </Section>
      </Box>

      {/* Sản phẩm, tổng tiền và nút thao tác */}
      <Box sx={{ ...cardSx, overflow: 'hidden' }}>
        <Typography variant="body1" sx={{ fontWeight: 700, color: brand.ink, px: 3, py: 2, borderBottom: `1px solid ${brand.line}` }}>
          {STORE_NAME}
        </Typography>
        {order.lines.map((line, index) => (
          <Box key={line.orderItemId} sx={{ display: 'flex', gap: 2, px: 3, py: 2, borderBottom: index < order.lines.length - 1 ? `1px solid ${brand.line}` : 'none' }}>
            <Box
              component={line.imageUrl ? 'img' : 'div'}
              src={line.imageUrl || undefined}
              alt={line.productName}
              sx={{ width: 84, height: 84, borderRadius: '6px', objectFit: 'cover', bgcolor: brand.neutralBg, border: `1px solid ${brand.line}`, flexShrink: 0 }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body1" sx={{ fontWeight: 500, color: brand.ink }}>
                {line.productName}
              </Typography>
              <Typography variant="body2" sx={{ color: brand.muted, mt: 0.25 }}>
                Phân loại: {[line.size, line.color].filter(Boolean).join(', ') || '—'}
              </Typography>
              <Typography variant="body2" sx={{ color: brand.ink, mt: 0.25 }}>
                x{line.quantity}
              </Typography>
            </Box>
            <Typography variant="body1" sx={{ color: brand.ink, alignSelf: 'center', whiteSpace: 'nowrap' }}>
              {formatVnd(line.lineTotal)}
            </Typography>
          </Box>
        ))}

        <Box sx={{ borderTop: `1px solid ${brand.line}`, px: 3, py: 2 }}>
          <Box sx={{ ml: 'auto', maxWidth: 440 }}>
            <Amount label="Tổng tiền hàng" value={order.itemsAmount} />
            {order.promotionDiscountAmount > 0 && (
              <Amount label={order.promotionName ? `Khuyến mãi · ${order.promotionName}` : 'Khuyến mãi'} value={order.promotionDiscountAmount} negative />
            )}
            {order.couponDiscountAmount > 0 && (
              <Amount label={order.couponCode ? `Mã giảm giá · ${order.couponCode}` : 'Mã giảm giá'} value={order.couponDiscountAmount} negative />
            )}
            <Amount label="Phí vận chuyển" value={order.shippingFee} />
            <Box sx={{ borderTop: `1px solid ${brand.line}`, mt: 1, pt: 1 }}>
              <Amount label="Thành tiền" value={order.totalAmount} strong />
            </Box>
          </Box>
        </Box>

        {actions.length > 0 && (
          <Box sx={{ px: 3, pb: 3 }}>
            <Stack direction="row" spacing={1.5} justifyContent="flex-end" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <ActionButtons actions={actions} busy={busy} onAction={onAction} />
            </Stack>
            {actionError && (
              <Typography color="error" variant="body2" sx={{ mt: 1, textAlign: 'right' }}>
                {actionError}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/* ------------------------------------------------------------------ Chủ shop và người xử lý đơn */

function StaffView({ order, status, actions, busy, onAction, actionError, back }) {
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

        {/* Hàng dưới: sản phẩm (cuộn trong khung nếu nhiều dòng) và tổng tiền */}
        <Box sx={{ display: 'grid', gap: 3, alignItems: 'start', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 380px' } }}>
          <Box sx={{ ...cardSx, overflow: 'hidden' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: brand.ink, px: 3, pt: 3, pb: 1.5 }}>
              Sản phẩm đã đặt
            </Typography>
            <Box sx={{ overflow: 'auto', maxHeight: { xs: 'none', md: 'calc(100vh - 620px)' }, minHeight: { md: 220 } }}>
              <Table size="small" stickyHeader sx={{ minWidth: 480, '& .MuiTableCell-root': { py: 1.75 } }}>
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
  const { account } = useAuth();
  const { data: order, error, isLoading, mutate } = useSWR(['order', id], () => ordersApi.detail(id), { revalidateOnFocus: false });

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [dialog, setDialog] = useState(null); // thao tác đang chờ nhập lý do hoặc chọn hình thức giao
  const [reason, setReason] = useState('');
  const [carrier, setCarrier] = useState('SELF');

  const back = { to: '/orders', label: 'Quay lại danh sách đơn' };

  if (error) {
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
  const actions = (isCustomer ? CUSTOMER_ACTIONS : account.role === 'OWNER' ? OWNER_ACTIONS : {})[order.orderStatus] ?? [];

  const run = async (action, why, carrierValue) => {
    setBusy(true);
    setActionError('');
    try {
      await ordersApi.changeStatus(id, action.to, why, carrierValue);
      setDialog(null);
      setReason('');
      await mutate();
    } catch (e) {
      setActionError(e.message || 'Không đổi được trạng thái đơn.');
    } finally {
      setBusy(false);
    }
  };

  const start = (action) => {
    setActionError('');
    if (action.askReason || action.askCarrier) {
      setReason('');
      setCarrier('SELF');
      setDialog(action);
    } else {
      run(action);
    }
  };

  const viewProps = { order, status, actions, busy, onAction: start, actionError: dialog ? '' : actionError };

  return (
    <Box>
      {isCustomer ? (
        <>
          <PageHeader back={back} title="Chi tiết đơn hàng" />
          <CustomerView {...viewProps} />
        </>
      ) : (
        <StaffView {...viewProps} back={back} />
      )}

      <Dialog open={Boolean(dialog)} onClose={() => !busy && setDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>{dialog?.label}</DialogTitle>
        <DialogContent>
          {dialog?.askCarrier ? (
            <>
              <Typography variant="body2" sx={{ color: brand.muted, mb: 1.5 }}>
                Địa chỉ giao:{' '}
                <Typography component="span" variant="body2" sx={{ color: brand.ink, fontWeight: 600 }}>
                  {order.deliveryAddress || '—'}
                </Typography>
              </Typography>
              <TextField
                select
                autoFocus
                fullWidth
                margin="dense"
                label="Hình thức giao hàng"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                helperText={carrier === 'SELF' ? 'Dùng khi địa chỉ gần: cửa hàng tự giao, không cần mã vận đơn.' : 'Dùng khi địa chỉ xa: giao qua đơn vị vận chuyển.'}
              >
                {CARRIERS.map((item) => (
                  <MenuItem key={item.value} value={item.value}>
                    {item.label}
                  </MenuItem>
                ))}
              </TextField>
            </>
          ) : (
            <TextField
              autoFocus
              fullWidth
              multiline
              minRows={2}
              margin="dense"
              label="Lý do (không bắt buộc)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              inputProps={{ maxLength: 255 }}
            />
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
          <Button variant="contained" color={dialog?.askCarrier ? 'primary' : 'error'} disableElevation disabled={busy} onClick={() => run(dialog, reason, carrier)}>
            {busy ? 'Đang xử lý...' : 'Xác nhận'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}