import { humanize } from 'features/account/format';

// Nhãn hiển thị cho cột notification.type. Loại chưa khai báo ở đây vẫn hiện được nhờ humanize().
export const NOTIFICATION_TYPE = {
  ACCOUNT_SECURITY: 'Bảo mật tài khoản',
  PASSWORD_RESET_REQUEST: 'Yêu cầu đặt lại mật khẩu',
  ORDER_STATUS: 'Trạng thái đơn hàng',
  PROMOTION: 'Khuyến mãi'
};

export const notificationTypeLabel = (type) => NOTIFICATION_TYPE[type] ?? (type ? humanize(type) : '');