import { api } from 'services/http';

const BASE = '/body-profile/me';

// Máy chủ trả 204 (không có nội dung) khi khách chưa lưu số đo -> http trả {} -> đổi thành null
export const getBodyProfile = async () => {
  const data = await api(BASE);
  return data?.gender ? data : null;
};
export const saveBodyProfile = (body) => api(BASE, { method: 'PUT', body });
export const deleteBodyProfile = () => api(BASE, { method: 'DELETE' });

// Bảng size (trang quản trị): xem (Owner + Family Member), lưu / sao chép (Owner)
export const getSizeChart = (productId) => api(`/products/${productId}/size-chart`);
export const saveSizeChart = (productId, rows) => api(`/products/${productId}/size-chart`, { method: 'PUT', body: { rows } });
export const getStandardSizeChart = (productId) => api(`/products/${productId}/size-chart/standard`);
export const applySizeChartToCategory = (productId) => api(`/products/${productId}/size-chart/apply-to-category`, { method: 'POST' });
export const copySizeChart = (productId, fromProductId) =>
  api(`/products/${productId}/size-chart/copy?from=${encodeURIComponent(fromProductId)}`, { method: 'POST' });

// Gợi ý size trên trang cửa hàng: GET dùng số đo đã lưu; POST gửi số đo tự nhập
export const getSizeGuide = (productId) => api(`/shop/products/${productId}/size-guide`);
export const trySizeGuide = (productId, body) => api(`/shop/products/${productId}/size-guide`, { method: 'POST', body });
