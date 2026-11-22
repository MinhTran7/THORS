// Định dạng dùng chung cho các trang bán tại quầy

export const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;

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
