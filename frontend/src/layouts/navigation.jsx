import {
  AppstoreOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  ImportOutlined,
  InboxOutlined,
  LayoutOutlined,
  RollbackOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  TagsOutlined,
  TeamOutlined,
  UserOutlined
} from '@ant-design/icons';
import { warehouseMenu } from 'features/warehouse/model';

const dashboard = {
  to: '/workspace',
  label: 'Dashboard',
  icon: <AppstoreOutlined />
};

const profile = {
  to: '/profile',
  label: 'Profile',
  icon: <UserOutlined />
};

const orders = {
  to: '/orders',
  label: 'Đơn hàng',
  icon: <ShoppingOutlined />
};

const warehouseIcons = [
  <InboxOutlined />,
  <ShoppingCartOutlined />,
  <ImportOutlined />,
  <RollbackOutlined />,
  <LayoutOutlined />,
  <TeamOutlined />,
  <EnvironmentOutlined />
];

const warehouseItems = warehouseMenu.map(([key, label], index) => ({
  to: `/warehouse/${key}`,
  label,
  icon: warehouseIcons[index] ?? <InboxOutlined />
}));

// Mỗi vai trò một menu.
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
    { to: '/family', label: 'Family', icon: <TeamOutlined /> },
    { to: '/in-store-sales', label: 'In-store Sales', icon: <ShoppingCartOutlined /> },
    { to: '/promotions', label: 'Khuyến mãi', icon: <TagsOutlined /> },
    ...warehouseItems,
    profile
  ],
  FAMILY_MEMBER: [
    dashboard,
    orders,
    ...warehouseItems,
    profile
  ],
  CUSTOMER: [dashboard, orders, profile]
};

export const navFor = (role) => NAVIGATION[role] ?? [dashboard, profile];