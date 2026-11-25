import { api } from 'services/http';

/** Mặc thử 2D (backend module tryon). */
export const getTryOnQuota = () => api('/try-on/quota');

export const getTryOnJob = (jobId) => api(`/try-on/jobs/${jobId}`);

/** Các lần mặc thử còn ảnh của khách, mới nhất trước. */
export const getTryOnHistory = () => api('/try-on/jobs');

/** Giới tính + mô tả người mẫu AI sẽ tạo (chế độ GENERATE). */
export const getTryOnModels = (gender) => api(`/try-on/models${gender ? `?gender=${encodeURIComponent(gender)}` : ''}`);

/**
 * mode: GENERATE | PHOTO (photo = Blob ảnh mới, hoặc photoFromJob = id lần thử trước).
 * productIds: các món (1-3). consent: bắt buộc ở PHOTO.
 */
export const createTryOnJob = ({ mode, photo, photoFromJob, productIds, consent }) => {
  const form = new FormData();
  form.append('mode', mode);
  if (photo) form.append('photo', photo, 'photo.jpg');
  if (photoFromJob) form.append('photoFromJob', String(photoFromJob));
  productIds.forEach((id) => form.append('productIds', String(id)));
  form.append('consent', String(Boolean(consent)));
  return api('/try-on/jobs', { method: 'POST', form });
};

export const deleteMyTryOnPhotos = () => api('/try-on/photos', { method: 'DELETE' });

// (Trang Owner quản lý người mẫu dựng sẵn - /try-on/admin/models - đã bỏ 24/11/2026.)
