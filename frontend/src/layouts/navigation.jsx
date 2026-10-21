import { AppstoreOutlined, FileTextOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';

const dashboard = { to: '/workspace', label: 'Dashboard', icon: <AppstoreOutlined /> };
const profile = { to: '/profile', label: 'Profile', icon: <UserOutlined /> };

// Mỗi vai trò một menu. Các feature khác (Products, Categories...) thêm mục của mình vào đúng mảng của vai trò.
export const NAVIGATION = {
  ADMIN: [
    dashboard,
    { to: '/accounts', label: 'Accounts', icon: <TeamOutlined /> },
    { to: '/system-log', label: 'System Log', icon: <FileTextOutlined /> },
    profile
  ],
  OWNER: [dashboard, { to: '/staff', label: 'Staff', icon: <TeamOutlined /> }, profile]
};

export const navFor = (role) => NAVIGATION[role] ?? [dashboard, profile];