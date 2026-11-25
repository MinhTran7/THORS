// Định dạng và quy ước dùng chung cho các trang bán tại quầy

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

export const getStock = (v) => Number(v?.stockQuantity ?? 0);
export const getPrice = (v) => Number(v?.price ?? 0);
export const getProductStock = (p) => Number(p?.totalStock ?? 0);

// Lớp CSS tắt hiệu ứng bấm của MUI trên màn bán hàng (khai báo ở InStoreSalesPage)
export const NO_EFFECTS = 'pos-no-effects';

// Cùng mức với backend: thành viên gia đình giảm tay tối đa 10% tổng tiền hàng
export const FAMILY_DISCOUNT_PERCENT = 10;

// Mã riêng của mỗi hóa đơn chờ, backend dùng để không bán trùng khi bấm thanh toán lại
export const newRequestId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

// Đơn cũ không lưu cách thanh toán được coi là tiền mặt
export const isCashMethod = (method) => !method || method === 'CASH';

const pad = (n) => String(n).padStart(2, '0');

/** Ngày và giờ tách riêng để hiển thị hai dòng: { date: 'dd/MM/yyyy', time: 'HH:mm' } */
export function splitDateTime(value) {
  if (!value) return { date: '—', time: '' };
  const d = new Date(value);
  return {
    date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  };
}
