import { useParams } from 'react-router-dom';
import useSWR from 'swr';
import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { Stack } from 'features/account/components/Flex';
import { useCrumbs } from 'layouts/crumbs';
import { formatLogDate, formatTime } from 'features/account/format';
import { brand, cardSx } from 'features/account/tokens';
import { StatusPill } from 'features/account/components/Chips';
import { bodyCellSx, headCellSx, NoticeBox, PageHeader } from 'features/account/components/Blocks';
import { ordersApi } from './api';
import { formatVnd, orderStatusMeta, paymentMethodLabel, paymentStatusMeta, preparationMeta, shipmentStatusLabel } from './constants';

const dateTime = (value) => (value ? `${formatLogDate(value)} · ${formatTime(value)}` : null);

function Section({ title, children }) {
  return (
    <Box sx={{ ...cardSx, p: 2.5 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: brand.ink, mb: 1 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function Info({ label, children }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ py: 0.75 }}>
      <Typography variant="body2" sx={{ color: brand.muted, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ color: brand.ink, textAlign: 'right', wordBreak: 'break-word' }}>
        {children ?? '—'}
      </Typography>
    </Stack>
  );
}

function Amount({ label, value, negative = false, strong = false }) {
  return (
    <Stack direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
      <Typography variant="body2" sx={{ color: strong ? brand.ink : brand.muted, fontWeight: strong ? 700 : 400 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ color: brand.ink, fontWeight: strong ? 700 : 500 }}>
        {negative ? '− ' : ''}
        {formatVnd(value)}
      </Typography>
    </Stack>
  );
}

export default function OrderDetailPage() {
  useCrumbs(['Đơn hàng', 'Chi tiết đơn hàng']);
  const { id } = useParams();
  const { data: order, error, isLoading } = useSWR(['order', id], () => ordersApi.detail(id), { revalidateOnFocus: false });

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

  const status = orderStatusMeta(order.orderStatus);
  const payment = paymentStatusMeta(order.paymentStatus);
  const prep = order.preparationStatus && order.preparationStatus !== 'NOT_STARTED' ? preparationMeta(order.preparationStatus) : null;
  const staffView = Boolean(order.customer);
  const closed = ['CANCELLED', 'REJECTED', 'EXPIRED'].includes(order.orderStatus);

  return (
    <Box>
      <PageHeader
        back={back}
        title={`Đơn hàng ${order.orderNumber}`}
        subtitle={`Đặt lúc ${dateTime(order.orderDate) ?? '—'}`}
        action={
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
            <StatusPill tone={status.tone} label={status.label} />
            {prep && staffView && <StatusPill tone={prep.tone} label={prep.label} />}
          </Stack>
        }
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 2fr) minmax(0, 1fr)' }, gap: 2.5, alignItems: 'start' }}>
        {/* Cột trái: sản phẩm và tiền */}
        <Stack spacing={2.5}>
          <Box sx={{ ...cardSx, overflow: 'hidden' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: brand.ink, p: 2.5, pb: 1.5 }}>
              Sản phẩm đã đặt
            </Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 520 }}>
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
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Box
                            component={line.imageUrl ? 'img' : 'div'}
                            src={line.imageUrl || undefined}
                            alt={line.productName}
                            sx={{ width: 52, height: 52, borderRadius: '10px', objectFit: 'cover', bgcolor: brand.neutralBg, flexShrink: 0 }}
                          />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: brand.ink }}>
                              {line.productName}
                            </Typography>
                            <Typography variant="caption" sx={{ color: brand.muted }}>
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
        </Stack>

        {/* Cột phải: giao hàng, thanh toán, xử lý */}
        <Stack spacing={2.5}>
          <Section title="Giao hàng">
            <Info label="Người nhận">{order.deliveryName}</Info>
            <Info label="Điện thoại">{order.deliveryPhone}</Info>
            <Info label="Địa chỉ">{order.deliveryAddress}</Info>
          </Section>

          <Section title="Thanh toán">
            <Info label="Phương thức">{paymentMethodLabel(order.paymentMethod)}</Info>
            <Info label="Trạng thái">
              <StatusPill tone={payment.tone} label={payment.label} />
            </Info>
            {order.orderStatus === 'AWAITING_PAYMENT' && order.paymentExpiresAt && <Info label="Hạn thanh toán">{dateTime(order.paymentExpiresAt)}</Info>}
          </Section>

          {order.shipment && (
            <Section title="Vận chuyển">
              <Info label="Đơn vị vận chuyển">{order.shipment.carrier}</Info>
              <Info label="Mã vận đơn">{order.shipment.trackingNumber}</Info>
              <Info label="Trạng thái">{order.shipment.status ? shipmentStatusLabel(order.shipment.status) : null}</Info>
              {order.shipment.pickedUpAt && <Info label="Đã lấy hàng">{dateTime(order.shipment.pickedUpAt)}</Info>}
              {order.shipment.deliveredAt && <Info label="Đã giao">{dateTime(order.shipment.deliveredAt)}</Info>}
            </Section>
          )}

          {staffView && (
            <Section title="Tài khoản khách hàng">
              <Info label="Họ tên">{order.customer.fullName}</Info>
              <Info label="Email">{order.customer.email}</Info>
              <Info label="Điện thoại">{order.customer.phone}</Info>
            </Section>
          )}

          {(order.confirmedAt || closed) && (
            <Section title="Xử lý đơn">
              {order.confirmedAt && <Info label="Đã xác nhận">{dateTime(order.confirmedAt)}</Info>}
              {order.confirmedAt && staffView && <Info label="Người xác nhận">{order.confirmedByName}</Info>}
              {order.cancelledAt && <Info label="Đã hủy lúc">{dateTime(order.cancelledAt)}</Info>}
              {order.cancelReason && <Info label="Lý do">{order.cancelReason}</Info>}
            </Section>
          )}
        </Stack>
      </Box>
    </Box>
  );
}