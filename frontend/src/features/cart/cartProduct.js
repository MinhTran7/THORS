import { api } from 'services/http';

/**
 * Tìm sản phẩm gốc của một món trong giỏ / đơn đặt hàng (để mở trang chi tiết và đổi màu / size).
 * API giỏ có productId thì dùng luôn; chưa có thì tìm theo tên sản phẩm (nhớ kết quả để khỏi gọi lại).
 */
const idCache = new Map(); // tên sản phẩm -> Promise<productId | null>
const detailCache = new Map(); // productId -> Promise<chi tiết sản phẩm>

const norm = (s) => String(s || '').trim().toLowerCase();

export const productIdOf = (row) => row?.productId ?? row?.product_id ?? null;

export function resolveProductId(item) {
  const known = item.productId ?? null;
  if (known) return Promise.resolve(Number(known));
  const key = norm(item.name);
  if (!key) return Promise.resolve(null);
  if (!idCache.has(key)) {
    const qs = new URLSearchParams({ page: '0', size: '20', q: item.name });
    idCache.set(
      key,
      api(`/shop/products?${qs}`)
        .then((d) => (d.items || []).find((p) => norm(p.productName) === key)?.productId ?? null)
        .catch(() => {
          idCache.delete(key);
          return null;
        })
    );
  }
  return idCache.get(key);
}

export function loadProductDetail(productId) {
  if (!detailCache.has(productId)) {
    detailCache.set(
      productId,
      api(`/shop/products/${productId}`).catch((e) => {
        detailCache.delete(productId);
        throw e;
      })
    );
  }
  return detailCache.get(productId);
}

// Bỏ chi tiết đã nhớ (gọi sau khi đổi phân loại để tồn kho mới nhất)
export const forgetProductDetail = (productId) => detailCache.delete(productId);

/** Đường dẫn trang chi tiết, mở sẵn đúng màu + size khách đã chọn */
export function productLink(productId, { color, size } = {}) {
  const qs = new URLSearchParams();
  if (color) qs.set('color', color);
  if (size) qs.set('size', size);
  const s = qs.toString();
  return `/shop/products/${productId}${s ? `?${s}` : ''}`;
}
