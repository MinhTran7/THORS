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
  detail: (id) => api(`/notifications/${id}`),
  unreadCount: () => api('/notifications/unread-count'),
  markRead: (id) => api(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => post('/notifications/read-all'),
  // { available, promotion }: available = false khi DB chưa có bảng notification_mute (ẩn công tắc)
  preferences: () => api('/notifications/preferences'),
  updatePreferences: (body) => api('/notifications/preferences', { method: 'PUT', body })
};

export const PREFERENCES_KEY = 'notifications-preferences';

// Thông báo gắn với thực thể nào thì bấm vào mở trang của thực thể đó.
// Thêm dòng mới ở đây khi có thêm loại related_entity_type.
const ENTITY_ROUTES = {
  ORDER: (id) => `/orders/${id}`,
  // Khách chỉ có trang danh sách khuyến mãi đang chạy (chưa có trang chi tiết cho khách)
  PROMOTION: () => '/promotions',
  // Yêu cầu đặt lại mật khẩu của Owner chỉ gửi cho Admin; Admin xử lý ở trang Accounts.
  USER: () => '/accounts'
};

export const entityPath = (item) => (item.relatedEntityId != null ? ENTITY_ROUTES[item.relatedEntityType]?.(item.relatedEntityId) : null);

// Khách hàng: thông báo gắn với đơn thì mở đơn, còn lại (vd. bảo mật tài khoản) mở trang chi tiết thông báo
export const customerNotificationPath = (item) => entityPath(item) ?? `/notifications/${item.id}`;

// Làm mới số chưa đọc, danh sách trong popup và danh sách ở trang Notifications.
export const refreshNotifications = () =>
  mutate((key) => key === UNREAD_KEY || (Array.isArray(key) && (key[0] === 'notifications' || key[0] === POPOVER_KEY)));