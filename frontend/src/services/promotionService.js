import { api } from './http';

export const getPromotions = () => api('/promotions');

export const getPromotionById = (promotionId) =>
    api(`/promotions/${promotionId}`);

export const createPromotion = (data) =>
    api('/promotions', {
        method: 'POST',
        body: normalizePromotionData(data),
    });

export const updatePromotion = (promotionId, data) =>
    api(`/promotions/${promotionId}`, {
        method: 'PUT',
        body: normalizePromotionData(data),
    });

export const changePromotionStatus = (promotionId, status) =>
    api(`/promotions/${promotionId}/status`, {
        method: 'PATCH',
        body: { status },
    });

function normalizePromotionData(data) {
    const usageLimit =
        data.usageLimit === '' || data.usageLimit == null
            ? null
            : Number(data.usageLimit);

    return {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        discountType: data.discountType,
        discountValue: Number(data.discountValue),
        minOrderValue: Number(data.minOrderValue || 0),
        maxDiscountAmount:
            data.maxDiscountAmount === '' ||
            data.maxDiscountAmount == null
                ? null
                : Number(data.maxDiscountAmount),
        usageLimit,
        applyScope: data.applyScope || 'ALL',
        productIds:
            data.applyScope === 'SELECTED'
                ? (data.productIds || []).map(Number)
                : [],
        startDate: data.startDate,
        endDate: data.endDate,
    };
}