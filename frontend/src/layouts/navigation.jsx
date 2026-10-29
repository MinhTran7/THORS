import {
  AppstoreOutlined,
  FileTextOutlined,
  RollbackOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  TagsOutlined,
  TeamOutlined,
  UserOutlined
} from '@ant-design/icons';

const dashboard = { to: '/workspace', label: 'Dashboard', icon: <AppstoreOutlined /> };
const profile = { to: '/profile', label: 'Profile', icon: <UserOutlined /> };
const orders = { to: '/orders', label: 'Đơn hàng', icon: <ShoppingOutlined /> };

// Mỗi vai trò một menu. Các feature khác (Products, Categories...) thêm mục của mình vào đúng mảng của vai trò.
export const NAVIGATION = {
  ADMIN: [
    dashboard,
    { to: '/accounts', label: 'Accounts', icon: <TeamOutlined /> },
    { to: '/system-log', label: 'System Log', icon: <FileTextOutlined /> },
    profile
  ],
  OWNER: [
    dashboard,
    { to: '/products', label: 'Products', icon: <ShopOutlined /> },
    { to: '/categories', label: 'Categories', icon: <AppstoreOutlined /> },
    orders,
    { to: '/returns', label: 'Hoàn hàng / Đổi trả', icon: <RollbackOutlined /> },
    { to: '/staff', label: 'Family', icon: <TeamOutlined /> },
    { to: '/in-store-sales', label: 'In-store Sales', icon: <ShoppingCartOutlined /> },
    { to: '/promotions', label: 'Khuyến mãi', icon: <TagsOutlined /> },
    profile
  ],
  FAMILY_MEMBER: [dashboard, orders, profile],
  CUSTOMER: [dashboard, orders, profile]
};

export const navFor = (role) => NAVIGATION[role] ?? [dashboard, profile];
