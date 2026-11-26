import { toLocalPhone } from 'features/account/validation';

// ---- Hằng số ----

export const MAX_ADDRESSES = 5;

export const EMPTY_ADDRESS = { recipientName: '', phone: '', provinceCode: '', wardCode: '', addressDetail: '', isDefault: false };

export const LIMIT_NOTICE = {
  title: 'Đã đạt giới hạn địa chỉ',
  content: `Bạn đã lưu tối đa ${MAX_ADDRESSES} địa chỉ giao hàng. Vui lòng xóa bớt địa chỉ không còn sử dụng để thêm địa chỉ mới.`
};

export const DEFAULT_NOTICE = {
  title: 'Không thể xóa địa chỉ mặc định',
  content: 'Nếu muốn xóa địa chỉ này, hãy đặt một địa chỉ khác làm mặc định trước.'
};

// ---- Định dạng ----

export const fullAddress = (detail, wardName, provinceName) => [detail, wardName, provinceName].filter(Boolean).join(', ');

export const toForm = (address) => ({
  recipientName: address.recipientName,
  phone: toLocalPhone(address.phone),
  provinceCode: address.provinceCode,
  wardCode: address.wardCode,
  addressDetail: address.addressDetail,
  isDefault: address.isDefault
});

export const toRequest = (form, province, ward) => ({
  recipientName: form.recipientName.trim(),
  phone: form.phone,
  provinceCode: province.code,
  provinceName: province.name,
  wardCode: ward.code,
  wardName: ward.name,
  addressDetail: form.addressDetail.trim(),
  isDefault: form.isDefault
});

const NAME = /^[\p{L}\p{M} ]+$/u;
const PHONE = /^0\d{9}$/;

export function validateAddress(form, province, ward) {
  const errors = {};
  const name = form.recipientName.trim();
  const detail = form.addressDetail.trim();
  if (!name) errors.recipientName = 'Vui lòng nhập tên người nhận.';
  else if (name.length < 2 || name.length > 100) errors.recipientName = 'Tên người nhận phải từ 2 đến 100 ký tự.';
  else if (!NAME.test(name)) errors.recipientName = 'Tên người nhận chỉ được gồm chữ cái và khoảng trắng.';
  if (!form.phone) errors.phone = 'Vui lòng nhập số điện thoại.';
  else if (!PHONE.test(form.phone)) errors.phone = 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng số 0.';
  if (!province) errors.provinceCode = 'Vui lòng chọn Tỉnh/Thành phố.';
  if (!ward) errors.wardCode = 'Vui lòng chọn Phường/Xã.';
  if (!detail) errors.addressDetail = 'Vui lòng nhập số nhà, tên đường.';
  else if (detail.length < 2 || detail.length > 255) errors.addressDetail = 'Số nhà, tên đường phải từ 2 đến 255 ký tự.';
  return errors;
}
