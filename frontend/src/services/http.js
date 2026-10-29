let csrf;
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
async function refreshCsrf() {
  const res = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  if (!res.ok) throw new ApiError(res.status, 'CONNECTION', 'Không kết nối được với hệ thống.');
  csrf = await res.json();
}
export function clearCsrf() {
  csrf = undefined;
}
export async function api(path, options = {}) {
  const method = options.method || 'GET';
  if (!['GET', 'HEAD'].includes(method) && !csrf) await refreshCsrf();
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(!options.form ? { 'Content-Type': 'application/json' } : {}),
        ...(!['GET', 'HEAD'].includes(method) ? { [csrf.headerName]: csrf.token } : {})
      },
      ...(options.form ? { body: options.form } : options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
    });
  } catch {
    throw new ApiError(0, 'CONNECTION', 'Không kết nối được với hệ thống. Vui lòng thử lại.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) clearCsrf();
    if (response.status === 401) window.dispatchEvent(new Event('thors:unauthorized'));
    throw new ApiError(response.status, data.code, data.message || 'Không xử lý được yêu cầu.');
  }
  return data;
}
export const post = (path, body) => api(path, { method: 'POST', body });
