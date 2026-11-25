import { api } from 'services/http';

// Ảnh gửi lên được thu nhỏ trên trình duyệt (cạnh dài tối đa MAX_SIDE, JPEG) cho nhanh và đọc được cả ảnh HEIC
// mà trình duyệt mở được. Backend tự thu tiếp về 768 rồi 224 px giống lúc đánh giá mô hình.
const MAX_SIDE = 1280;
const JPEG_QUALITY = 0.92;
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export const imageSearchApi = {
  // { enabled, ready, message }: enabled=false thì không hiện nút chụp ảnh
  status: () => api('/shop/image-search/status'),
  search: (blob) => {
    const form = new FormData();
    form.append('image', blob, 'anh-tim-kiem.jpg');
    return api('/shop/image-search', { method: 'POST', form });
  }
};

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      // Xoay đúng chiều theo EXIF (ảnh chụp dọc trên điện thoại)
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Trình duyệt cũ không hỗ trợ tùy chọn -> thử cách dưới
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Đọc ảnh khách chọn, thu nhỏ và nén JPEG. Lỗi (ảnh hỏng, định dạng trình duyệt không mở được) thì ném Error. */
export async function prepareImage(file) {
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
    throw new Error('Vui lòng chọn một tệp ảnh.');
  }
  if (file.size > MAX_INPUT_BYTES) throw new Error('Ảnh quá lớn (tối đa 25 MB).');
  let bitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    throw new Error('Không mở được ảnh này. Hãy chụp lại hoặc chọn ảnh JPG / PNG.');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Ảnh PNG trong suốt: nền trắng thay vì đen
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('Không xử lý được ảnh này.');
  return { blob, previewUrl: URL.createObjectURL(blob) };
}
