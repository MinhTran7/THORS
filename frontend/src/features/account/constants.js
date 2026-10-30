export const STORE_NAME = 'THORS Studio'; // chưa có bảng cửa hàng trong DB nên dùng hằng số
export const PROFILE_TAGLINE = 'THOUGHTFUL RETAIL, EVERY DAY.';

export const ROLE_LABEL = {
  ADMIN: 'Admin',
  OWNER: 'Shop Owner',
  STAFF: 'Staff',
  FAMILY_MEMBER: 'Family',
  CUSTOMER: 'Customer'
};

// Tên đầy đủ dùng trong thanh điều hướng/breadcrumb
export const ROLE_TITLE = { ...ROLE_LABEL, ADMIN: 'Administrator' };

export const ACCOUNT_STATUS = {
  ACTIVE: { label: 'Active', tone: 'success' },
  DISABLED: { label: 'Inactive', tone: 'neutral' },
  LOCKED: { label: 'Locked', tone: 'danger' },
  PENDING_VERIFICATION: { label: 'Pending', tone: 'warning' }
};

export const LOG_STATUS = {
  SUCCESS: { label: 'Success', tone: 'success' },
  WARNING: { label: 'Warning', tone: 'warning' },
  FAILED: { label: 'Failed', tone: 'danger' }
};

export const PAGE_SIZE = 10;