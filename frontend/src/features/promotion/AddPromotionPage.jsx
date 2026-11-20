import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPromotion } from 'services/promotionService';
import { getProducts } from 'services/productService';
import { useCrumbs } from '../../layouts/crumbs';
import PromotionForm, { emptyPromotion, isActive, KIND, productRows } from './PromotionForm';

export default function AddPromotionPage({ kind = 'PRODUCT' }) {
  const navigate = useNavigate();
  const { base, title, name } = KIND[kind];
  useCrumbs([title, `Thêm ${name}`]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (kind !== 'PRODUCT') {
      setLoading(false);
      return;
    }
    getProducts()
      .then((res) => setProducts(productRows(res).filter(isActive)))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [kind]);

  return (
    <PromotionForm
      kind={kind}
      title={`Thêm ${name}`}
      initial={emptyPromotion}
      products={products}
      productsLoading={loading}
      submitLabel={`Tạo ${name}`}
      onCancel={() => navigate(base)}
      onSubmit={async (data) => {
        await createPromotion(data);
        navigate(base, { state: { successMessage: `Tạo ${name} thành công.` } });
      }}
    />
  );
}
