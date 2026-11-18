/**
 * Mô tả sản phẩm có cấu trúc (kiểu Coolmate): mô tả ngắn, điểm nổi bật có biểu tượng,
 * Chất liệu & kiểu dáng, Bảo quản, Đổi trả.
 *
 * Kèm theo imageColors: ảnh nào thuộc màu nào ({ đường dẫn ảnh: tên màu }) để trang khách đổi ảnh theo màu đang chọn.
 * Lưu vào cột product.description (TEXT) dưới dạng JSON {"v":1,...}. Mô tả cũ (chữ thường) vẫn đọc được:
 * cả đoạn được coi là "mô tả ngắn". Chỉ nhập mỗi mô tả ngắn thì vẫn lưu chữ thường như trước.
 */

export const EMPTY_DESCRIPTION = {
  intro: '', // mô tả ngắn
  highlights: [], // khóa trong HIGHLIGHTS
  material: '', // Chất liệu
  fit: '', // Kiểu dáng
  suitable: '', // Phù hợp
  features: '', // Tính năng
  care: '', // Bảo quản — mỗi dòng một ý
  returns: '', // Đổi trả — mỗi dòng một ý
  imageColors: {} // { imageUrl: 'Be' } — ảnh thuộc màu nào (không có = dùng cho mọi màu)
};

export const SPEC_FIELDS = [
  { key: 'material', label: 'Chất liệu', placeholder: 'Ví dụ: 100% Polyester' },
  { key: 'fit', label: 'Kiểu dáng', placeholder: 'Ví dụ: Regular' },
  { key: 'suitable', label: 'Phù hợp', placeholder: 'Ví dụ: Đi làm, đi chơi, mặc hằng ngày. Mẫu 1m75 - 65kg mặc size L', multiline: true },
  { key: 'features', label: 'Tính năng', placeholder: 'Ví dụ: Chống gió, hạn chế thấm nước, co giãn tốt', multiline: true }
];

