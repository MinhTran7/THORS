// Định dạng và trạng thái dùng chung cho các trang khuyến mãi

export const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;

export const SCHEDULE_LABEL = {
  UPCOMING: 'Sắp diễn ra',
  ONGOING: 'Đang diễn ra',
  ENDED: 'Đã kết thúc'
};

/** Trạng thái theo thời gian, so cả ngày lẫn giờ giống backend: UPCOMING | ONGOING | ENDED | UNKNOWN */
export function scheduleOf(promotion) {
  const start = promotion?.startDate ? new Date(promotion.startDate) : null;
  const end = promotion?.endDate ? new Date(promotion.endDate) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'UNKNOWN';
  const now = new Date();
  if (now < start) return 'UPCOMING';
  if (now >= end) return 'ENDED';
  return 'ONGOING';
}
