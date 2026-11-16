import { useEffect, useState } from 'react';
import { STORE_NAME } from 'features/account/constants';
import { api } from 'services/http';

/**
 * Thông tin chung của website bán hàng (Kênh bán hàng > Website).
 * Chủ cửa hàng sửa ở trang /website; header/footer của trang khách đọc qua GET /api/shop/website.
 * Khóa nào chưa lưu thì dùng giá trị mặc định bên dưới. Lưu chuỗi rỗng = ẩn mục đó.
 */
export const WEBSITE_DEFAULTS = {
  announcement: 'Giao hàng toàn quốc — Thanh toán khi nhận hàng hoặc chuyển khoản',
  tagline: 'Thời trang tối giản, chất liệu bền đẹp — giao tận nhà.',
  about: ['Thời trang tối giản, dễ phối cho mọi ngày', 'Giao hàng toàn quốc', 'Thanh toán khi nhận hàng hoặc chuyển khoản'].join('\n'),
  hotline: '',
  email: '',
  // Địa chỉ hiển thị = "số nhà, phường/xã, tỉnh/thành" (ghép từ 3 ô bên dưới khi lưu)
  address: '',
  addressDetail: '',
  provinceCode: '',
  wardCode: '',
  closingNote: `${STORE_NAME} luôn đồng hành cùng bạn!`
};

// Độ dài tối đa — khớp với WebsiteSettingController ở backend
export const WEBSITE_LIMITS = {
  announcement: 200,
  tagline: 300,
  about: 1000,
  hotline: 50,
  email: 120,
  address: 300,
  addressDetail: 255,
  provinceCode: 20,
  wardCode: 20,
  closingNote: 200
};

// Hotline dạng xxxx.xxx.xxx (đủ 10 chữ số)
export const HOTLINE_RE = /^\d{4}\.\d{3}\.\d{3}$/;

/** Gõ số tới đâu tự chèn dấu chấm tới đó: "0123456789" -> "0123.456.789" */
export function formatHotline(input) {
  const digits = String(input || '').replace(/\D/g, '').slice(0, 10);
  return [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 10)].filter(Boolean).join('.');
}

export const withDefaults = (saved = {}) => ({ ...WEBSITE_DEFAULTS, ...saved });

// "Về THORS": mỗi dòng một ý, bỏ dòng trống
export const aboutLines = (text) =>
  String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

// Lưu tạm trong bộ nhớ để chuyển trang không phải tải lại; trang quản lý lưu xong thì cập nhật luôn
let cache = null;
const listeners = new Set();

export function setWebsiteSettingsCache(saved) {
  cache = withDefaults(saved);
  listeners.forEach((fn) => fn(cache));
}

/** Thông tin website cho trang khách (đã gộp giá trị mặc định). Lỗi mạng thì dùng mặc định. */
export function useWebsiteSettings() {
  const [settings, setSettings] = useState(() => cache || WEBSITE_DEFAULTS);
  useEffect(() => {
    listeners.add(setSettings);
    if (!cache) {
      api('/shop/website')
        .then((d) => setWebsiteSettingsCache(d.settings || {}))
        .catch(() => {});
    }
    return () => listeners.delete(setSettings);
  }, []);
  return settings;
}

export const getWebsiteSettings = () => api('/website-settings');
export const saveWebsiteSettings = (values) => api('/website-settings', { method: 'PUT', body: values });