// Các điểm nổi bật chọn sẵn, mỗi điểm một biểu tượng nét mảnh (viewBox 0 0 24 24)
export const HIGHLIGHTS = [
  { key: 'water', label: 'Trượt nước', icon: <path d="M12 3s-6 6.5-6 11a6 6 0 0 0 12 0c0-4.5-6-11-6-11zM9.5 15a2.5 2.5 0 0 0 2.5 2.5" /> },
  {
    key: 'warm',
    label: 'Giữ ấm',
    icon: <path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-1.6.7-2.8 1.6-3.8.2 1.4 1 2.3 2 2.3-.6-2.4-.2-4.8.4-7zM8 20h8" />
  },
  { key: 'comfort', label: 'Thoải mái', icon: <path d="M4 8c3-2 13-2 16 0M4 12c3-2 13-2 16 0M4 16c3-2 13-2 16 0" /> },
  { key: 'breathable', label: 'Thoáng khí', icon: <path d="M3 9h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 17h7" /> },
  { key: 'quickdry', label: 'Nhanh khô', icon: <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" /> },
  { key: 'stretch', label: 'Co giãn', icon: <path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" /> },
  { key: 'windproof', label: 'Chống gió', icon: <path d="M3 8h10a2.5 2.5 0 1 0-2.5-2.5M3 12h15a2.5 2.5 0 1 1-2.5 2.5M3 16h8M20 4 4 20" /> },
  { key: 'uv', label: 'Chống UV', icon: <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4M8 12a4 4 0 0 1 8 0v0a4 4 0 0 1-8 0z" /> },
  { key: 'durable', label: 'Bền bỉ', icon: <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3zM8.5 12l2.5 2.5 4.5-5" /> },
  { key: 'light', label: 'Siêu nhẹ', icon: <path d="M20 4C10 4 4 10 4 20M20 4c0 9-6 14-13 14M20 4l-9 9" /> },
  { key: 'antibac', label: 'Kháng khuẩn', icon: <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3zM12 8v8M8 12h8" /> },
  { key: 'easywash', label: 'Dễ giặt', icon: <path d="M5 3h14v18H5zM5 7h14M8 5h.01M15 14a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" /> }
];

export const MAX_HIGHLIGHTS = 6;

export function HighlightIcon({ highlight, size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {highlight.icon}
    </svg>
  );
}

/** Chuỗi trong DB -> đối tượng mô tả (luôn đủ các trường). */
export function parseDescription(text) {
  const raw = String(text ?? '');
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed);
      if (data && typeof data === 'object' && data.v) {
        const result = { ...EMPTY_DESCRIPTION };
        Object.keys(EMPTY_DESCRIPTION).forEach((key) => {
          if (key === 'imageColors') {
            result.imageColors =
              data.imageColors && typeof data.imageColors === 'object'
                ? Object.fromEntries(Object.entries(data.imageColors).filter(([, c]) => typeof c === 'string' && c.trim()))
                : {};
          } else if (key === 'highlights') {
            result.highlights = Array.isArray(data.highlights) ? data.highlights.filter((k) => HIGHLIGHTS.some((h) => h.key === k)) : [];
          } else if (typeof data[key] === 'string') {
            result[key] = data[key];
          }
        });
        return result;
      }
    } catch {
      // không phải JSON hợp lệ -> coi là chữ thường
    }
  }
  return { ...EMPTY_DESCRIPTION, intro: raw };
}

/** Đối tượng mô tả -> chuỗi lưu DB. Rỗng hết -> ''. Chỉ có mô tả ngắn -> chữ thường. */
export function serializeDescription(desc) {
  const d = { ...EMPTY_DESCRIPTION, ...desc };
  const hasStructured =
    d.highlights.length > 0 ||
    Object.keys(d.imageColors || {}).length > 0 ||
    ['material', 'fit', 'suitable', 'features', 'care', 'returns'].some((key) => d[key].trim());
  if (!hasStructured) return d.intro;
  return JSON.stringify({ v: 1, ...d });
}

// So sánh tên màu không phân biệt hoa/thường, dấu ("Đen" = "đen" = "den")
export const sameColor = (a, b) => {
  const f = (x) =>
    String(x || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/\s+/g, ' ')
      .trim();
  return f(a) !== '' && f(a) === f(b);
};

/** Ảnh nào thuộc màu nào: { imageUrl: 'Be' } */
export const getImageColors = (text) => parseDescription(text).imageColors;

/** Gắn (color = '' thì bỏ gắn) màu cho một ảnh, trả về chuỗi mô tả mới để lưu. */
export function setImageColor(text, imageUrl, color) {
  const d = parseDescription(text);
  const imageColors = { ...d.imageColors };
  if (color) imageColors[imageUrl] = color;
  else delete imageColors[imageUrl];
  return serializeDescription({ ...d, imageColors });
}

/**
 * Ảnh hiển thị cho màu đang chọn: ảnh gắn đúng màu đó đứng trước, sau đó là ảnh không gắn màu.
 * Chưa chọn màu, hoặc màu đó chưa có ảnh riêng -> giữ nguyên toàn bộ ảnh.
 */
export function imagesForColor(images, imageColors, color) {
  if (!color || !images?.length) return images || [];
  const matched = images.filter((url) => sameColor(imageColors[url], color));
  if (matched.length === 0) return images;
  return [...matched, ...images.filter((url) => !imageColors[url])];
}

/** Mỗi dòng một ý, bỏ dòng trống và dấu gạch đầu dòng gõ tay ("- ", "• "). */
export const toLines = (text) =>
  String(text || '')
    .split('\n')
    .map((line) => line.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean);

export const highlightOf = (key) => HIGHLIGHTS.find((h) => h.key === key);

/** Bản chữ thường dễ đọc (cho trang quản lý, chỗ chỉ hiện được chữ). */
export function descriptionToText(text) {
  const d = parseDescription(text);
  const parts = [];
  if (d.intro.trim()) parts.push(d.intro.trim());
  if (d.highlights.length) parts.push(`Nổi bật: ${d.highlights.map((k) => highlightOf(k)?.label).filter(Boolean).join(', ')}`);
  SPEC_FIELDS.forEach((f) => d[f.key].trim() && parts.push(`${f.label}: ${d[f.key].trim()}`));
  if (toLines(d.care).length) parts.push(`Bảo quản:\n${toLines(d.care).map((l) => `• ${l}`).join('\n')}`);
  if (toLines(d.returns).length) parts.push(`Đổi trả:\n${toLines(d.returns).map((l) => `• ${l}`).join('\n')}`);
  return parts.join('\n\n');
}
