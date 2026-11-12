import { api } from './http';

export const getPromotions = () => api('/promotions');

export const getPromotionById = (promotionId) => api(`/promotions/${promotionId}`);

export const createPromotion = (data) => api('/promotions', { method: 'POST', body: toPayload(data) });

export const updatePromotion = (promotionId, data) => api(`/promotions/${promotionId}`, { method: 'PUT', body: toPayload(data) });

export const changePromotionStatus = (promotionId, status) =>
  api(`/promotions/${promotionId}/status`, { method: 'PATCH', body: { status } });

const toPayload = (data) => ({
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

const listOf = (res) => (Array.isArray(res) ? res : res?.content ?? res?.data ?? []);

export const getActiveProductPromotions = async (excludeId) =>
  listOf(await getPromotions()).filter(
    (p) => String(p.promotionId) !== String(excludeId) && p.status === 'ACTIVE' && !(Number(p.minOrderValue) > 0)
  );

export const findProductConflict = async (promotion) => {
  if (Number(promotion.minOrderValue) > 0) return null;
  const ids = (promotion.productIds || []).map(Number);
  const others = await getActiveProductPromotions(promotion.promotionId);
  return (
    others.find(
      (p) =>
        overlaps(p, promotion) &&
        (p.applyScope !== 'SELECTED' || promotion.applyScope !== 'SELECTED' || (p.productIds || []).some((id) => ids.includes(Number(id))))
    ) || null
  );
};
