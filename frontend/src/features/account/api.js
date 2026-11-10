import { api, post } from 'services/http';

function query(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

const patch = (path, body) => api(path, { method: 'PATCH', body });

export const accountsApi = {
  profile: () => api('/accounts/profile'),
  activity: (limit = 8) => api(`/accounts/profile/activity${query({ limit })}`),
  updateProfile: (body) => patch('/accounts/profile', body),
  // Đẩy ảnh lên Cloudinary, đặt làm avatar và xóa ảnh cũ (gọi khi bấm Lưu).
  replaceAvatar: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api('/accounts/profile/avatar', { method: 'PUT', form });
  },
  removeAvatar: () => api('/accounts/profile/avatar', { method: 'DELETE' }),
  changePassword: (body) => post('/auth/change-password', body),
  list: (params) => api(`/accounts${query(params)}`),
  summary: () => api('/accounts/summary'),
  detail: (id) => api(`/accounts/${id}`),
  create: (body) => post('/accounts', body),
  rename: (id, fullName) => patch(`/accounts/${id}`, { fullName }),
  setStatus: (id, status) => patch(`/accounts/${id}/status`, { status }),
  lock: (id) => post(`/accounts/${id}/lock`),
  unlock: (id) => post(`/accounts/${id}/unlock`),
  resetPassword: (id, body) => post(`/accounts/${id}/reset-password`, body),
  resetRequests: () => api('/accounts/password-reset-requests'),
  linkGoogle: () => post('/auth/google/link'),
  requestReset: (identifier) => post('/auth/password-reset-requests', { identifier })
};

export const logsApi = {
  list: (params) => api(`/audit-logs${query(params)}`),
  summary: (params) => api(`/audit-logs/summary${query(params)}`)
};

// Lấy toàn bộ các trang (tối đa `max` dòng) để xuất CSV.
export async function fetchAll(fetchPage, { size = 100, max = 5000 } = {}) {
  const rows = [];
  for (let page = 0; rows.length < max; page += 1) {
    const result = await fetchPage({ page, size });
    rows.push(...result.items);
    if (page + 1 >= result.totalPages) break;
  }
  return rows.slice(0, max);
}