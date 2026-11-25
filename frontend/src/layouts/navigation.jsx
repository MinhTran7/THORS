import {
  AppstoreOutlined,
  ContactsOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  EnvironmentOutlined,
  FacebookOutlined,
  FileAddOutlined,
  FileDoneOutlined,
  GiftOutlined,
  GlobalOutlined,
  HistoryOutlined,
  HomeOutlined,
  IdcardOutlined,
  ImportOutlined,
  InboxOutlined,
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
  TagOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UserOutlined,
  ColumnHeightOutlined,
  CameraOutlined,
  WarningOutlined
} from '@ant-design/icons';


const dashboard = { to: '/workspace', label: 'Bảng điều khiển', icon: <DashboardOutlined /> };
const profile = { to: '/profile', label: 'Hồ sơ cá nhân', icon: <UserOutlined /> };
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
      { to: '/warehouse/defects', label: 'Xử lý hàng lỗi', icon: <WarningOutlined /> }
    ]
  },
  {
    label: 'Khuyến mãi',
    icon: <PercentageOutlined />,
    children: [
      { to: '/promotions', label: 'Khuyến mãi sản phẩm', icon: <GiftOutlined /> },
      { to: '/order-discounts', label: 'Giảm giá đơn hàng', icon: <TagOutlined /> }
    ]
  },
  {
    label: 'Kênh bán hàng',
    icon: <ShareAltOutlined />,
    children: [
      { to: '/facebook', label: 'Facebook', icon: <FacebookOutlined /> },
      { to: '/website', label: 'Website', icon: <GlobalOutlined /> }
    ]
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
      { to: '/warehouse/locations', label: 'Vị trí kho', icon: <PushpinOutlined /> }
    ]
  },
  { to: '/family', label: 'Family', icon: <TeamOutlined /> }
];

// Các trang chỉ OWNER được vào (khớp với RequireAuth roles={['OWNER']} trong routes/index.jsx).
const OWNER_ONLY = new Set(['/products', '/categories', '/returns', '/family', '/promotions', '/order-discounts', '/website']);

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
    { to: '/body-profile', label: 'Số đo của tôi', icon: <ColumnHeightOutlined /> },
    { to: '/try-on-history', label: 'Ảnh mặc thử', icon: <CameraOutlined /> },
    profile
  ]
};

export const navFor = (role) => NAVIGATION[role] ?? [dashboard, profile];
