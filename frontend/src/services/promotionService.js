import { api } from './http';

export const getPromotions = () => api('/promotions');

export const getPromotionById = (promotionId) => api(`/promotions/${promotionId}`);

export const getPromotionOrders = (promotionId) => api(`/promotions/${promotionId}/orders`);

export const getPromotionOrder = (promotionId, orderId) => api(`/promotions/${promotionId}/orders/${orderId}`);

export const getPromotionSales = (promotionId, channel) =>
  api(`/promotions/${promotionId}/sales${channel ? `?channel=${encodeURIComponent(channel)}` : ''}`);

export const createPromotion = (body) => api('/promotions', { method: 'POST', body });

export const updatePromotion = (promotionId, body) => api(`/promotions/${promotionId}`, { method: 'PUT', body });

export const adjustPromotion = (promotionId, body) => api(`/promotions/${promotionId}/adjust`, { method: 'PATCH', body });

export const changePromotionStatus = (promotionId, status) =>
  api(`/promotions/${promotionId}/status`, { method: 'PATCH', body: { status } });

export const endPromotion = (promotionId) => api(`/promotions/${promotionId}/end`, { method: 'POST' });

export const deletePromotion = (promotionId) => api(`/promotions/${promotionId}`, { method: 'DELETE' });

export const getVouchers = () => api('/shop/vouchers');
