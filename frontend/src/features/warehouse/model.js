// Các mục hiện trong menu "Kho cửa hàng". Kiểm kê (/warehouse/counts) và Báo cáo tồn kho
// (/warehouse/report) vẫn có route nhưng không hiện trong menu.
export const warehouseMenu = [
  ['inventory', 'Tồn kho'],
  ['orders', 'Đặt hàng nhập'],
  ['receipts', 'Nhập hàng'],
  ['returns', 'Trả hàng nhà cung cấp'],
  ['suppliers', 'Nhà cung cấp'],
  ['locations', 'Vị trí lưu kho']
];
export const statusLabel = {
  DRAFT: 'Nháp',
  PENDING_CONFIRMATION: 'Chờ xác nhận',
  APPROVED: 'Chờ xuất trả',
  CONFIRMED: 'Đã xác nhận',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
  CLOSED: 'Đã đóng',
  AVAILABLE: 'Còn chỗ',
  FULL: 'Đã đầy',
  BLOCKED: 'Tạm khóa',
  MAINTENANCE: 'Bảo trì'
};
export const typeLabel = { PURCHASE_ORDER: 'Phiếu đặt hàng', RECEIPT: 'Phiếu nhập hàng', SUPPLIER_RETURN: 'Phiếu trả hàng nhà cung cấp' };
// Supplier returns: approval and physical dispatch are separate steps.
const returnStatusLabel = { PENDING_CONFIRMATION: 'Chờ duyệt', APPROVED: 'Chờ xuất trả', CONFIRMED: 'Đã xuất trả' };
// Receipts: only what matters on the receiving page – waiting, received, cancelled.
const receiptStatusLabel = {
  DRAFT: 'Chờ nhận hàng',
  PENDING_CONFIRMATION: 'Chờ chủ cửa hàng xác nhận',
  APPROVED: 'Chờ kiểm hàng',
  CONFIRMED: 'Đã nhận',
  REJECTED: 'Đã hủy',
  CANCELLED: 'Đã hủy'
};
export const statusText = (status, type) =>
  (type === 'SUPPLIER_RETURN' && returnStatusLabel[status]) ||
  (type === 'RECEIPT' && receiptStatusLabel[status]) ||
  statusLabel[status] ||
  status;
// Receipt line still returnable: received − dispatched (confirmed) returns. See returnableQty.
// Money/goods coming back from the supplier after dispatch; separate from the document status.
// Supplier return list: one combined status (document step + money) instead of two columns.
export const returnStages = [
  ['DRAFT', 'Nháp', 'default'],
  ['PENDING_CONFIRMATION', 'Chờ duyệt', 'warning'],
  ['APPROVED', 'Chờ xuất trả', 'info'],
  ['UNPAID', 'Chờ NCC trả tiền', 'warning'],
  ['PARTIAL', 'NCC trả một phần', 'info'],
  ['DONE', 'Hoàn tất', 'success'],
  ['REJECTED', 'Từ chối', 'error'],
  ['CANCELLED', 'Đã hủy', 'default']
];
export const returnStage = (d) =>
  d.status !== 'CONFIRMED'
    ? d.status
    : Number(d.unsettled_amount || 0) <= 0
      ? 'DONE'
      : Number(d.settled_amount || 0) > 0
        ? 'PARTIAL'
        : 'UNPAID';
export const settlementStatusLabel = {
  NOT_APPLICABLE: 'Chưa xuất trả',
  UNSETTLED: 'NCC chưa trả',
  PARTIAL: 'NCC trả một phần',
  SETTLED: 'NCC đã trả đủ'
};
export const settlementTypeLabel = {
  PAYMENT: 'Thanh toán',
  REFUND: 'Nhận hoàn tiền',
  DEBT_OFFSET: 'Giảm công nợ',
  CREDIT_HOLD: 'Giữ tiền đối trừ',
  CREDIT_USE: 'Dùng tiền đối trừ',
  EXCHANGE: 'Đổi hàng'
};
export const paymentMethodLabel = { CASH: 'Tiền mặt', BANK_TRANSFER: 'Chuyển khoản' };
// Only dispatched returns (handled_quantity) reduce it; approved returns waiting for dispatch do not.
export const returnableQty = (i) => Math.max(0, Number(i.quantity) - Number(i.handled_quantity || 0));
export const money = (v) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(v || 0));
export const number = (v) => new Intl.NumberFormat('vi-VN').format(Number(v || 0));
export const variantLabel = (v) => `${v.product_name} · ${v.color} · ${v.size}`;
export const docCode = (d) =>
  `${d.receipt_type === 'PURCHASE_ORDER' ? 'PD' : d.receipt_type === 'RECEIPT' ? 'PN' : 'PT'}${String(d.receipt_id).padStart(5, '0')}`;
