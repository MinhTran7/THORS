import { humanize } from 'features/account/format';

// Nhãn hiển thị cho cột notification.type. Loại chưa khai báo ở đây vẫn hiện được nhờ humanize().
export const NOTIFICATION_TYPE = {
  ACCOUNT_SECURITY: 'Bảo mật tài khoản',
  PASSWORD_RESET_REQUEST: 'Yêu cầu đặt lại mật khẩu',
  ORDER_STATUS: 'Trạng thái đơn hàng',
  PROMOTION: 'Khuyến mãi',
  WAREHOUSE_PENDING: 'Phiếu kho chờ xác nhận',
  WAREHOUSE_SHORTAGE: 'Đơn đặt còn thiếu hàng',
  STOCK_OUT: 'Hết hàng',
  STOCK_LOW: 'Sắp hết hàng',
  WAREHOUSE_MOVE_PENDING: 'Yêu cầu xếp kệ',
  WAREHOUSE_MOVE_APPROVED: 'Yêu cầu xếp kệ',
  WAREHOUSE_MOVE_REJECTED: 'Yêu cầu xếp kệ',
  LOCATION_MOVE_REQUEST: 'Yêu cầu xếp kệ',
  LOCATION_MOVE_APPROVE: 'Yêu cầu xếp kệ',
  LOCATION_MOVE_REJECT: 'Yêu cầu xếp kệ',
  LOCATION_MOVE_CANCEL: 'Yêu cầu xếp kệ'
};

export const notificationTypeLabel = (type) => NOTIFICATION_TYPE[type] ?? (type ? humanize(type) : '');