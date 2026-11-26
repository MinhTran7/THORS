// Hàm thuần dùng chung cho các trang bán tại quầy

export const FAMILY_DISCOUNT_PERCENT = 10;
export const isPaid = (sale) => sale.orderStatus === 'COMPLETED';
export const transferMemo = (orderNumber) => `DH ${orderNumber.replace(/[^a-zA-Z0-9]/g, '')}`.slice(0, 25);

export const isActive = (item) => String(item?.status ?? '').toUpperCase() === 'ACTIVE';
export const getStock = (v) => Number(v?.stockQuantity ?? 0);
export const getPrice = (v) => Number(v?.price ?? 0);
export const getProductStock = (p) => Number(p?.totalStock ?? 0);
export const lineLabel = (line) => `${line.name} · ${line.color} · ${line.size}`;

// Đơn cũ không lưu cách thanh toán được coi là tiền mặt
export const isCashMethod = (method) => !method || method === 'CASH';

// ---- Tiền ----

export const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;

export const priceRangeText = (min, max) =>
  min == null
    ? 'Liên hệ'
    : max == null || Number(min) === Number(max)
      ? money(min)
      : `${Number(min).toLocaleString('vi-VN')}–${Number(max).toLocaleString('vi-VN')} đ`;

export const formatNumberInput = (val) => {
  const digits = String(val ?? '')
    .replace(/\D/g, '')
    .slice(0, 12);
  return digits ? Number(digits).toLocaleString('vi-VN') : '';
};

export const parseNumberInput = (val) => Number(String(val || '').replace(/\D/g, '')) || 0;

// Tiền giảm tay theo VNĐ hoặc % trên tổng tiền hàng
export const discountAmount = (type, value, subtotal) => {
  const number = Math.max(0, Number(value) || 0);
  return type === 'percent' ? Math.round((subtotal * Math.min(100, number)) / 100) : Math.min(subtotal, Math.round(number));
};

// Tổng tiền của hóa đơn đang mở
export function saleTotals(order) {
  const subtotal = order.cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const discount = discountAmount(order.discountType, order.discount, subtotal);
  const total = subtotal - discount;
  const paid = parseNumberInput(order.customerPaid);
  const change = order.customerPaid === '' ? 0 : Math.max(0, paid - total);
  return { subtotal, discount, total, paid, change };
}

// ---- Ngày giờ ----

const pad = (n) => String(n).padStart(2, '0');

export function splitDateTime(value) {
  if (!value) return { date: '—', time: '' };
  const d = new Date(value);
  return {
    date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  };
}

export const formatDateTime = (value) => {
  const { date, time } = splitDateTime(value);
  return time ? `${date} ${time}` : date;
};

// Mã riêng của mỗi hóa đơn chờ, backend dùng để không bán trùng khi bấm thanh toán lại
export const newRequestId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
