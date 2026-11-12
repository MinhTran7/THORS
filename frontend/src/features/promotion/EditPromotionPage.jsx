import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, CircularProgress } from '@mui/material';
import { getPromotionById, updatePromotion } from 'services/promotionService';
import { getProducts } from 'services/productService';
import { useCrumbs } from '../../layouts/crumbs';
import PromotionForm, { isOnline, productRows } from './PromotionForm';

const toLocal = (value) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

export default function EditPromotionPage() {
  const navigate = useNavigate();
  const { promotionId } = useParams();
  useCrumbs(['Khuyến mãi', 'Chỉnh sửa khuyến mãi']);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getPromotionById(promotionId), getProducts()])
      .then(([res, productRes]) => {
        const promotion = res?.data?.data ?? res?.data ?? res;
        if (!promotion?.promotionId) throw new Error('Không tìm thấy thông tin khuyến mãi.');
        const productIds = (promotion.productIds || []).map(Number);
        const now = new Date();
        setData({
          locked: promotion.status === 'ACTIVE' && new Date(promotion.startDate) <= now && now < new Date(promotion.endDate),
          initial: {
            name: promotion.name || '',
            description: promotion.description || '',
            discountType: promotion.discountType === 'FIXED' ? 'FIXED' : 'PERCENT',
            discountValue: String(Math.round(Number(promotion.discountValue || 0)) || ''),
            minOrderValue: Number(promotion.minOrderValue) > 0 ? String(Math.round(promotion.minOrderValue)) : '',
            usageLimit: promotion.usageLimit ? String(promotion.usageLimit) : '',
            usedCount: promotion.usedCount || 0,
            startDate: toLocal(promotion.startDate),
            endDate: toLocal(promotion.endDate),
            applyScope: promotion.applyScope || 'ALL',
            productIds
          },
          products: productRows(productRes).filter((p) => isOnline(p) || productIds.includes(Number(p.productId ?? p.id)))
        });
      })
      .catch((err) => setError(err?.message || 'Không thể tải dữ liệu khuyến mãi.'));
  }, [promotionId]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data)
    return (
      <Box sx={{ py: 10, textAlign: 'center' }}>
        <CircularProgress size={36} sx={{ color: '#8EECF5' }} />
      </Box>
    );

  return (
    <PromotionForm
      title="Chỉnh sửa khuyến mãi"
      promotionId={promotionId}
      initial={data.initial}
      products={data.products}
      submitLabel="Lưu thay đổi"
      locked={data.locked}
      onCancel={() => navigate(`/promotions/${promotionId}`)}
      onSubmit={async (form) => {
        await updatePromotion(promotionId, form);
        navigate(`/promotions/${promotionId}`);
      }}
    />
  );
}
