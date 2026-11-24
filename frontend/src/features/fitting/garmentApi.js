import { api } from 'services/http';

/** Mô hình 3D quần áo của sản phẩm (backend module fitting/garment). */

// Máy chủ trả 204 khi sản phẩm chưa có mô hình -> http trả {} -> đổi thành null
export const getGarmentModel = async (productId) => {
  const data = await api(`/products/${productId}/garment-model`);
  return data?.glbUrl ? data : null;
};

/**
 * Lưu mô hình (multipart). file: bắt buộc lần đầu, sau đó chỉ khi thay file.
 * sizes: { S: { up, down } }, colors: { Navy: { hex } }.
 */
export const saveGarmentModel = (productId, { file, slot, gender, fabricMaterial, sizes, colors }) => {
  const form = new FormData();
  if (file) form.append('file', file, file.name || 'model.glb');
  form.append('slot', slot);
  form.append('gender', gender);
  form.append('fabricMaterial', fabricMaterial);
  form.append('sizes', JSON.stringify(sizes));
  form.append('colors', JSON.stringify(colors));
  return api(`/products/${productId}/garment-model`, { method: 'PUT', form });
};

export const setGarmentModelActive = (productId, active) =>
  api(`/products/${productId}/garment-model`, { method: 'PATCH', body: { active } });

export const deleteGarmentModel = (productId) => api(`/products/${productId}/garment-model`, { method: 'DELETE' });

/** Phòng thử đồ: mô hình đang bật của các sản phẩm (tối đa 50). Sản phẩm không có trong kết quả = chưa hỗ trợ 3D. */
export const getShopGarmentModels = (productIds) => {
  const ids = [...new Set(productIds.filter((id) => Number(id) > 0))];
  if (ids.length === 0) return Promise.resolve([]);
  return api(`/shop/garment-models?productIds=${ids.join(',')}`);
};

export const SLOT_OPTIONS = [
  ['TOP', 'Áo'],
  ['BOTTOM', 'Quần / chân váy'],
  ['DRESS', 'Đầm / váy liền'],
  ['OUTER', 'Áo khoác'],
  ['SHOES', 'Giày']
];
