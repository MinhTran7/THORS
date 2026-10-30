import { mutate } from 'swr';
import { api, post } from 'services/http';

// Khóa SWR dùng chung: số chưa đọc (chuông) và danh sách trong popup.
export const UNREAD_KEY = 'notifications-unread';
export const POPOVER_KEY = 'notifications-popover';

function query(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const notificationsApi = {
  list: (params) => api(`/notifications${query(params)}`),
  unreadCount: () => api('/notifications/unread-count'),
  markRead: (id) => api(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => post('/notifications/read-all')
};

// Thông báo gắn với thực thể nào thì bấm vào mở trang của thực thể đó.
// Thêm dòng mới ở đây khi có thêm loại related_entity_type.
const ENTITY_ROUTES = {
  ORDER: (id) => `/orders/${id}`,
  // Yêu cầu đặt lại mật khẩu của Owner chỉ gửi cho Admin; Admin xử lý ở trang Accounts.
  USER: () => '/accounts'
};

export const entityPath = (item) => (item.relatedEntityId != null ? ENTITY_ROUTES[item.relatedEntityType]?.(item.relatedEntityId) : null);

// Làm mới số chưa đọc, danh sách trong popup và danh sách ở trang Notifications.
export const refreshNotifications = () =>
  mutate((key) => key === UNREAD_KEY || (Array.isArray(key) && (key[0] === 'notifications' || key[0] === POPOVER_KEY)));