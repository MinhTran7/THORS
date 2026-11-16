// Ô nhập giá bán dạng tiền Việt: hiển thị "77.777", lưu giá trị số dạng chuỗi chữ số ("77777").

// Giá trị lưu (số hoặc chuỗi, kể cả "250000.00" từ backend) -> chuỗi hiển thị "250.000"
export const formatPriceInput = (value) => {
  if (value === '' || value === null || value === undefined) return '';
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number).toLocaleString('vi-VN') : '';
};

// Chữ người dùng gõ ("77.7a77") -> chỉ giữ chữ số, bỏ số 0 ở đầu, tối đa 12 chữ số ("77777")
export const parsePriceInput = (text) =>
  String(text || '')
    .replace(/\D/g, '')
    .replace(/^0+/, '')
    .slice(0, 12);
