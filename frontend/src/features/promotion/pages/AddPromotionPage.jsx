import { useNavigate } from 'react-router-dom';
import { useCrumbs } from 'layouts/crumbs';
import { createPromotion } from 'services/promotionService';
import PromotionForm from '../components/PromotionForm';
import { useProducts } from '../hooks';
import { EMPTY_PROMOTION, isActive, KIND } from '../utils';

export default function AddPromotionPage({ kind = 'PRODUCT' }) {
  const navigate = useNavigate();
  const { base, title, name } = KIND[kind];
  useCrumbs([title, `Thêm ${name}`]);
  const { products, loading } = useProducts(kind === 'PRODUCT');

  return (
    <PromotionForm
      kind={kind}
      title={`Thêm ${name}`}
      initial={EMPTY_PROMOTION}
      products={products.filter(isActive)}
      productsLoading={loading}
      submitLabel={`Tạo ${name}`}
      onCancel={() => navigate(base)}
      onSubmit={async (body) => {
        await createPromotion(body);
        navigate(base);
      }}
    />
  );
}
