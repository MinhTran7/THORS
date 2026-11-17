/**
 * Đổi số đo của khách (cm) -> cách biến dạng người mẫu 3D.
 *
 * Người mẫu (public/models/avatar-*.glb) có các "núm" (morph target) cho từng vòng đo:
 *   "...-incr" = 1 -> vòng to ra,  "...-decr" = 1 -> vòng nhỏ lại.
 * File avatar-*.json (do scripts/avatar-optimize tạo) ghi chu vi người mẫu đo được (cm):
 *   baseCm (gốc), incrCm (núm to = 1), decrCm (núm nhỏ = 1) + chiều cao người mẫu.
 *
 * Cách tính:
 * 1. Chiều cao: phóng to/thu nhỏ đều cả người: scale = cao khách / cao người mẫu.
 *    Phóng đều thì chu vi cũng đổi theo scale, nên số đo vòng được quy về "cỡ người mẫu": target / scale.
 * 2. Mỗi vòng: nội suy tuyến tính giữa gốc và incr (hoặc decr) để ra giá trị núm.
 *    Cho phép núm > 1 (tối đa MAX_WEIGHT) cho người có số đo vượt mẫu; càng lớn càng kém tự nhiên.
 * 3. Khách bỏ trống vòng nào -> ước lượng từ chỉ số BMI (chỉ gần đúng).
 */

export const MAX_WEIGHT = 2.5;
const REFERENCE_BMI = 20.5; // khoảng BMI của người mẫu gốc (dáng thon)

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Giá trị cho 2 núm của một vòng đo: { [incrKey]: w, [decrKey]: w } */
function measureWeights(m, targetCm) {
  const weights = { [m.keys.incr]: 0, [m.keys.decr]: 0 };
  if (targetCm > m.baseCm) {
    weights[m.keys.incr] = clamp((targetCm - m.baseCm) / (m.incrCm - m.baseCm), 0, MAX_WEIGHT);
  } else if (targetCm < m.baseCm) {
    weights[m.keys.decr] = clamp((m.baseCm - targetCm) / (m.baseCm - m.decrCm), 0, 1);
  }
  return weights;
}

/**
 * @param profile { heightCm, weightKg, chestCm?, waistCm?, hipCm? } (số hoặc chuỗi; ô trống = không có)
 * @param calibration nội dung avatar-*.json
 * @returns { scale, weights: { tênNúm: giá trị }, estimated: ['waist', ...] }
 */
export function bodyMorph(profile, calibration) {
  const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(String(v).replace(',', '.')));
  const heightCm = num(profile.heightCm);
  const scale = heightCm > 0 ? heightCm / calibration.heightCm : 1;

  // Ước lượng khi thiếu số đo vòng: vòng tỷ lệ với căn bậc hai BMI (ước lượng thô)
  const weightKg = num(profile.weightKg);
  const bmi = heightCm > 0 && weightKg > 0 ? weightKg / (heightCm / 100) ** 2 : REFERENCE_BMI;
  const bmiFactor = Math.sqrt(bmi / REFERENCE_BMI);

  const fields = { bust: 'chestCm', waist: 'waistCm', hips: 'hipCm' };
  const weights = {};
  const estimated = [];
  const girths = {}; // chu vi mục tiêu theo cỡ người mẫu (cm), để vẽ vòng "thước dây" ôm đúng thân
  for (const [name, m] of Object.entries(calibration.measures)) {
    let target = num(profile[fields[name]]);
    if (!(target > 0)) {
      estimated.push(name);
      target = m.baseCm * scale * bmiFactor; // cỡ thật (cm) ước lượng
    }
    girths[name] = target / scale;
    Object.assign(weights, measureWeights(m, target / scale));
  }
  return { scale, weights, estimated, girths };
}
