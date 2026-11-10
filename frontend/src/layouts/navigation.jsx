import {
  AppstoreOutlined,
  ContactsOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  EnvironmentOutlined,
  FacebookOutlined,
  FileAddOutlined,
  FileDoneOutlined,
  HistoryOutlined,
  HomeOutlined,
  IdcardOutlined,
  ImportOutlined,
  InboxOutlined,
  LayoutOutlined,
  MobileOutlined,
  PercentageOutlined,
  PieChartOutlined,
  PushpinOutlined,
  ReconciliationOutlined,
  RollbackOutlined,
  ShareAltOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  SkinOutlined,
  SwapOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UserOutlined
} from '@ant-design/icons';


const dashboard = { to: '/workspace', label: 'Dashboard', icon: <DashboardOutlined /> };
const profile = { to: '/profile', label: 'Profile', icon: <UserOutlined /> };
const promotions = { to: '/promotions', label: 'Khuyến mãi', icon: <PercentageOutlined /> };

// ─── Menu đầy đủ của chủ cửa hàng ───
const OWNER_MENU = [
  { label: 'Tổng quan', icon: <PieChartOutlined />, children: [dashboard] },
  {
    label: 'Sản phẩm',
    icon: <SkinOutlined />,
    children: [
      { to: '/products', label: 'Danh sách sản phẩm', icon: <UnorderedListOutlined /> },
      { to: '/categories', label: 'Danh mục', icon: <AppstoreOutlined /> }
    ]
  },
  {
    label: 'Bán hàng',
    icon: <ShoppingCartOutlined />,
    children: [
      { to: '/in-store-sales', label: 'Bán tại quầy', icon: <ShopOutlined /> },
      { to: '/in-store-sales/history', label: 'Đơn hàng tại quầy', icon: <FileDoneOutlined /> },
      { to: '/orders', label: 'Đơn hàng online', icon: <MobileOutlined /> },
      { to: '/returns', label: 'Đổi trả', icon: <SwapOutlined /> },
      promotions
    ]
  },
  {
    label: 'Kênh bán hàng',
    icon: <ShareAltOutlined />,
    children: [{ to: '/facebook', label: 'Facebook', icon: <FacebookOutlined /> }]
  },
  {
    label: 'Nhập hàng',
    icon: <ImportOutlined />,
    children: [
      { to: '/warehouse/suppliers', label: 'Nhà cung cấp', icon: <ContactsOutlined /> },
      { to: '/warehouse/orders', label: 'Đơn đặt hàng nhập', icon: <FileAddOutlined /> },
      { to: '/warehouse/receipts', label: 'Phiếu nhập hàng', icon: <ReconciliationOutlined /> },
      { to: '/warehouse/returns', label: 'Trả hàng nhà cung cấp', icon: <RollbackOutlined /> }
    ]
  },
  {
    label: 'Kho hàng',
    icon: <DatabaseOutlined />,
    children: [
      { to: '/warehouse/inventory', label: 'Tồn kho', icon: <InboxOutlined /> },
      { to: '/warehouse/layout', label: 'Bố cục kho', icon: <LayoutOutlined /> },
      { to: '/warehouse/locations', label: 'Vị trí kho', icon: <PushpinOutlined /> }
    ]
  },
  { to: '/family', label: 'Family', icon: <TeamOutlined /> }
];

// Các trang chỉ OWNER được vào (khớp với RequireAuth roles={['OWNER']} trong routes/index.jsx).
const OWNER_ONLY = new Set(['/products', '/categories', '/returns', '/family']);

const without = (menu, hidden) =>
  menu
    .map((item) => (item.children ? { ...item, children: item.children.filter((c) => !hidden.has(c.to)) } : item))
    .filter((item) => (item.children ? item.children.length > 0 : !hidden.has(item.to)));

export const NAVIGATION = {
  ADMIN: [
    dashboard,
    { to: '/accounts', label: 'Accounts', icon: <IdcardOutlined /> },
    { to: '/system-log', label: 'System Log', icon: <HistoryOutlined /> },
    profile
  ],
  OWNER: OWNER_MENU,

  FAMILY_MEMBER: without(OWNER_MENU, OWNER_ONLY),
  CUSTOMER: [
    // Trang chủ của khách hàng: mở thẳng trang cửa hàng (ShopPage, đường dẫn '/')
    { to: '/', label: 'Trang chủ', icon: <HomeOutlined /> },
    promotions,
    { to: '/orders', label: 'Đơn hàng', icon: <ShoppingOutlined /> },
    { to: '/addresses', label: 'Địa chỉ của tôi', icon: <EnvironmentOutlined /> },
    profile
  ]
};

export const navFor = (role) => NAVIGATION[role] ?? [dashboard, profile];
