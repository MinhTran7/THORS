import { api } from 'services/http';

/** Mặc thử 2D (backend module tryon). */
export const getTryOnQuota = () => api('/try-on/quota');

export const getTryOnJob = (jobId) => api(`/try-on/jobs/${jobId}`);

/** Các lần mặc thử còn ảnh của khách, mới nhất trước. */
export const getTryOnHistory = () => api('/try-on/jobs');

/** Người mẫu dựng sẵn + người mẫu gợi ý theo số đo + mô tả người mẫu AI sẽ tạo. */
export const getTryOnModels = (gender) => api(`/try-on/models${gender ? `?gender=${encodeURIComponent(gender)}` : ''}`);

/**
 * mode: MODEL (modelId) | GENERATE | PHOTO (photo = Blob ảnh mới, hoặc photoFromJob = id lần thử trước).
 * productIds: các món (1-3). consent: bắt buộc ở PHOTO.
 */
export const createTryOnJob = ({ mode, photo, photoFromJob, modelId, productIds, consent }) => {
  const form = new FormData();
  form.append('mode', mode);
  if (photo) form.append('photo', photo, 'photo.jpg');
  if (photoFromJob) form.append('photoFromJob', String(photoFromJob));
  if (modelId) form.append('modelId', String(modelId));
  productIds.forEach((id) => form.append('productIds', String(id)));
  form.append('consent', String(Boolean(consent)));
  return api('/try-on/jobs', { method: 'POST', form });
};

export const deleteMyTryOnPhotos = () => api('/try-on/photos', { method: 'DELETE' });

// ---- Chủ cửa hàng: người mẫu dựng sẵn ----
export const listTryOnModels = () => api('/try-on/admin/models');

export const createTryOnModel = ({ image, gender, bodyType, heightCm, source, note }) => {
  const form = new FormData();
  form.append('image', image, image.name || 'model.jpg');
  form.append('gender', gender);
  form.append('bodyType', bodyType);
  form.append('heightCm', String(heightCm));
  form.append('source', source);
  form.append('note', note);
  return api('/try-on/admin/models', { method: 'POST', form });
};

export const setTryOnModelActive = (modelId, active) => api(`/try-on/admin/models/${modelId}`, { method: 'PATCH', body: { active } });

export const deleteTryOnModel = (modelId) => api(`/try-on/admin/models/${modelId}`, { method: 'DELETE' });

export const GENDER_LABELS = { FEMALE: 'Nữ', MALE: 'Nam' };
export const BODY_LABELS = { SLIM: 'Gầy', REGULAR: 'Vừa', FULL: 'Đầy đặn' };
