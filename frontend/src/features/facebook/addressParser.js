// Tiện ích cho form chốt đơn Facebook: chuẩn hóa SĐT và tách địa chỉ khách nhắn trong chat thành
// Tỉnh/Thành phố + Phường/Xã + Số nhà, tên đường (địa giới 2 cấp sau sáp nhập 07/2025, cùng nguồn với
// trang thanh toán web — features/cart/vnAddress.js).

import { fetchProvinces, fetchWards } from '../cart/vnAddress';

// ==========================================
// SỐ ĐIỆN THOẠI
// ==========================================

/** "+84 566 238 971", "84566238971", "0566.238.971" => "0566238971"; không hợp lệ => null. */
export function normalizePhone(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length === 11) digits = `0${digits.slice(2)}`;
  return /^0[35789]\d{8}$/.test(digits) ? digits : null;
}

// Bắt cả số viết liền và viết tách bằng dấu cách / chấm / gạch: 0566 238 971, +84.566.238.971
const PHONE_IN_TEXT = /(?:\+?84|0)(?:[\s.-]?\d){9}(?!\d)/g;

/** SĐT di động hợp lệ cuối cùng xuất hiện trong đoạn chữ (đã chuẩn hóa), không có => null. */
export function findPhoneInText(text) {
  const matches = String(text ?? '').match(PHONE_IN_TEXT) || [];
  for (let i = matches.length - 1; i >= 0; i--) {
    const phone = normalizePhone(matches[i]);
    if (phone) return phone;
  }
  return null;
}

/** Bỏ các SĐT khỏi đoạn chữ (dùng trước khi tách địa chỉ). */
export function stripPhones(text) {
  return String(text ?? '').replace(PHONE_IN_TEXT, ' ');
}

// ==========================================
// CHUẨN HÓA CHỮ
// ==========================================

/**
 * Bỏ dấu, viết thường; giữ NGUYÊN độ dài với chuỗi đầu vào dạng NFC để vị trí ký tự khớp 1-1 với chuỗi
 * gốc (cần khi cắt phần "số nhà, tên đường" ra khỏi câu khách nhắn).
 */
export function fold(value) {
  return String(value ?? '')
    .normalize('NFC')
    .split('')
    .map((ch) => (ch === 'đ' || ch === 'Đ' ? 'd' : ch.normalize('NFD').replace(/[̀-ͯ]/g, '')))
    .map((ch) => (ch.length === 1 ? ch.toLowerCase() : ch[0].toLowerCase()))
    .join('');
}

const stripPrefix = (name) =>
  fold(name)
    .replace(/^(thanh pho|tinh|phuong|xa|dac khu|thi tran)\s+/, '')
    .trim();

// ==========================================
// TỈNH / THÀNH PHỐ — tên gọi tắt và tỉnh cũ trước sáp nhập 07/2025
// ==========================================

// Khóa: tên đã bỏ dấu (sau stripPrefix) của tỉnh mới; giá trị: các cách khách hay viết
const PROVINCE_ALIASES = {
  'ho chi minh': [
    'hcm',
    'tphcm',
    'tp hcm',
    'tp.hcm',
    'sai gon',
    'saigon',
    'sg',
    'binh duong',
    'ba ria vung tau',
    'ba ria',
    'vung tau',
    'brvt'
  ],
  'ha noi': ['hn', 'ha noi', 'hanoi'],
  'da nang': ['dn', 'quang nam'],
  'hai phong': ['hp', 'hai duong'],
  'can tho': ['soc trang', 'hau giang'],
  hue: ['thua thien hue', 'tt hue'],
  'tuyen quang': ['ha giang'],
  'lao cai': ['yen bai'],
  'thai nguyen': ['bac kan', 'bac can'],
  'phu tho': ['vinh phuc', 'hoa binh'],
  'bac ninh': ['bac giang'],
  'hung yen': ['thai binh'],
  'ninh binh': ['ha nam', 'nam dinh'],
  'quang tri': ['quang binh'],
  'quang ngai': ['kon tum'],
  'gia lai': ['binh dinh'],
  'khanh hoa': ['ninh thuan', 'nha trang'],
  'lam dong': ['dak nong', 'dac nong', 'binh thuan', 'da lat'],
  'dak lak': ['dac lac', 'dak lac', 'phu yen'],
  'dong nai': ['binh phuoc', 'bien hoa'],
  'tay ninh': ['long an'],
  'vinh long': ['ben tre', 'tra vinh'],
  'dong thap': ['tien giang'],
  'ca mau': ['bac lieu'],
  'an giang': ['kien giang', 'phu quoc']
};

// Tìm cụm từ đứng riêng (không dính chữ cái/số hai bên)
function findWord(haystack, needle, from = 0) {
  if (!needle) return -1;
  let idx = haystack.indexOf(needle, from);
  while (idx >= 0) {
    const before = idx === 0 ? ' ' : haystack[idx - 1];
    const after = haystack[idx + needle.length] ?? ' ';
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return idx;
    idx = haystack.indexOf(needle, idx + 1);
  }
  return -1;
}

