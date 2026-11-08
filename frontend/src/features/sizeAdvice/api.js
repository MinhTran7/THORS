import { api } from 'services/http';

function query(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

// Bảng size chỉ nằm ở backend (SizeChart.java); frontend luôn hỏi API để hai bên không lệch nhau.
export const sizeAdviceApi = {
  // { top, bottom, shoe, note } theo số đo đang nhập (xem trước ở trang Hồ sơ)
  general: (params) => api(`/size-advice/general${query(params)}`),
  // { sizeType, missing, size, confidence, inStock, reasons[], productFit, similar[] } cho khách đang đăng nhập
  product: (productId) => api(`/size-advice/products/${productId}`),
  // [{ orderItemId, rateable, fit }]
  orderFeedback: (orderId) => api(`/size-advice/orders/${orderId}/feedback`),
  // fit: TIGHT | TRUE | LOOSE | null (xóa đánh giá)
  saveFeedback: (orderItemId, fit) => api(`/size-advice/order-items/${orderItemId}/feedback`, { method: 'PUT', body: { fit } })
};

export const MEASURE_RANGES = {
  heightCm: { min: 100, max: 220, unit: 'cm', label: 'Chiều cao', integer: true },
  weightKg: { min: 30, max: 150, unit: 'kg', label: 'Cân nặng', integer: true },
  footLengthCm: { min: 15, max: 32, unit: 'cm', label: 'Chiều dài bàn chân', integer: false }
};

export const FIT_PREFERENCES = [
  { value: 'SNUG', label: 'Ôm' },
  { value: 'REGULAR', label: 'Vừa' },
  { value: 'LOOSE', label: 'Rộng' }
];

export const FIT_OPTIONS = [
  { value: 'TIGHT', label: 'Chật' },
  { value: 'TRUE', label: 'Vừa' },
  { value: 'LOOSE', label: 'Rộng' }
];

export const CONFIDENCE_LABEL = { HIGH: 'Độ tin cậy cao', MEDIUM: 'Độ tin cậy vừa', LOW: 'Tham khảo theo bảng size' };
