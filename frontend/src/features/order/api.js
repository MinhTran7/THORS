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
  detail: (id) => api(`/orders/${id}`)
};