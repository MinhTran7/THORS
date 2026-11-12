import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPromotion } from 'services/promotionService';
import { getProducts } from 'services/productService';
import { useCrumbs } from '../../layouts/crumbs';
import PromotionForm, { emptyPromotion, isOnline, productRows } from './PromotionForm';

export default function AddPromotionPage() {
  const navigate = useNavigate();
  useCrumbs(['Khuyến mãi', 'Thêm khuyến mãi']);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProducts()
      .then((res) => setProducts(productRows(res).filter(isOnline)))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PromotionForm
      title="Thêm khuyến mãi"
      initial={emptyPromotion}
      products={products}
      productsLoading={loading}
      submitLabel="Tạo khuyến mãi"
      onCancel={() => navigate('/promotions')}
      onSubmit={async (data) => {
        await createPromotion(data);
        navigate('/promotions', { state: { successMessage: 'Tạo khuyến mãi thành công.' } });
      }}
    />
  );
}