export const totalQty = (d) => (d.items || []).reduce((n, i) => n + Number(i.quantity), 0);
export const handledQty = (d) => (d.items || []).reduce((n, i) => n + Number(i.handled_quantity), 0);
// Search helpers: ignore case and Vietnamese accents ("giay dep" finds "Giày Dép"); every typed word must match.
export const plainText = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
export const textMatches = (text, input) => {
  const hay = plainText(text);
  return plainText(input)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
};
export const when = (v) => (v ? new Date(v).toLocaleString('vi-VN') : '—');
export const locationLabel = (data, id) => {
  const t = data.tiers.find((x) => x.shelf_level_id === id);
  const r = data.racks.find((x) => x.rack_id === t?.rack_id);
  return t && r ? `${r.rack_code}${t.level_number}` : 'Chưa xếp vị trí';
};
// Receiving progress of a purchase order, derived by the backend from confirmed receipts.
export const progressLabel = {
  NOT_APPLICABLE: 'Chưa áp dụng',
  NOT_RECEIVED: 'Chưa nhận',
  PARTIAL: 'Nhận một phần',
  RECEIVED: 'Đã nhận đủ',
  CLOSED_SHORT: 'Đóng – còn thiếu'
};
export const progressColor = {
  NOT_APPLICABLE: 'default',
  NOT_RECEIVED: 'info',
  PARTIAL: 'warning',
  RECEIVED: 'success',
  CLOSED_SHORT: 'error'
};
// One combined state for the purchase-order list: document status + receiving progress.
// Confirmed orders collapse to 4 states; draft/pending/rejected keep their document status.
export const orderStateLabel = {
  WAITING: 'Chờ nhận hàng',
  RECEIVED: 'Đã nhận đủ',
  CLOSED_SHORT: 'Đóng – còn thiếu',
  CANCELLED: 'Đã hủy',
  DRAFT: 'Nháp',
  PENDING_CONFIRMATION: 'Chờ xác nhận',
  REJECTED: 'Từ chối'
};
export const orderStateColor = {
  WAITING: 'warning',
  RECEIVED: 'success',
  CLOSED_SHORT: 'error',
  CANCELLED: 'default',
  DRAFT: 'default',
  PENDING_CONFIRMATION: 'info',
  REJECTED: 'error'
};
// Combined state; the backend sends it as `state`, computed here too so the list never shows raw codes.
// An order closed with nothing received counts as cancelled.
export const orderState = (d) => {
  if (d.state && orderStateLabel[d.state]) return d.state;
  if (d.status === 'CANCELLED') return 'CANCELLED';
  if (d.progress === 'CLOSED_SHORT') return Number(d.fulfilled_quantity) > 0 ? 'CLOSED_SHORT' : 'CANCELLED';
  if (d.progress === 'RECEIVED') return 'RECEIVED';
  if (['NOT_RECEIVED', 'PARTIAL'].includes(d.progress) || d.status === 'CONFIRMED') return 'WAITING';
  return d.status;
};
export const orderCode = (id) => `PD${String(id).padStart(5, '0')}`;
export const supplierKey = (v) =>
  String(v || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('vi');
// Inventory (Tồn kho)
export const movementLabel = {
  RECEIPT: 'Nhập hàng',
  ORDER_OUT: 'Xuất bán',
  SUPPLIER_RETURN: 'Trả nhà cung cấp',
  ADJUSTMENT: 'Điều chỉnh kiểm kê',
  RESTOCK: 'Khách trả, nhập lại',
  MOVE: 'Chuyển vị trí'
};
export const stockStateLabel = { IN: 'Còn hàng', LOW: 'Sắp hết', OUT: 'Hết hàng' };
export const stockStateColor = { IN: 'success', LOW: 'warning', OUT: 'error' };
export const countCode = (id) => `KK${String(id).padStart(5, '0')}`;
export const countReasonLabel = {
  COUNT_ERROR: 'Sai lệch ghi nhận trước đây',
  DAMAGED: 'Hàng hư hỏng',
  LOST: 'Thất lạc / mất',
  FOUND: 'Tìm thấy hàng',
  MISSING_DOCUMENT: 'Quên lập phiếu (nhập/bán/trả)'
};
// Mã sản phẩm SP + 5 số mã sản phẩm, khớp WarehouseInventory.productCode ở backend.
export const productCode = (id) => `SP${String(id).padStart(5, '0')}`;
// Serial từng chiếc (bảng product_unit), khớp ProductUnits ở backend.
export const unitStatusLabel = {
  PENDING: 'Chờ nhận',
  IN_STOCK: 'Trong kho',
  SOLD: 'Đã bán',
  RETURNED_SUPPLIER: 'Đã trả NCC',
  LOST: 'Mất / hỏng',
  VOID: 'Tem đã hủy'
};
export const unitStatusColor = { PENDING: 'info', IN_STOCK: 'success', SOLD: 'default', RETURNED_SUPPLIER: 'warning', LOST: 'error', VOID: 'default' };
// Hàng lỗi từng chiếc (bảng product_unit_defect), khớp WarehouseDefects ở backend.
export const defectSourceLabel = { SUPPLIER: 'Lỗi từ nhà cung cấp', WAREHOUSE: 'Hư trong kho', CUSTOMER: 'Khách trả lại' };
export const defectStatusLabel = { OPEN: 'Đang lỗi', FIXED: 'Đã sửa', DISCARDED: 'Đã bỏ', RETURNED: 'Đã trả NCC', SOLD: 'Đã bán' };
export const defectStatusColor = { OPEN: 'error', FIXED: 'success', DISCARDED: 'default', RETURNED: 'warning', SOLD: 'default' };
// Tem serial: mỗi chiếc một tem, khóa theo mã serial thay vì theo biến thể.
export const unitLabel = (u) => ({ ...u, label_key: u.serial_code, barcode: u.serial_code });
export const skuLabel = (v) => `${v.product_code} · #${v.detail_id}`;
// Where a stock-card row's source document opens (existing pages, prefilled by id).
export const docLink = (m) =>
  ({
    PURCHASE_ORDER: `/warehouse/orders?id=${m.doc_id}`,
    RECEIPT: `/warehouse/receipts?id=${m.doc_id}`,
    SUPPLIER_RETURN: `/warehouse/returns?id=${m.doc_id}`,
    ONLINE_ORDER: `/orders/${m.doc_id}`,
    IN_STORE_ORDER: `/in-store-sales/history/${m.doc_id}`,
    CUSTOMER_RETURN: `/returns`,
    STOCK_COUNT: `/warehouse/counts?id=${m.doc_id}`
  })[m.doc_kind];
