import { api } from './http';

const BASE = '/customer/addresses';

export const getShippingAddresses = () => api(BASE);
export const getShippingAddress = (id) => api(`${BASE}/${id}`);
export const createShippingAddress = (body) => api(BASE, { method: 'POST', body });
export const updateShippingAddress = (id, body) => api(`${BASE}/${id}`, { method: 'PUT', body });
export const deleteShippingAddress = (id) => api(`${BASE}/${id}`, { method: 'DELETE' });