/** Tìm tỉnh trong đoạn chữ đã fold. Trả về { province, index } của lần khớp dài nhất, hoặc null. */
function matchProvince(folded, provinces) {
  let best = null;
  for (const province of provinces) {
    const key = stripPrefix(province.name);
    const names = [key, ...(PROVINCE_ALIASES[key] || [])];
    for (const name of names) {
      const index = findWord(folded, name);
      if (index >= 0 && (!best || name.length > best.length)) best = { province, index, length: name.length };
    }
  }
  return best;
}

// Ngay trước tên có chữ "phường / xã / thị trấn" => chắc chắn khách đang nói tên phường
const WARD_CUE = /(?:phuong|p\.|p|xa|thi tran|tt\.?|dac khu)\s*$/;

/**
 * Tìm phường/xã trong đoạn chữ đã fold. Bỏ qua chỗ trùng với tên tỉnh vừa khớp (nhiều tỉnh cũ nay là tên
 * phường của tỉnh mới, vd. "Hải Dương", "Vĩnh Phúc"); ưu tiên tên có chữ "phường/xã" đứng trước, rồi tên dài.
 */
function matchWard(folded, wards, provinceHit) {
  const overlapsProvince = (index, length) =>
    provinceHit && index < provinceHit.index + provinceHit.length && provinceHit.index < index + length;

  let best = null;
  for (const ward of wards) {
    const key = stripPrefix(ward.name);
    if (key.length < 3) continue;
    for (let index = findWord(folded, key); index >= 0; index = findWord(folded, key, index + 1)) {
      if (overlapsProvince(index, key.length)) continue;
      const cued = WARD_CUE.test(folded.slice(Math.max(0, index - 12), index));
      const score = (cued ? 1000 : 0) + key.length;
      if (!best || score > best.score) best = { ward, index, length: key.length, score };
    }
  }
  return best;
}

// Từ khóa hành chính đứng ngay trước tên phường / tỉnh / quận cũ (bị cắt khỏi phần số nhà)
const ADMIN_PREFIX = /(?:,|\s)*(?:phuong|p\.|p|xa|thi tran|tt\.?|quan|q\.|q|huyen|h\.|thi xa|tx\.?|thanh pho|tp\.?|tinh)\s*$/;

// Câu dẫn đầu tin nhắn: "địa chỉ:", "ship về", "giao đến"...
const LEAD_IN =
  /^(?:\s*(?:dia chi|dc|d\/c|ship ve|ship den|ship toi|giao den|giao ve|giao toi|giao qua|giao o|nha (?:em|minh|toi|anh|chi) o|(?:em|minh|toi|anh|chi) o|nha o|o tai)\s*[:\-,]*\s*)+/;

// Quận / huyện cũ (đã bỏ sau sáp nhập): cắt bỏ khỏi phần số nhà nếu còn sót
const OLD_DISTRICT = /(?:,\s*|\s+)(?:quan|q\.?|huyen|h\.)\s*[a-z0-9 ]{1,20}$/;

/**
 * Tách địa chỉ khách nhắn thành { province, ward, street } (province/ward là { code, name } hoặc null).
 * Ví dụ "giao về 12 Lê Lợi, P. Bến Thành, Q1, Sài Gòn" => HCM / Phường Bến Thành / "12 Lê Lợi".
 */
export async function parseAddressText(rawText) {
  const original = stripPhones(rawText).normalize('NFC').replace(/\s+/g, ' ').trim();
  const folded = fold(original);
  const result = { province: null, ward: null, street: '' };
  if (!original) return result;

  let cut = original.length;

  try {
    const provinces = await fetchProvinces();
    const provinceHit = matchProvince(folded, provinces);
    if (provinceHit) {
      result.province = provinceHit.province;
      cut = Math.min(cut, provinceHit.index);

      const wards = await fetchWards(provinceHit.province.code);
      const wardHit = matchWard(folded, wards, provinceHit);
      if (wardHit) {
        result.ward = wardHit.ward;
        cut = Math.min(cut, wardHit.index);
      }
    }
  } catch {
    // Không tải được danh sách địa giới: vẫn điền phần chữ vào ô số nhà để nhân viên chọn tay
  }

  // Phần số nhà, tên đường = đoạn đứng trước tên phường/tỉnh, bỏ từ khóa hành chính và câu dẫn
  let streetFolded = folded.slice(0, cut).replace(ADMIN_PREFIX, '');
  streetFolded = streetFolded.replace(OLD_DISTRICT, '');
  const lead = streetFolded.match(LEAD_IN);
  const start = lead ? lead[0].length : 0;

  result.street = original
    .slice(start, streetFolded.length)
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')
    .trim();

  return result;
}

/** Ghép địa chỉ đúng định dạng trang thanh toán: "Số nhà, Phường/Xã, Tỉnh/Thành phố". */
export function composeAddress({ street, ward, province }) {
  return [String(street ?? '').trim(), ward?.name, province?.name].filter(Boolean).join(', ');
}

/** Lọc danh sách tỉnh/phường cho ô chọn: gõ không dấu vẫn ra ("ben thanh" => "Phường Bến Thành"). */
export function filterByName(options, inputValue) {
  const keyword = fold(inputValue).trim();
  if (!keyword) return options;
  return options.filter((option) => fold(option.name).includes(keyword));
}
