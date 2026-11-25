import { humanize, parseUtc } from 'features/account/format';

/** Số ngày khách được yêu cầu trả hàng, tính từ lúc giao thành công (khớp backend OrderRepository.RETURN_DAYS). */
export const RETURN_DAYS = 7;

/**
 * Đơn đã có yêu cầu trả hàng đang xử lý hoặc đã trả xong (mỗi đơn chỉ trả một lần, khớp backend
 * ReturnService.customerReturnBlock). Yêu cầu bị từ chối thì coi như chưa có, khách được gửi lại.
 */
export const hasReturn = (returnStatus) => Boolean(returnStatus) && returnStatus !== 'REJECTED';

/**
 * Khách còn được gửi yêu cầu trả hàng: đơn đã giao / hoàn thành, chưa quá RETURN_DAYS ngày kể từ lúc giao
 * thành công, và chưa có yêu cầu trả hàng nào (trừ yêu cầu đã bị từ chối).
 */
export const withinReturnWindow = (order) => {
  if (!['DELIVERED', 'COMPLETED'].includes(order?.orderStatus)) return false;
  if (hasReturn(order?.returnStatus)) return false;
  const delivered = parseUtc(order?.shipment?.deliveredAt);
  if (!delivered) return false;
  return Date.now() < delivered.getTime() + RETURN_DAYS * 24 * 60 * 60 * 1000;
};

/** Thao tác của khách: đơn đã trả hàng thì bỏ nút "Đã nhận hàng" (không còn ý nghĩa xác nhận nhận hàng). */
export const customerActionsFor = (order, actionsByStatus) =>
  (actionsByStatus[order?.orderStatus] ?? []).filter((a) => !(a.to === 'COMPLETED' && hasReturn(order?.returnStatus)));

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
  REFUNDED: { label: 'Đã hoàn tiền', tone: 'neutral' },
  // Module đổi trả đặt khi chỉ hoàn lại tiền một phần đơn (trả bớt sản phẩm)
  PARTIALLY_REFUNDED: { label: 'Đã hoàn tiền một phần', tone: 'neutral' }
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

// Đơn đã đóng (hủy / bị từ chối / hết hạn) mà chưa có tiền nào được trả thì không còn gì phải thanh toán
const CLOSED_STATUSES = ['CANCELLED', 'REJECTED', 'EXPIRED'];
const NOTHING_PAID = ['UNPAID', 'FAILED'];

/**
 * Trạng thái thanh toán để hiển thị cho một đơn: đơn đã đóng mà chưa trả tiền thì ghi "Không cần thanh
 * toán" thay vì "Chưa thanh toán". Đơn đã trả / chờ hoàn / đã hoàn tiền vẫn hiện đúng trạng thái đó.
 */
export const orderPaymentMeta = (order) =>
  CLOSED_STATUSES.includes(order?.orderStatus) && NOTHING_PAID.includes(order?.paymentStatus ?? 'UNPAID')
    ? { label: 'Không cần thanh toán', tone: 'neutral' }
    : paymentStatusMeta(order?.paymentStatus);
export const shipmentStatusLabel = (code) => SHIPMENT_STATUS[code] ?? (code ? humanize(code) : '—');
export const paymentMethodLabel = (code) => PAYMENT_METHOD[code] ?? (code ? humanize(code) : '—');

export const ORDER_STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  ...Object.entries(ORDER_STATUS).map(([value, { label }]) => ({ value, label }))
];

export const formatVnd = (value) => `${new Intl.NumberFormat('vi-VN').format(value ?? 0)} ₫`;