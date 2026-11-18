import { api, post } from 'services/http';

function query(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const ordersApi = {
  list: (params) => api(`/orders${query(params)}`),
  detail: (id) => api(`/orders/${id}`),
  // Số đơn theo từng trạng thái, để hiện số trên các tab
  counts: () => api('/orders/counts'),
  // Chỉ dùng khi test: tạo một đơn online mẫu và phát thông báo
  createSample: () => api('/orders/test-sample', { method: 'POST' }),
  // Owner: xác nhận / từ chối / giao / hoàn tất. Customer: hủy đơn.
  // carrier chỉ dùng khi chuyển sang SHIPPING: SELF (tự giao) hoặc mã đơn vị vận chuyển
  // ghn (chỉ khi carrier = GHN): { districtId, wardCode, weightG } theo danh mục GHN
  // refund (khách hủy đơn đã thanh toán online): { bankBin, bankName, accountNumber, accountName }
  changeStatus: (id, status, reason, carrier, ghn, refund) =>
    api(
      `/orders/${id}/status${query({
        status,
        reason,
        carrier,
        ...(carrier === 'GHN' && ghn ? { ghnDistrictId: ghn.districtId, ghnWardCode: ghn.wardCode, weightG: ghn.weightG } : {}),
        ...(refund
          ? {
              refundBankBin: refund.bankBin,
              refundBankName: refund.bankName,
              refundAccountNumber: refund.accountNumber,
              refundAccountName: refund.accountName
            }
          : {})
      })}`,
      { method: 'POST' }
    ),
  // Khách nhập / sửa tài khoản nhận tiền hoàn (đơn đang "Chờ hoàn tiền")
  saveRefundAccount: (id, account) => api(`/orders/${id}/refund-account`, { method: 'PUT', body: account }),
  // Khoảng cách từ cửa hàng tới địa chỉ giao và hình thức giao gợi ý (chỉ cửa hàng)
  deliverySuggestion: (id) => api(`/orders/${id}/delivery-suggestion`),
  // Owner: đã chuyển khoản trả lại khách cho đơn "Chờ hoàn tiền" (đơn đã thanh toán online nhưng bị hủy / từ chối)
  markRefunded: (id) => post(`/orders/${id}/refunded`, {}),
  createPayOSLink: (orderId) => post('/payment/payos/create-link', { orderId }),
  checkPayOSStatus: (orderId) => api(`/payment/payos/status/${orderId}`)
};

// Danh mục địa chỉ của GHN (3 cấp kiểu cũ: Tỉnh > Quận/Huyện > Phường/Xã), mỗi mục { id, name }
export const ghnApi = {
  provinces: () => api('/ghn/provinces'),
  districts: (provinceId) => api(`/ghn/districts${query({ provinceId })}`),
  wards: (districtId) => api(`/ghn/wards${query({ districtId })}`),
  // Gợi ý Tỉnh / Quận / Phường theo GHN cho địa chỉ của đơn: { provinceId, districtId, wardCode, candidates }
  suggest: (orderId) => api(`/ghn/suggest${query({ orderId })}`)
};

/* ------------------------------------------------------------------ Tự cập nhật đơn hàng không cần reload trang */

export const LIVE_INTERVAL = 5000; // 5 giây; khi lên production có thể tăng lên 10–15 giây

// Đơn ở các trạng thái này sẽ không thay đổi nữa, không cần hỏi lại
export const FINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED'];

// Tải lại khi quay lại tab, khi có mạng lại, và hỏi định kỳ (chỉ khi tab đang mở)
export const LIVE_SWR = {
  refreshInterval: LIVE_INTERVAL,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  refreshWhenHidden: false
};

// Làm mới mọi dữ liệu đơn hàng trong cache SWR: danh sách, chi tiết, số đếm trên tab
export const refreshAllOrders = (globalMutate) =>
  globalMutate((key) => Array.isArray(key) && ['orders', 'order', 'order-counts'].includes(key[0]));
