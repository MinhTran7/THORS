import { humanize } from 'features/account/format';

// Nhãn và màu cho các trạng thái. Giá trị lạ (chưa khai báo ở đây) vẫn hiển thị được nhờ humanize().
export const ORDER_STATUS = {
  AWAITING_PAYMENT: { label: 'Chờ thanh toán', tone: 'warning' },
  PENDING_CONFIRMATION: { label: 'Chờ xác nhận', tone: 'warning' },
  AWAITING_PICKUP: { label: 'Chờ lấy hàng', tone: 'neutral' },
  SHIPPING: { label: 'Đang giao', tone: 'neutral' },
  DELIVERED: { label: 'Đã giao', tone: 'success' },
  COMPLETED: { label: 'Hoàn thành', tone: 'success' },
  CANCELLED: { label: 'Đã hủy', tone: 'danger' },
  REJECTED: { label: 'Bị từ chối', tone: 'danger' },
  EXPIRED: { label: 'Hết hạn', tone: 'neutral' }
};

export const PREPARATION_STATUS = {
  NOT_STARTED: { label: 'Chưa chuẩn bị', tone: 'neutral' },
  PREPARING: { label: 'Đang chuẩn bị', tone: 'warning' },
  PREPARED: { label: 'Đã chuẩn bị', tone: 'success' }
};

export const PAYMENT_STATUS = {
  UNPAID: { label: 'Chưa thanh toán', tone: 'warning' },
  PAID: { label: 'Đã thanh toán', tone: 'success' },
  FAILED: { label: 'Thanh toán lỗi', tone: 'danger' },
  REFUND_PENDING: { label: 'Chờ hoàn tiền', tone: 'warning' },
  REFUNDED: { label: 'Đã hoàn tiền', tone: 'neutral' }
};

export const SHIPMENT_STATUS = {
  CREATED: 'Đã tạo vận đơn',
  AWAITING_PICKUP: 'Chờ lấy hàng',
  IN_TRANSIT: 'Đang vận chuyển',
  DELIVERED: 'Đã giao',
  FAILED: 'Giao thất bại',
  RETURNING: 'Đang hoàn hàng',
  RETURNED: 'Đã hoàn hàng',
  CANCELLED: 'Đã hủy'
};

export const PAYMENT_METHOD = {
  COD: 'Thanh toán khi nhận hàng',
  CASH: 'Tiền mặt',
  ONLINE: 'Thanh toán online'
};

const meta = (table, code) => table[code] ?? { label: code ? humanize(code) : '—', tone: 'neutral' };

export const orderStatusMeta = (code) => meta(ORDER_STATUS, code);
export const preparationMeta = (code) => meta(PREPARATION_STATUS, code);
export const paymentStatusMeta = (code) => meta(PAYMENT_STATUS, code);
export const shipmentStatusLabel = (code) => SHIPMENT_STATUS[code] ?? (code ? humanize(code) : '—');
export const paymentMethodLabel = (code) => PAYMENT_METHOD[code] ?? (code ? humanize(code) : '—');

export const ORDER_STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  ...Object.entries(ORDER_STATUS).map(([value, { label }]) => ({ value, label }))
];

export const formatVnd = (value) => `${new Intl.NumberFormat('vi-VN').format(value ?? 0)} ₫`;