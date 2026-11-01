import { api } from './http';

/**
 * Lấy danh sách địa chỉ giao hàng của Customer đăng nhập
 */
export async function getShippingAddresses() {
  return api('/customer/addresses');
}

/**
 * Lấy chi tiết một địa chỉ giao hàng
 */
export async function getShippingAddress(id) {
  return api(`/customer/addresses/${id}`);
}

/**
 * Tạo mới địa chỉ giao hàng
 */
export async function createShippingAddress(payload) {
  return api('/customer/addresses', { method: 'POST', body: payload });
}

/**
 * Cập nhật địa chỉ giao hàng
 */
export async function updateShippingAddress(id, payload) {
  return api(`/customer/addresses/${id}`, { method: 'PUT', body: payload });
}

/**
 * Đặt một địa chỉ làm mặc định
 */
export async function setDefaultShippingAddress(id) {
  return api(`/customer/addresses/${id}/default`, { method: 'PATCH' });
}

/**
 * Xóa mềm địa chỉ (không được xóa địa chỉ mặc định)
 */
export async function deleteShippingAddress(id) {
  return api(`/customer/addresses/${id}`, { method: 'DELETE' });
}

export const VIETNAMESE_NAME_REGEX = /^[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂưăạảấầẩẫậắằẳẵặẹẻẽềềểỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪễệỉịọỏốồổỗộớờởỡợụủứừỬỮỰỲỴÝỶỸửữựỳỵỷỹ\s]+$/;
export const VIETNAMESE_PHONE_REGEX = /^0[0-9]{9}$/;

/**
 * Validate toàn bộ các trường thông tin địa chỉ giao hàng
 */
export function validateShippingAddressForm({
  recipientName,
  phone,
  selectedProvinceCode,
  selectedDistrictCode,
  selectedWardCode,
  addressDetail
}) {
  const errors = {};

  // 1. Tên người nhận
  const name = (recipientName || '').trim();
  if (!name) {
    errors.recipientName = 'Vui lòng nhập họ và tên người nhận.';
  } else if (name.length < 2) {
    errors.recipientName = 'Họ và tên người nhận phải có ít nhất 2 ký tự.';
  } else if (name.length > 100) {
    errors.recipientName = 'Họ và tên không được vượt quá 100 ký tự.';
  }

  // 2. Số điện thoại (chỉ có đúng 10 số và bắt đầu bằng số 0)
  const rawPhone = (phone || '').trim();
  const cleanPhone = rawPhone.replace(/[\s.-]/g, '');
  if (!cleanPhone) {
    errors.phone = 'Vui lòng nhập số điện thoại người nhận.';
  } else if (!/^\d+$/.test(cleanPhone)) {
    errors.phone = 'Số điện thoại chỉ được chứa các chữ số.';
  } else if (!cleanPhone.startsWith('0')) {
    errors.phone = 'Số điện thoại phải bắt đầu bằng chữ số 0.';
  } else if (cleanPhone.length !== 10) {
    errors.phone = `Số điện thoại phải gồm đúng 10 chữ số (hiện có ${cleanPhone.length} số).`;
  }

  // 3. Tỉnh/Thành phố
  if (!selectedProvinceCode) {
    errors.selectedProvinceCode = 'Vui lòng chọn Tỉnh/Thành phố.';
  }

  // 4. Quận/Huyện
  if (!selectedDistrictCode) {
    errors.selectedDistrictCode = 'Vui lòng chọn Quận/Huyện.';
  }

  // 5. Phường/Xã
  if (!selectedWardCode) {
    errors.selectedWardCode = 'Vui lòng chọn Phường/Xã.';
  }

  // 6. Số nhà, ngõ/đường chi tiết
  const detail = (addressDetail || '').trim();
  if (!detail) {
    errors.addressDetail = 'Vui lòng nhập số nhà, ngõ/đường cụ thể.';
  } else if (detail.length < 2) {
    errors.addressDetail = 'Địa chỉ chi tiết phải có ít nhất 2 ký tự.';
  } else if (detail.length > 255) {
    errors.addressDetail = 'Địa chỉ chi tiết không được vượt quá 255 ký tự.';
  }

  return errors;
}
