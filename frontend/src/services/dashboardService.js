import { api } from './http';

// Bảng điều khiển: Owner xem toàn cửa hàng, Family Member xem doanh số của chính mình.
// from / to: chuỗi 'YYYY-MM-DD' (gồm cả hai đầu, theo ngày đặt đơn).
export function getDashboardSummary({ from, to }) {
  const params = new URLSearchParams({ from, to });
  return api(`/dashboard/summary?${params.toString()}`);
}
