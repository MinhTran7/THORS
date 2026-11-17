/**
 * Câu mô tả độ vừa của 1 số đo (dùng chung cho khung "Gợi ý size" và hộp thoại "Thử trên dáng của bạn").
 * d = MeasureFit từ backend: { measure, label, value, min, max, status: FIT | TIGHT | LOOSE | SHORT | LONG }
 * tone: FIT (vừa) | SLIGHT (lệch ít) | TIGHT (chật / ngắn) | LOOSE (rộng / dài) -> dùng để tô màu.
 */
export function describeFit(d) {
  const off = d.status === 'FIT' ? 0 : d.value > d.max ? d.value - d.max : d.min - d.value;
  // Lệch ít: bàn chân <= 0.5 cm, các số đo khác <= 2 cm / 2 kg
  const slight = d.status !== 'FIT' && off <= (d.measure === 'foot' ? 0.5 : 2);
  const tone = d.status === 'FIT' ? 'FIT' : slight ? 'SLIGHT' : d.status === 'TIGHT' || d.status === 'SHORT' ? 'TIGHT' : 'LOOSE';
  const hoi = slight ? 'hơi ' : '';

  let text;
  if (d.status === 'FIT') {
    text = `${d.label} vừa`;
  } else if (d.measure === 'height') {
    // Cao hơn khoảng của size -> đồ bị ngắn; thấp hơn -> đồ bị dài
    text = d.status === 'SHORT' ? `Đồ có thể ${hoi}ngắn (bạn cao hơn size này)` : `Đồ có thể ${hoi}dài (bạn thấp hơn size này)`;
  } else if (d.measure === 'weight') {
    text = d.status === 'TIGHT' ? `Cân nặng trên khoảng của size (có thể ${hoi}chật)` : `Cân nặng dưới khoảng của size (có thể ${hoi}rộng)`;
  } else {
    text = `${d.label} ${hoi}${d.status === 'TIGHT' ? 'chật' : 'rộng'}`;
  }
  return { tone, text };
}

/** "Ngực vừa · Eo hơi rộng" */
export const fitSummary = (details) => details.map((d) => describeFit(d).text).join(' · ');
