import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, CircularProgress } from '@mui/material';
import { useCrumbs } from 'layouts/crumbs';
import { adjustPromotion, updatePromotion } from 'services/promotionService';
import PromotionForm from '../components/PromotionForm';
import { useProducts, usePromotion } from '../hooks';
import { C } from '../theme';
import { isActive, KIND, productIdOf, productNameOf, toForm } from '../utils';

// Chưa bắt đầu: sửa toàn bộ. Đang diễn ra: chỉ gia hạn (và đổi lượt dùng của mã giảm giá). Còn lại: về trang chi tiết
export default function EditPromotionPage({ kind = 'PRODUCT' }) {
  const navigate = useNavigate();
  const { promotionId } = useParams();
  const { base, title, name } = KIND[kind];
  useCrumbs([title, `Chỉnh sửa ${name}`]);
  const { promotion, error } = usePromotion(promotionId, kind, '/edit');
  const { products, loading } = useProducts(kind === 'PRODUCT');
  const detailPath = `${base}/${promotionId}`;
  const locked = promotion && !promotion.canEdit && !promotion.canAdjust;

  useEffect(() => {
    if (locked) navigate(detailPath, { replace: true });
  }, [locked, detailPath, navigate]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!promotion || locked || loading)
    return (
      <Box sx={{ py: 10, textAlign: 'center' }}>
        <CircularProgress size={36} sx={{ color: C.cyan }} />
      </Box>
    );

  // Sửa toàn bộ thì bỏ sản phẩm đã ngừng bán khỏi danh sách đang chọn
  const adjustOnly = !promotion.canEdit;
  const active = products.filter(isActive);
  const activeIds = new Set(active.map(productIdOf));
  const oldIds = (promotion.productIds || []).map(Number);
  const productIds = adjustOnly ? oldIds : oldIds.filter((id) => activeIds.has(id));
  const removed = products.filter((p) => oldIds.includes(productIdOf(p)) && !productIds.includes(productIdOf(p))).map(productNameOf);

  return (
    <>
      {adjustOnly && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {name.charAt(0).toUpperCase() + name.slice(1)} đang diễn ra nên chỉ được gia hạn thời gian kết thúc
          {kind === 'ORDER' ? ' và điều chỉnh số lượt dùng' : ''}.
        </Alert>
      )}
      {removed.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Đã bỏ {removed.length} sản phẩm ngừng bán khỏi khuyến mãi: {removed.join(', ')}. Bấm “Lưu thay đổi” để cập nhật.
        </Alert>
      )}
      <PromotionForm
        kind={kind}
        title={`Chỉnh sửa ${name}`}
        promotionId={promotionId}
        initial={toForm(promotion, productIds)}
        products={active}
        adjustOnly={adjustOnly}
        submitLabel="Lưu thay đổi"
        onCancel={() => navigate(detailPath)}
        onSubmit={async (body) => {
          await (adjustOnly ? adjustPromotion(promotionId, body) : updatePromotion(promotionId, body));
          navigate(detailPath);
        }}
      />
    </>
  );
}
