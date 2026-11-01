// Danh sách tỉnh/thành và phường/xã (địa giới sau sáp nhập 07/2025, chỉ 2 cấp: tỉnh > phường/xã).
// Nguồn: API công khai https://provinces.open-api.vn/api/v2 (mã code là số, lưu vào DB dạng chuỗi).
// Muốn đổi sang nguồn khác (ví dụ danh mục của đơn vị vận chuyển) chỉ cần sửa file này.

const BASE = 'https://provinces.open-api.vn/api/v2';
const memory = new Map();

// Lấy JSON, nhớ lại trong bộ nhớ và sessionStorage để không gọi API công cộng nhiều lần
async function getJson(url) {
  if (memory.has(url)) return memory.get(url);
  try {
    const saved = sessionStorage.getItem(`vn-address:${url}`);
    if (saved) {
      const value = JSON.parse(saved);
      memory.set(url, value);
      return value;
    }
  } catch {
    // bỏ qua nếu trình duyệt chặn sessionStorage
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error('Không tải được danh sách địa chỉ');
  const data = await res.json();
  memory.set(url, data);
  try {
    sessionStorage.setItem(`vn-address:${url}`, JSON.stringify(data));
  } catch {
    // bỏ qua
  }
  return data;
}

const toOption = (x) => ({ code: String(x.code), name: x.name });
const byName = (a, b) => a.name.localeCompare(b.name, 'vi');

/** Danh sách tỉnh / thành phố: [{ code, name }] */
export async function fetchProvinces() {
  const list = await getJson(`${BASE}/`);
  return list.map(toOption).sort(byName);
}

/** Danh sách phường / xã của một tỉnh: [{ code, name }] */
export async function fetchWards(provinceCode) {
  const data = await getJson(`${BASE}/p/${provinceCode}?depth=2`);
  return (data.wards || []).map(toOption).sort(byName);
}