// Hàm thuần dùng chung cho các trang khuyến mãi: định dạng, chuyển form <-> request, kiểm tra form

// Hai loại: khuyến mãi sản phẩm và mã giảm giá online
export const KIND = {
  PRODUCT: { type: 'PRODUCT_DISCOUNT', base: '/promotions', title: 'Khuyến mãi sản phẩm', name: 'khuyến mãi sản phẩm' },
  ORDER: { type: 'ORDER_VOUCHER', base: '/order-discounts', title: 'Mã giảm giá online', name: 'mã giảm giá' }
};
export const kindOf = (p) => (p?.type === 'ORDER_VOUCHER' ? 'ORDER' : 'PRODUCT');

export const SCHEDULE_LABEL = { UPCOMING: 'Sắp diễn ra', ONGOING: 'Đang diễn ra', ENDED: 'Đã kết thúc' };

export const EMPTY_PROMOTION = {
  name: '',
  description: '',
  discountType: 'PERCENT',
  discountValue: '',
  minOrderValue: '',
  maxDiscountAmount: '',
  usageLimit: '',
  usedCount: 0,
  startDate: '',
  endDate: '',
  allProducts: false,
  productIds: []
};

// API danh sách có thể trả mảng hoặc trang { content } / { data }
export const rowsOf = (res) => (Array.isArray(res) ? res : (res?.content ?? res?.data ?? []));
export const isActive = (item) => item.status === 'ACTIVE';
// Đang bật và chưa kết thúc
export const isRunning = (p) => p.schedule !== 'ENDED' && isActive(p);
export const productIdOf = (product) => Number(product.productId);
export const productNameOf = (product) => product.productName || 'Sản phẩm chưa có tên';

// ---- Tiền và mức giảm ----

export const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;

export const discountText = (p) => (p.discountType === 'PERCENT' ? `${Number(p.discountValue)}%` : money(p.discountValue));

// Mức giảm tối đa của mã giảm % (rỗng nếu không có)
export const capText = (p) => (p.discountType === 'PERCENT' && p.maxDiscountAmount ? `Tối đa ${money(p.maxDiscountAmount)}` : '');

export const priceRange = ({ minPrice, maxPrice }) => {
  if (minPrice == null && maxPrice == null) return 'Chưa có giá';
  if (minPrice == null || maxPrice == null || Number(minPrice) === Number(maxPrice)) return money(minPrice ?? maxPrice);
  return `${Number(minPrice).toLocaleString('vi-VN')} – ${money(maxPrice)}`;
};

// Giá sau khuyến mãi sản phẩm, làm tròn như backend, không âm
export const salePrice = (price, discountType, discountValue) => {
  const value = Number(price);
  const discount = discountType === 'PERCENT' ? Math.round((value * Number(discountValue)) / 100) : Number(discountValue);
  return Math.max(0, value - discount);
};

// ---- Ngày giờ ----

const pad = (n) => String(n).padStart(2, '0');
const toDate = (value) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

export const formatDate = (value) => {
  const d = toDate(value);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '—';
};

export const formatTime = (value) => {
  const d = toDate(value);
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '—';
};

export const formatDateTime = (value) => (toDate(value) ? `${formatDate(value)} ${formatTime(value)}` : '—');

