export const STORE_NAME = 'THORS Studio'; // chưa có bảng cửa hàng trong DB nên dùng hằng số
export const PROFILE_TAGLINE = 'THOUGHTFUL RETAIL, EVERY DAY.';

export const ROLE_LABEL = {
  ADMIN: 'Quản trị viên',
  OWNER: 'Chủ cửa hàng',
  STAFF: 'Nhân viên',
  FAMILY_MEMBER: 'Thành viên gia đình',
  CUSTOMER: 'Khách hàng'
};

// Tên đầy đủ dùng trong thanh điều hướng/breadcrumb
export const ROLE_TITLE = { ...ROLE_LABEL, ADMIN: 'Quản trị hệ thống' };

export const ACCOUNT_STATUS = {
  ACTIVE: { label: 'Hoạt động', tone: 'success' },
  DISABLED: { label: 'Ngừng hoạt động', tone: 'neutral' },
  LOCKED: { label: 'Đã khóa', tone: 'danger' },
  PENDING_VERIFICATION: { label: 'Chờ xác minh', tone: 'warning' }
};

export const LOG_STATUS = {
  SUCCESS: { label: 'Thành công', tone: 'success' },
  FAILED: { label: 'Thất bại', tone: 'danger' }
};

export const PAGE_SIZE = 10;