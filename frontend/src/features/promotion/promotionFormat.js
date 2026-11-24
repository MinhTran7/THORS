// Định dạng và trạng thái dùng chung cho các trang khuyến mãi

export const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;

export const discountText = (promotion) =>
  promotion.discountType === 'PERCENT' ? `${Number(promotion.discountValue)}%` : money(promotion.discountValue);

/** Khoảng giá sản phẩm: "100.000 đ" hoặc "100.000 – 200.000 đ" */
export const priceRange = ({ minPrice, maxPrice }) => {
  if (minPrice == null && maxPrice == null) return 'Chưa có giá';
  if (minPrice == null || maxPrice == null || Number(minPrice) === Number(maxPrice)) return money(minPrice ?? maxPrice);
  return `${Number(minPrice).toLocaleString('vi-VN')} – ${money(maxPrice)}`;
};

/** Giá sau khi giảm (làm tròn như backend, không âm) */
export const salePrice = (price, discountType, discountValue) => {
  const value = Number(price);
  const discount = discountType === 'PERCENT' ? Math.round((value * Number(discountValue)) / 100) : Number(discountValue);
  return Math.max(0, value - discount);
};

// ---- Ngày giờ ----

const pad = (n) => String(n).padStart(2, '0');
const toValidDate = (value) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/** dd/MM/yyyy */
export const formatDate = (value) => {
  const d = toValidDate(value);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '—';
};

/** HH:mm dd/MM/yyyy */
export const formatDateTime = (value) => {
  const d = toValidDate(value);
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())} ${formatDate(d)}` : '—';
};

/** Giá trị cho ô datetime-local (giờ địa phương), mặc định là bây giờ */
export const toInputDateTime = (value = new Date()) => {
  const d = toValidDate(value);
  if (!d) return '';
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

// ---- Loại và trạng thái khuyến mãi ----

// Hai loại: khuyến mãi sản phẩm và mã giảm giá online
export const kindOf = (p) => (p?.type === 'ORDER_VOUCHER' ? 'ORDER' : 'PRODUCT');
export const KIND = {
  PRODUCT: { type: 'PRODUCT_DISCOUNT', base: '/promotions', title: 'Khuyến mãi sản phẩm', name: 'khuyến mãi sản phẩm' },
  ORDER: { type: 'ORDER_VOUCHER', base: '/order-discounts', title: 'Mã giảm giá online', name: 'mã giảm giá' }
};

export const productRows = (res) => (Array.isArray(res) ? res : (res?.content ?? res?.data ?? []));
export const isActive = (p) => p.status === 'ACTIVE';

// schedule, canEdit, canAdjust, canEnable, canDisable, canEndEarly, canDelete do backend tính sẵn
export const SCHEDULE_LABEL = {
  UPCOMING: 'Sắp diễn ra',
  ONGOING: 'Đang diễn ra',
  ENDED: 'Đã kết thúc'
};

// Lý do không cho sửa (khi nút vẫn hiện)
export const editBlockedMessage = (p) =>
  p.schedule === 'ENDED' ? 'Khuyến mãi đã kết thúc nên không thể chỉnh sửa.' : 'Khuyến mãi này hiện không thể chỉnh sửa.';

// Lý do không cho bật/tắt (khi bấm công tắc)
export const toggleBlockedMessage = (p) => {
  if (p.schedule === 'ENDED') return 'Khuyến mãi đã kết thúc nên không thể bật hoặc tắt.';
  if (p.status === 'ACTIVE') return 'Khuyến mãi đang diễn ra nên không thể tắt. Dùng "Kết thúc sớm" nếu cần dừng ngay.';
  return 'Không thể thay đổi trạng thái khuyến mãi này.';
};
