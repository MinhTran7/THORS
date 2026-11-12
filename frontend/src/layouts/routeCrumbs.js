import { matchPath } from 'react-router-dom';
import { warehouseMenu } from 'features/warehouse/model';
import { navFor } from './navigation';

// Breadcrumb mặc định theo đường dẫn, dùng cho những trang không tự gọi useCrumbs.
// Trang nào gọi useCrumbs thì giá trị của trang đó được ưu tiên.
// Đặt pattern cụ thể trước pattern chung.
const ROUTE_CRUMBS = [
  ['/workspace', ['Bảng điều khiển']],
  ['/profile', ['Hồ sơ']],
  ['/notifications', ['Thông báo']],
  ['/cart', ['Giỏ hàng']],
  ['/checkout', ['Giỏ hàng', 'Thanh toán']],
  ['/order-success', ['Đơn hàng', 'Đặt hàng thành công']],
  ['/orders', ['Đơn hàng']],
  ['/orders/:id', ['Đơn hàng', 'Chi tiết đơn hàng']],
  ['/addresses', ['Tài khoản', 'Địa chỉ của tôi']],
  ['/accounts', ['Tài khoản']],
  ['/system-log', ['Nhật ký hệ thống']],
  ['/in-store-sales', ['Bán hàng tại quầy', 'Bán hàng']],
  ['/in-store-sales/history', ['Bán hàng tại quầy', 'Danh sách hóa đơn']],
  ['/in-store-sales/history/:orderId', ['Bán hàng tại quầy', 'Danh sách hóa đơn', 'Chi tiết hóa đơn']],
  ['/family', ['Gia đình']],
  ['/categories', ['Danh mục']],
  ['/products', ['Sản phẩm']],
  ['/products/add', ['Sản phẩm', 'Thêm sản phẩm']],
  ['/products/:productId/edit', ['Sản phẩm', 'Sửa sản phẩm']],
  ['/products/:productId', ['Sản phẩm', 'Chi tiết sản phẩm']],
  ['/returns', ['Hoàn hàng / Đổi trả']],
  ['/promotions', ['Khuyến mãi']],
  ['/promotions/add', ['Khuyến mãi', 'Thêm khuyến mãi']],
  ['/promotions/:promotionId/edit', ['Khuyến mãi', 'Sửa khuyến mãi']],
  ['/promotions/:promotionId', ['Khuyến mãi', 'Chi tiết khuyến mãi']],
  ...warehouseMenu.map(([key, label]) => [`/warehouse/${key}/*`, ['Kho', label]])
];

function crumbsForPath(pathname) {
  const hit = ROUTE_CRUMBS.find(([pattern]) => matchPath(pattern, pathname));
  return hit ? hit[1] : [];
}

const CRUMB_PATHS = {
  ...Object.fromEntries(
    ROUTE_CRUMBS.filter(([pattern]) => !pattern.includes(':') && !pattern.includes('*'))
      .reverse()
      .map(([pattern, labels]) => [labels[labels.length - 1], pattern])
  ),
  'Trang chủ': '/'
};

function menuTrail(role, pathname) {
  const entries = navFor(role).flatMap((entry) => (entry.children ? entry.children.map((item) => ({ group: entry.label, item })) : [{ item: entry }]));
  const matches = entries.filter(({ item }) => pathname === item.to || (item.to !== '/' && pathname.startsWith(`${item.to}/`)));
  return matches.sort((a, b) => b.item.to.length - a.item.to.length)[0];
}

export function buildCrumbs(pageCrumbs, pathname, role) {
  const labels = pageCrumbs.length ? pageCrumbs : crumbsForPath(pathname);
  const hit = menuTrail(role, pathname);
  if (!hit) return labels.map((label, index) => ({ label, to: index < labels.length - 1 ? CRUMB_PATHS[label] : null }));
  const trail = [...(hit.group ? [{ label: hit.group }] : []), { label: hit.item.label, to: hit.item.to }];
  const extra = pathname !== hit.item.to && labels[labels.length - 1];
  return extra && extra !== hit.item.label ? [...trail, { label: extra }] : trail;
}
