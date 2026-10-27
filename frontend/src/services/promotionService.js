import { api } from './http';

export const getPromotions = () => api('/promotions');

export const getPromotionById = (promotionId) => api(`/promotions/${promotionId}`);

export const updatePromotion = (promotionId, data) => {
  const usageLimit = data.usageLimit === '' || data.usageLimit == null ? null : Number(data.usageLimit);

  return api(`/promotions/${promotionId}`, {
    method: 'PUT',
    body: {
      name: data.name.trim(),
      description: data.description?.trim() || null,
      discountType: data.discountType,
      discountValue: Number(data.discountValue),
      minOrderValue: Number(data.minOrderValue),
      maxDiscountAmount: data.maxDiscountAmount === '' ? null : Number(data.maxDiscountAmount),
      usageLimit,
      startDate: data.startDate,
      endDate: data.endDate
    }
  });
};

export const changePromotionStatus = (promotionId, status) =>
  api(`/promotions/${promotionId}/status`, {
    method: 'PATCH',
    body: { status }
  });
