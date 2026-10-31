import { api } from 'services/http';

function query(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const ordersApi = {
  list: (params) => api(`/orders${query(params)}`),
  detail: (id) => api(`/orders/${id}`),
  // Chỉ dùng khi test: tạo một đơn online mẫu và phát thông báo
  createSample: () => api('/orders/test-sample', { method: 'POST' }),
  // Owner: xác nhận / từ chối / giao / hoàn tất. Customer: hủy đơn.
  // carrier chỉ dùng khi chuyển sang SHIPPING: SELF (tự giao) hoặc mã đơn vị vận chuyển
  changeStatus: (id, status, reason, carrier) => api(`/orders/${id}/status${query({ status, reason, carrier })}`, { method: 'POST' })
};