/**
 * Chuẩn hóa ảnh trước khi gửi: thu nhỏ cạnh dài về tối đa MAX_SIDE và nén JPEG.
 * Ảnh điện thoại thường 4-12 MB -> còn khoảng 300-600 KB, tải lên nhanh, vẫn đủ rõ cho AI.
 */
const MAX_SIDE = 1600;
const QUALITY = 0.9;

const canvasToJpeg = (canvas) =>
  new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode'))), 'image/jpeg', QUALITY));

function drawScaled(source, width, height) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** File người dùng chọn -> Blob JPEG đã thu nhỏ. */
export async function normalizeFile(file) {
  const bitmap = await createImageBitmap(file);
  try {
    return await canvasToJpeg(drawScaled(bitmap, bitmap.width, bitmap.height));
  } finally {
    bitmap.close?.();
  }
}

/**
 * Khung hình hiện tại của thẻ <video> (webcam) -> Blob JPEG.
 * Không lật ảnh (chỉ khung xem trước hiển thị kiểu gương): lật thật thì chữ / logo trên áo bị ngược.
 */
export function captureVideo(video) {
  return canvasToJpeg(drawScaled(video, video.videoWidth, video.videoHeight));
}
