// Đọc nhanh phần JSON của file GLB ngay trên trình duyệt (trước khi tải lên) để báo lỗi sớm và liệt kê vật liệu.
// Cùng luật với GlbInspector (backend) - backend vẫn kiểm tra lại khi lưu.

export const GLB_MAX_BYTES = 10 * 1024 * 1024;
const SIZE_MORPHS = ['Size_up', 'Size_down'];
const BODY_MORPHS = ['Bust_up', 'Bust_down', 'Waist_up', 'Waist_down', 'Hips_up', 'Hips_down'];
const SUPPORTED = ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'KHR_texture_transform', 'KHR_materials_emissive_strength'];

/**
 * @param buffer ArrayBuffer của file .glb
 * @returns { materials: string[], morphs: string[], problems: string[] } (problems rỗng = mặc được)
 */
export function readGlbInfo(buffer) {
  const fail = (text) => ({ materials: [], morphs: [], problems: [text] });
  if (buffer.byteLength > GLB_MAX_BYTES) return fail('File tối đa 10 MB. Hãy nén file (meshopt) hoặc giảm số đa giác.');
  if (buffer.byteLength < 20) return fail('File không phải mô hình 3D GLB hợp lệ.');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) return fail('File không phải mô hình 3D GLB hợp lệ (cần xuất "glTF Binary .glb").');
  if (view.getUint32(4, true) !== 2) return fail('Chỉ hỗ trợ glTF 2.0.');
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || 20 + jsonLength > buffer.byteLength) return fail('File GLB bị hỏng.');

  let json;
  try {
    json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  } catch {
    return fail('File GLB bị hỏng (không đọc được phần mô tả).');
  }
  const morphs = [...new Set((json.meshes ?? []).flatMap((m) => m?.extras?.targetNames ?? []))];
  const materials = [...new Set((json.materials ?? []).map((m) => m?.name).filter(Boolean))];
  const problems = [];
  const unsupported = (json.extensionsRequired ?? []).filter((e) => !SUPPORTED.includes(e));
  if (unsupported.length) problems.push(`Dùng định dạng chưa hỗ trợ: ${unsupported.join(', ')} (hãy nén bằng meshopt, không dùng Draco).`);
  if (!SIZE_MORPHS.every((m) => morphs.includes(m))) problems.push('Thiếu núm đổi size (Size_up, Size_down).');
  const missing = BODY_MORPHS.filter((m) => !morphs.includes(m));
  if (missing.length) problems.push(`Thiếu núm co giãn theo số đo: ${missing.join(', ')} (áo phải dựng trên người mẫu THORS).`);
  if (materials.length === 0) problems.push('File không có vật liệu nào để chọn làm vải.');
  return { materials, morphs, problems };
}
