import { api } from 'services/http';

// Cửa hàng: danh sách dịp / phong cách + phối đồ
export const getOutfitOptions = () => api('/shop/outfits/options');
export const suggestOutfits = (body) => api('/shop/outfits/suggest', { method: 'POST', body });

// Quản trị: thẻ dịp mặc / phong cách của sản phẩm
export const getProductStyle = (productId) => api(`/products/${productId}/style`);
export const saveProductStyle = (productId, body) => api(`/products/${productId}/style`, { method: 'PUT', body });

// Khách: hồ sơ phong cách
export const getStyleProfile = () => api('/body-profile/me/style');
export const saveStyleProfile = (body) => api('/body-profile/me/style', { method: 'PUT', body });
