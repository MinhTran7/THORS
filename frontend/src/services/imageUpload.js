// Tải ảnh đại diện lên Cloudinary (unsigned upload). Cần khai báo trong file .env:
//   VITE_CLOUDINARY_CLOUD_NAME=...   VITE_CLOUDINARY_UPLOAD_PRESET=...
// Backend chỉ lưu đường dẫn https của ảnh (cột user.avatar_url).
const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export const imageUploadEnabled = Boolean(cloudName && uploadPreset);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function uploadImage(file) {
  if (!imageUploadEnabled) throw new Error('Photo upload is not configured yet.');
  if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Choose a JPG or PNG image.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('The image must be 5 MB or smaller.');
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', uploadPreset);
  form.append('folder', 'thors/avatars');
  let response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: form });
  } catch {
    throw new Error('Could not reach the image service. Please try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !String(data.secure_url || '').startsWith('https://')) {
    throw new Error(data?.error?.message || 'The photo could not be uploaded.');
  }
  return data.secure_url;
}