import {
  AppstoreOutlined,
  EnvironmentOutlined,
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
const addresses = { to: '/addresses', label: 'Địa chỉ của tôi', icon: <EnvironmentOutlined /> };

// Mục bán hàng tại quầy dạng menu đa cấp xổ xuống
const inStoreSales = {
  label: 'Bán hàng tại quầy',
  icon: <ShoppingCartOutlined />,
  children: [
    { to: '/in-store-sales', label: 'Bán hàng', icon: <ShoppingCartOutlined /> },
    { to: '/in-store-sales/history', label: 'Lịch sử đơn', icon: <FileTextOutlined /> }
  ]
};

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
    inStoreSales,
    { to: '/promotions', label: 'Khuyến mãi', icon: <TagsOutlined /> },
    profile
  ],
  FAMILY_MEMBER: [
    dashboard,
    orders,
    inStoreSales,
    profile
  ],
  CUSTOMER: [dashboard, orders, addresses, profile]
};

export const navFor = (role) => NAVIGATION[role] ?? [dashboard, profile];
