/**
 * Tên màu biến thể (tiếng Việt, tự nhập) -> mã màu để tô lên người mẫu 3D khi "mặc thử cả bộ".
 * So không phân biệt dấu / hoa thường; tên ghép (vd "Đỏ đô", "Xanh than") đặt trước tên đơn ("Đỏ", "Xanh").
 * Không nhận ra màu -> xám trung tính.
 */
const NAMED = [
  ['xanh than', '#1F2A44'],
  ['xanh navy', '#1F2A44'],
  ['navy', '#1F2A44'],
  ['xanh duong', '#2F5DA8'],
  ['xanh da troi', '#5B9BD5'],
  ['xanh la', '#3E7D4E'],
  ['xanh reu', '#5B6B3A'],
  ['xanh ngoc', '#2A9D8F'],
  ['xanh', '#2F5DA8'],
  ['do do', '#7A1F2B'],
  ['do', '#B3262E'],
  ['hong', '#E7A1B0'],
  ['tim', '#6C4AA0'],
  ['cam', '#E07B39'],
  ['vang', '#E3B23C'],
  ['nau', '#6B4A33'],
  ['be', '#D9C6A5'],
  ['kem', '#EDE3CF'],
  ['trang', '#F4F4F2'],
  ['den', '#232323'],
  ['ghi', '#8A8D91'],
  ['xam', '#8A8D91'],
  ['bac', '#C0C0C0'],
  ['black', '#232323'],
  ['white', '#F4F4F2'],
  ['grey', '#8A8D91'],
  ['gray', '#8A8D91']
];

const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function colorHex(name) {
  if (/^#[0-9a-f]{6}$/i.test(String(name ?? '').trim())) return name.trim();
  const text = ` ${fold(name)} `;
  const hit = NAMED.find(([word]) => text.includes(` ${word} `));
  return hit ? hit[1] : '#9A9A9A';
}
