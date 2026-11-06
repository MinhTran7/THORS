// Thao tác theo trạng thái hiện tại của đơn. Dùng chung cho danh sách và trang chi tiết.
// Backend vẫn kiểm tra lại quyền và luồng chuyển trạng thái, đây chỉ để quyết định hiện nút nào.

// Owner: xác nhận, từ chối, giao và xác nhận đã giao. "Hoàn thành" do khách bấm "Đã nhận hàng"
// (hoặc hệ thống tự hoàn tất sau một số ngày), không phải Owner.
export const OWNER_ACTIONS = {
  PENDING_CONFIRMATION: [
    { to: 'AWAITING_PICKUP', label: 'Xác nhận đơn', primary: true },
    { to: 'REJECTED', label: 'Từ chối đơn', askReason: true }
  ],
  AWAITING_PICKUP: [{ to: 'SHIPPING', label: 'Giao hàng', primary: true, askCarrier: true }],
  SHIPPING: [{ to: 'DELIVERED', label: 'Xác nhận đã giao', primary: true }]
};

// Hãng giao tự báo trạng thái về hệ thống: khi đã tạo vận đơn, đơn tự chuyển "Đang giao" lúc hãng lấy
// hàng và "Đã giao" lúc giao xong, Owner không bấm tay
export const CARRIER_MANAGED = ['GHN'];

/** Nút của Owner cho một đơn; carrier lấy từ order.shippingCarrier (danh sách) hoặc order.shipment.carrier (chi tiết). */
export const ownerActionsFor = (order) => {
  const actions = OWNER_ACTIONS[order?.orderStatus] ?? [];
  const carrier = order?.shippingCarrier ?? order?.shipment?.carrier;
  return CARRIER_MANAGED.includes(carrier) ? actions.filter((a) => a.to !== 'SHIPPING' && a.to !== 'DELIVERED') : actions;
};

// Khách: hủy khi cửa hàng chưa xác nhận, xác nhận đã nhận hàng khi đơn đã giao
const CANCEL = { to: 'CANCELLED', label: 'Hủy đơn', askReason: true };
export const CUSTOMER_ACTIONS = {
  AWAITING_PAYMENT: [CANCEL],
  PENDING_CONFIRMATION: [CANCEL],
  DELIVERED: [{ to: 'COMPLETED', label: 'Đã nhận hàng', primary: true }]
};

// Hình thức giao: địa chỉ gần thì cửa hàng tự giao, địa chỉ xa mới cần đơn vị vận chuyển
export const CARRIERS = [
  { value: 'SELF', label: 'Cửa hàng tự giao' },
  { value: 'GHN', label: 'Giao Hàng Nhanh' },
  { value: 'GHTK', label: 'Giao Hàng Tiết Kiệm' },
  { value: 'VIETTEL_POST', label: 'Viettel Post' },
  { value: 'JT', label: 'J&T Express' }
];

export const carrierLabel = (code) => CARRIERS.find((c) => c.value === code)?.label ?? code;