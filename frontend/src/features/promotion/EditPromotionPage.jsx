import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, CircularProgress } from '@mui/material';
import { getPromotionById, updatePromotion } from 'services/promotionService';
import { getProducts } from 'services/productService';
import { useCrumbs } from '../../layouts/crumbs';
import PromotionForm, { isActive, KIND, kindOf, productRows } from './PromotionForm';

const idOf = (p) => Number(p.productId ?? p.id);

const toLocal = (value) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

export default function EditPromotionPage({ kind = 'PRODUCT' }) {
  const navigate = useNavigate();
  const { promotionId } = useParams();
  const { base, title, name } = KIND[kind];
  useCrumbs([title, `Chỉnh sửa ${name}`]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getPromotionById(promotionId), kind === 'PRODUCT' ? getProducts() : []])
      .then(([res, productRes]) => {
        const promotion = res?.data?.data ?? res?.data ?? res;
        if (!promotion?.promotionId) throw new Error('Không tìm thấy thông tin khuyến mãi.');
        if (kindOf(promotion) !== kind) {
          navigate(`${KIND[kindOf(promotion)].base}/${promotionId}/edit`, { replace: true });
          return;
        }
        // Chỉ sửa được khuyến mãi sắp diễn ra
        if (new Date(promotion.startDate) <= new Date()) {
          navigate(`${base}/${promotionId}`, { replace: true });
          return;
        }
        // Bỏ sản phẩm đã ngừng bán khỏi danh sách đã chọn
        const rows = productRows(productRes);
        const activeIds = new Set(rows.filter(isActive).map(idOf));
        const oldIds = (promotion.productIds || []).map(Number);
        const productIds = oldIds.filter((id) => activeIds.has(id));
        const removedNames = rows.filter((p) => oldIds.includes(idOf(p)) && !activeIds.has(idOf(p))).map((p) => p.productName || p.name);
        setData({
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
          products: rows.filter(isActive),
          removedCount: oldIds.length - productIds.length,
          removedNames
        });
      })
      .catch((err) => setError(err?.message || 'Không thể tải dữ liệu khuyến mãi.'));
  }, [promotionId, kind, base, navigate]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data)
    return (
      <Box sx={{ py: 10, textAlign: 'center' }}>
        <CircularProgress size={36} sx={{ color: '#8EECF5' }} />
      </Box>
    );

  return (
    <>
      {data.removedCount > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Đã bỏ {data.removedCount} sản phẩm ngừng bán khỏi khuyến mãi
          {data.removedNames.length ? `: ${data.removedNames.join(', ')}` : ''}. Bấm “Lưu thay đổi” để cập nhật.
        </Alert>
      )}
      <PromotionForm
        kind={kind}
        title={`Chỉnh sửa ${name}`}
        promotionId={promotionId}
        initial={data.initial}
        products={data.products}
        submitLabel="Lưu thay đổi"
        onCancel={() => navigate(`${base}/${promotionId}`)}
        onSubmit={async (form) => {
          await updatePromotion(promotionId, form);
          navigate(`${base}/${promotionId}`);
        }}
      />
    </>
  );
}
