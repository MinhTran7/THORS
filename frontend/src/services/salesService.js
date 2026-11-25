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

// { [productId]: { min, max, saleMin, saleMax } }
export const getPriceRanges = () => api('/sales/in-store/prices');

// Giá sau khuyến mãi và số còn bán được của từng biến thể: { [detailId]: { price, available } }
export const getVariantSales = (productId) => api(`/sales/in-store/prices/${productId}`);
