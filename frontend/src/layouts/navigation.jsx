import {
  AppstoreOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  HomeOutlined,
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

const dashboard = { to: '/workspace', label: 'Dashboard', icon: <AppstoreOutlined /> };
// Trang chủ của khách hàng: mở thẳng trang cửa hàng (ShopPage, đường dẫn '/')
const home = { to: '/', label: 'Trang chủ', icon: <HomeOutlined /> };
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

const warehouseIcons = [
  <InboxOutlined />,
  <ShoppingCartOutlined />,
  <ImportOutlined />,
  <RollbackOutlined />,
  <LayoutOutlined />,
  <TeamOutlined />,
  <EnvironmentOutlined />
];

const warehouse = warehouseMenu.map(([key, label], index) => ({
  to: `/warehouse/${key}`,
  label,
  icon: warehouseIcons[index]
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
    { to: '/staff', label: 'Family', icon: <TeamOutlined /> },
    inStoreSales,
    { to: '/promotions', label: 'Khuyến mãi', icon: <TagsOutlined /> },
    ...warehouse,
    profile
  ],
  FAMILY_MEMBER: [dashboard, orders, inStoreSales, ...warehouse, profile],
  CUSTOMER: [
    home,
    { to: '/promotions', label: 'Khuyến mãi', icon: <TagsOutlined /> },
    orders,
    addresses,
    profile
  ]
};

export const navFor = (role) => NAVIGATION[role] ?? [dashboard, profile];
