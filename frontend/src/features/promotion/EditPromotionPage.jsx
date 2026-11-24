import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, CircularProgress } from '@mui/material';
import { adjustPromotion, getPromotionById, updatePromotion } from 'services/promotionService';
import { getProducts } from 'services/productService';
import { useCrumbs } from '../../layouts/crumbs';
import PromotionForm from './PromotionForm';
import { isActive, KIND, kindOf, productRows, toInputDateTime } from './promotionFormat';

const idOf = (p) => Number(p.productId);

export default function EditPromotionPage({ kind = 'PRODUCT' }) {
  const navigate = useNavigate();
  const { promotionId } = useParams();
  const { base, title, name } = KIND[kind];
  useCrumbs([title, `Chỉnh sửa ${name}`]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getPromotionById(promotionId), kind === 'PRODUCT' ? getProducts() : []])
      .then(([promotion, productRes]) => {
        if (kindOf(promotion) !== kind) {
          navigate(`${KIND[kindOf(promotion)].base}/${promotionId}/edit`, { replace: true });
          return;
        }
        if (!promotion.canEdit && !promotion.canAdjust) {
          navigate(`${base}/${promotionId}`, { replace: true });
          return;
        }
        const adjustOnly = !promotion.canEdit;
        const rows = productRows(productRes);
        const activeIds = new Set(rows.filter(isActive).map(idOf));
        const oldIds = (promotion.productIds || []).map(Number);
        const productIds = adjustOnly ? oldIds : oldIds.filter((id) => activeIds.has(id));
        const removedNames = rows.filter((p) => oldIds.includes(idOf(p)) && !productIds.includes(idOf(p))).map((p) => p.productName);
        setData({
          adjustOnly,
          initial: {
            name: promotion.name || '',
            description: promotion.description || '',
            discountType: promotion.discountType === 'FIXED' ? 'FIXED' : 'PERCENT',
            discountValue: String(Math.round(Number(promotion.discountValue || 0)) || ''),
            minOrderValue: Number(promotion.minOrderValue) > 0 ? String(Math.round(promotion.minOrderValue)) : '',
            usageLimit: promotion.usageLimit ? String(promotion.usageLimit) : '',
            usedCount: promotion.usedCount || 0,
            startDate: toInputDateTime(promotion.startDate),
            endDate: toInputDateTime(promotion.endDate),
            allProducts: promotion.applyScope !== 'SELECTED',
            productIds
          },
          products: rows.filter(isActive),
          removedCount: oldIds.length - productIds.length,
          removedNames
        });
      })
      .catch((err) => setError(err.message || 'Không thể tải dữ liệu khuyến mãi.'));
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
      {data.adjustOnly && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {name.charAt(0).toUpperCase() + name.slice(1)} đang diễn ra nên chỉ được gia hạn thời gian kết thúc
          {kind === 'ORDER' ? ' và điều chỉnh số lượt dùng' : ''}.
        </Alert>
      )}
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
        adjustOnly={data.adjustOnly}
        submitLabel="Lưu thay đổi"
        onCancel={() => navigate(`${base}/${promotionId}`)}
        onSubmit={async (form) => {
          await (data.adjustOnly ? adjustPromotion(promotionId, form) : updatePromotion(promotionId, form));
          navigate(`${base}/${promotionId}`);
        }}
      />
    </>
  );
}
