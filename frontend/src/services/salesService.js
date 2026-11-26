import { api } from './http';

const query = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const createSale = (body) => api('/sales/in-store', { method: 'POST', body });

export const getSale = (orderId) => api(`/sales/in-store/${orderId}`);

export const getSales = (params) => api(`/sales/in-store${query(params)}`);

export const getSellers = () => api('/sales/in-store/sellers');

// { [detailId]: { price, available } }: giá sau khuyến mãi và số còn bán được
export const getVariantSales = (productId) => api(`/sales/in-store/prices/${productId}`);

// Mọi biến thể kèm mã vạch, màu, size, số có thể bán (API tồn kho)
export const getVariantBarcodes = () => api('/warehouse/inventory?all=true').then((res) => res.items ?? []);

// Tồn kho và vị trí lưu kho của một biến thể (API kho)
export const getVariantInventory = (detailId) => api(`/warehouse/inventory/${detailId}`);

export const cancelTransfer = (orderId) => api(`/sales/in-store/${orderId}/cancel`, { method: 'POST' });
