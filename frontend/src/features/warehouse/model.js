export const warehouseMenu = [
  ['inventory', 'Tồn kho'],
  ['orders', 'Đặt hàng nhập'],
  ['receipts', 'Nhập hàng'],
  ['returns', 'Trả hàng nhập'],
  ['layout', 'Bố cục kho'],
  ['suppliers', 'Nhà cung cấp'],
  ['locations', 'Vị trí lưu kho']
];
export const statusLabel = {
  DRAFT: 'Nháp',
  PENDING_CONFIRMATION: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
  CLOSED: 'Đã đóng',
  AVAILABLE: 'Còn chỗ',
  FULL: 'Đã đầy',
  BLOCKED: 'Tạm khóa',
  MAINTENANCE: 'Bảo trì'
};
export const typeLabel = { PURCHASE_ORDER: 'Phiếu đặt hàng', RECEIPT: 'Phiếu nhập hàng', SUPPLIER_RETURN: 'Phiếu trả nhà cung cấp' };
export const money = (v) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(v || 0));
export const number = (v) => new Intl.NumberFormat('vi-VN').format(Number(v || 0));
export const variantLabel = (v) => `${v.product_name} · ${v.color} · ${v.size}`;
export const docCode = (d) =>
  `${d.receipt_type === 'PURCHASE_ORDER' ? 'PD' : d.receipt_type === 'RECEIPT' ? 'PN' : 'PT'}${String(d.receipt_id).padStart(5, '0')}`;
export const totalQty = (d) => (d.items || []).reduce((n, i) => n + Number(i.quantity), 0);
export const handledQty = (d) => (d.items || []).reduce((n, i) => n + Number(i.handled_quantity), 0);
export const when = (v) => (v ? new Date(v).toLocaleString('vi-VN') : '—');
export const locationLabel = (data, id) => {
  const t = data.tiers.find((x) => x.shelf_level_id === id);
  const r = data.racks.find((x) => x.rack_id === t?.rack_id);
  return t && r ? `${r.rack_code}${t.level_number}` : 'Chưa xếp vị trí';
};
