import { api } from './http';

export const getPromotions = () => api('/promotions');

export const getPromotionById = (promotionId) => api(`/promotions/${promotionId}`);

export const getPromotionOrders = (promotionId) => api(`/promotions/${promotionId}/orders`);

export const getPromotionSales = (promotionId, channel) =>
  api(`/promotions/${promotionId}/sales${channel ? `?channel=${encodeURIComponent(channel)}` : ''}`);

export const createPromotion = (data) => api('/promotions', { method: 'POST', body: toPayload(data) });

export const updatePromotion = (promotionId, data) => api(`/promotions/${promotionId}`, { method: 'PUT', body: toPayload(data) });

export const adjustPromotion = (promotionId, { endDate, usageLimit }) =>
  api(`/promotions/${promotionId}/adjust`, {
    method: 'PATCH',
    body: { endDate, usageLimit: usageLimit ? Number(usageLimit) : null }
  });

export const changePromotionStatus = (promotionId, status) =>
  api(`/promotions/${promotionId}/status`, { method: 'PATCH', body: { status } });

export const endPromotion = (promotionId) => api(`/promotions/${promotionId}/end`, { method: 'POST' });

export const deletePromotion = (promotionId) => api(`/promotions/${promotionId}`, { method: 'DELETE' });

export const getVouchers = () => api('/shop/vouchers');

const toPayload = (data) => ({
  type: data.type,
  name: data.name.trim(),
  description: data.description?.trim() || null,
  discountType: data.discountType,
  discountValue: Number(data.discountValue),
  minOrderValue: Number(data.minOrderValue || 0),
  usageLimit: data.usageLimit ? Number(data.usageLimit) : null,
  applyScope: data.applyScope,
  productIds: data.applyScope === 'SELECTED' ? data.productIds.map(Number) : [],
  startDate: data.startDate,
  endDate: data.endDate
});

export const overlaps = (a, b) => new Date(a.startDate) < new Date(b.endDate) && new Date(a.endDate) > new Date(b.startDate);

export const getActiveProductPromotions = async (excludeId) =>
  (await getPromotions()).filter(
    (p) => String(p.promotionId) !== String(excludeId) && p.status === 'ACTIVE' && p.type === 'PRODUCT_DISCOUNT'
  );
