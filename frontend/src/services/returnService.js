import { api, post } from './http';

export async function getReturnableOrder(orderNumber) {
  if (!orderNumber || !orderNumber.trim()) {
    throw new Error('Vui lòng nhập mã đơn hàng.');
  }
  return api(`/returns/orders/${encodeURIComponent(orderNumber.trim())}`);
}

export async function getReturnRequests({ status = 'ALL', search = '', page = 1, pageSize = 10 } = {}) {
  const query = new URLSearchParams();
  if (status && status !== 'ALL') query.set('status', status);
  if (search && search.trim()) query.set('search', search.trim());
  query.set('page', String(page));
  query.set('pageSize', String(pageSize));

  return api(`/returns?${query.toString()}`);
}

export async function getReturnRequestById(id) {
  return api(`/returns/${id}`);
}

export async function createReturnRequest(data) {
  return post('/returns', data);
}

export async function processReturnRequest(id, data) {
  return post(`/returns/${id}/process`, data);
}

export async function seedSampleOrder() {
  return post('/returns/seed-sample-order', {});
}

