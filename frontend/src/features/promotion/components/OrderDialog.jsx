import { Box, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material';
import { CloseOutlined } from '@ant-design/icons';
import { orderStatusMeta } from 'features/order/constants';
import { usePromotionOrder } from '../hooks';
import { C, dialogPaper } from '../theme';
import { formatDateTime, money } from '../utils';

// Màu nhãn trạng thái đơn theo tone của features/order/constants
const TONE = {
  success: { bg: '#DCFCE7', color: '#166534' },
  warning: { bg: '#FEF9C3', color: '#854D0E' },
  danger: { bg: '#FEE2E2', color: '#B91C1C' },
  neutral: { bg: C.borderLight, color: '#475569' }
};

const CHANNEL = {
  'In-Store': { label: 'Tại quầy', bg: '#E0F2FE', color: '#0369A1' },
  Online: { label: 'Online', bg: C.borderLight, color: '#475569' }
};

const pillSx = { display: 'inline-block', px: 1.25, py: 0.3, borderRadius: 99, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' };

export function StatusPill({ status }) {
  const meta = orderStatusMeta(status);
  const tone = TONE[meta.tone] || TONE.neutral;
  return (
    <Box component="span" sx={{ ...pillSx, bgcolor: tone.bg, color: tone.color }}>
      {meta.label}
    </Box>
  );
}

export function ChannelPill({ type, sx }) {
  const ch = CHANNEL[type] || CHANNEL.Online;
  return (
    <Box component="span" sx={{ ...pillSx, bgcolor: ch.bg, color: ch.color, ...sx }}>
      {ch.label}
    </Box>
  );
}

function Row({ label, value, strong, color }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.6, fontSize: strong ? 15 : 13.5 }}>
      <Box component="span" sx={{ color: strong ? C.text : C.muted, fontWeight: strong ? 700 : 400 }}>
        {label}
      </Box>
      <Box component="span" sx={{ fontWeight: strong ? 800 : 600, color: color || C.text }}>
        {value}
      </Box>
    </Box>
  );
}

// Dòng hàng: dòng được giảm bởi khuyến mãi đang xem thì hiện giá gốc gạch ngang
function Line({ item }) {
  const discounted = item.promoted && Number(item.originalPrice) > Number(item.unitPrice);
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 1.25, '& + &': { borderTop: `1px solid ${C.borderLight}` } }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{item.productName}</Typography>
        <Typography sx={{ fontSize: 12.5, color: C.muted }}>
          {[item.size, item.color].filter(Boolean).join(' · ')} · x{item.quantity}
        </Typography>
      </Box>
      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: discounted ? C.discount : C.text }}>
          {money(item.unitPrice * item.quantity)}
        </Typography>
        {discounted && (
          <Typography sx={{ fontSize: 12, color: C.subtle, textDecoration: 'line-through' }}>
            {money(item.originalPrice * item.quantity)}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function OrderContent({ order }) {
  const otherDiscount = Number(order.otherDiscount);
  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 2 }}>
        <ChannelPill type={order.orderType} />
        <StatusPill status={order.orderStatus} />
        <Typography sx={{ fontSize: 13, color: C.muted }}>
          {formatDateTime(order.orderDate)} · {order.customerName || 'Khách lẻ'}
        </Typography>
      </Box>

      <Box sx={{ border: `1px solid ${C.borderLight}`, borderRadius: 2.5, px: 2, mb: 2 }}>
        {order.items.map((item, i) => (
          <Line key={i} item={item} />
        ))}
      </Box>

      <Row label="Tiền hàng" value={money(order.itemsAmount)} />
      {Number(order.voucherDiscount) > 0 && <Row label="Mã giảm giá" value={`− ${money(order.voucherDiscount)}`} color={C.discount} />}
      {otherDiscount > 0 && <Row label="Giảm khác" value={`− ${money(otherDiscount)}`} />}
      {Number(order.shippingFee) > 0 && <Row label="Phí giao hàng" value={money(order.shippingFee)} />}
      <Box sx={{ borderTop: `1px solid ${C.border}`, mt: 1, pt: 1 }}>
        <Row label="Tổng cộng" value={money(order.totalAmount)} strong />
      </Box>
    </>
  );
}

// Popup một đơn trong báo cáo khuyến mãi (thay cho mở trang đơn hàng)
export default function OrderDialog({ promotionId, orderId, onClose }) {
  const { order, error } = usePromotionOrder(promotionId, orderId);
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth slotProps={dialogPaper}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800, fontSize: 18 }}>
        {order ? `Đơn ${order.orderNumber}` : 'Chi tiết đơn'}
        <IconButton size="small" onClick={onClose} sx={{ color: C.muted }}>
          <CloseOutlined style={{ fontSize: 13 }} />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {error ? (
          <Typography sx={{ py: 3, textAlign: 'center', color: C.error, fontSize: 13.5 }}>{error}</Typography>
        ) : !order ? (
          <Box sx={{ py: 5, textAlign: 'center' }}>
            <CircularProgress size={30} sx={{ color: C.cyan }} />
          </Box>
        ) : (
          <OrderContent order={order} />
        )}
      </DialogContent>
    </Dialog>
  );
}