// Giá trị cho ô datetime-local theo giờ địa phương; mặc định là bây giờ
export const toInputDateTime = (value = new Date()) => {
  const d = toDate(value);
  if (!d) return '';
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export const overlaps = (a, b) => new Date(a.startDate) < new Date(b.endDate) && new Date(a.endDate) > new Date(b.startDate);

// ---- Lý do bị chặn (nút vẫn hiện, bấm thì báo) ----

export const editBlockedMessage = (p) =>
  p.schedule === 'ENDED' ? 'Khuyến mãi đã kết thúc nên không thể chỉnh sửa.' : 'Khuyến mãi này hiện không thể chỉnh sửa.';

export const toggleBlockedMessage = (p) => {
  if (p.schedule === 'ENDED') return 'Khuyến mãi đã kết thúc nên không thể bật hoặc tắt.';
  if (isActive(p)) return 'Khuyến mãi đang diễn ra nên không thể tắt. Dùng "Kết thúc sớm" nếu cần dừng ngay.';
  return 'Không thể thay đổi trạng thái khuyến mãi này.';
};

// ---- Form <-> request ----

// Khuyến mãi từ API -> giá trị form sửa; productIds đã được trang lọc bỏ sản phẩm ngừng bán
export const toForm = (p, productIds) => ({
  name: p.name || '',
  description: p.description || '',
  discountType: p.discountType,
  discountValue: String(Math.round(Number(p.discountValue))),
  minOrderValue: Number(p.minOrderValue) > 0 ? String(Math.round(p.minOrderValue)) : '',
  maxDiscountAmount: p.maxDiscountAmount ? String(Math.round(p.maxDiscountAmount)) : '',
  usageLimit: p.usageLimit ? String(p.usageLimit) : '',
  usedCount: p.usedCount || 0,
  startDate: toInputDateTime(p.startDate),
  endDate: toInputDateTime(p.endDate),
  allProducts: p.applyScope !== 'SELECTED',
  productIds
});

// Form -> body gửi backend; chỉ mã giảm giá online có đơn tối thiểu, lượt dùng và mức giảm tối đa (khi giảm %)
export const toRequest = (form, kind, allSelected) => {
  const voucher = kind === 'ORDER';
  const percent = form.discountType === 'PERCENT';
  return {
    type: KIND[kind].type,
    name: form.name.trim(),
    description: form.description.trim() || null,
    discountType: form.discountType,
    discountValue: Number(form.discountValue),
    minOrderValue: voucher ? Number(form.minOrderValue) : 0,
    maxDiscountAmount: voucher && percent && form.maxDiscountAmount ? Number(form.maxDiscountAmount) : null,
    usageLimit: voucher ? Number(form.usageLimit) : null,
    applyScope: voucher || allSelected ? 'ALL' : 'SELECTED',
    productIds: voucher || allSelected ? [] : form.productIds.map(Number),
    startDate: form.startDate,
    endDate: form.endDate
  };
};

export const toAdjustRequest = (form) => ({ endDate: form.endDate, usageLimit: form.usageLimit ? Number(form.usageLimit) : null });

// ---- Kiểm tra form (backend kiểm tra lại) ----

function checkUsage(form, errors) {
  if (!form.usageLimit) errors.usageLimit = 'Vui lòng nhập giới hạn lượt dùng.';
  else if (Number(form.usageLimit) < Math.max(1, form.usedCount))
    errors.usageLimit =
      form.usedCount > 0 ? `Không được nhỏ hơn số lượt đã dùng (${form.usedCount}).` : 'Giới hạn lượt dùng phải từ 1 trở lên.';
}

// Đang chạy: chỉ gia hạn và đổi lượt dùng
export function validateAdjust(form, kind, initial) {
  const errors = {};
  if (!form.endDate) errors.endDate = 'Vui lòng chọn thời gian kết thúc.';
  else if (form.endDate < initial.endDate) errors.endDate = 'Chỉ được gia hạn, thời gian kết thúc mới phải sau thời gian cũ.';
  if (kind === 'ORDER') checkUsage(form, errors);
  return errors;
}

// minStart: bây giờ lúc mở form; giữ nguyên ngày bắt đầu cũ thì không bắt buộc từ bây giờ
export function validatePromotion(form, kind, minStart, initialStart) {
  const errors = {};
  const value = Number(form.discountValue);
  const minOrder = Number(form.minOrderValue);
  if (!form.name.trim()) errors.name = 'Vui lòng nhập tên chương trình.';
  if (!form.startDate) errors.startDate = 'Vui lòng chọn thời gian bắt đầu.';
  else if (form.startDate !== initialStart && form.startDate < minStart) errors.startDate = 'Thời gian bắt đầu phải từ hiện tại trở đi.';
  if (!form.endDate) errors.endDate = 'Vui lòng chọn thời gian kết thúc.';
  else if (form.startDate && new Date(form.endDate) <= new Date(form.startDate))
    errors.endDate = 'Thời gian kết thúc phải sau thời gian bắt đầu.';
  if (!form.discountValue) errors.discountValue = 'Vui lòng nhập mức giảm.';
  else if (!(value > 0)) errors.discountValue = 'Mức giảm phải lớn hơn 0.';
  else if (form.discountType === 'PERCENT' && value > 100) errors.discountValue = 'Mức giảm theo phần trăm tối đa là 100%.';
  if (kind === 'ORDER') {
    if (!(minOrder > 0)) errors.minOrderValue = 'Vui lòng nhập giá trị đơn tối thiểu.';
    else if (form.discountType === 'FIXED' && value >= minOrder) errors.discountValue = 'Số tiền giảm phải nhỏ hơn giá trị đơn tối thiểu.';
    if (form.discountType === 'PERCENT' && form.maxDiscountAmount && !(Number(form.maxDiscountAmount) > 0))
      errors.maxDiscountAmount = 'Mức giảm tối đa phải lớn hơn 0.';
    checkUsage(form, errors);
  }
  if (kind === 'PRODUCT' && !form.allProducts && !form.productIds.length) errors.productIds = 'Vui lòng chọn ít nhất một sản phẩm.';
  return errors;
}

// Sản phẩm đã thuộc khuyến mãi sản phẩm khác trùng thời gian: productId -> khuyến mãi đó
export function busyProducts(others, form, products) {
  if (!form.startDate || !form.endDate) return {};
  return others
    .filter((p) => overlaps(p, form))
    .reduce((map, p) => {
      (p.applyScope === 'SELECTED' ? p.productIds.map(Number) : products.map(productIdOf)).forEach((id) => {
        map[id] = map[id] || p;
      });
      return map;
    }, {});
}

export const busyLabel = (p) => `“${p.name}” (${formatDateTime(p.startDate)} – ${formatDateTime(p.endDate)})`;
