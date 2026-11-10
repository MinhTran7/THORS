import JsBarcode from 'jsbarcode';

export const MAX_LABELS = 5000;

/**
 * Label templates, sizes in mm. A roll template prints one row of `cols` labels per page (the page is
 * exactly one row of the roll); an A4 template fills the sheet left to right, top to bottom.
 */
export const LABEL_TEMPLATES = {
  roll1: { name: 'Tem cuộn 1 tem/hàng — 50 × 30 mm', kind: 'roll', w: 50, h: 30, cols: 1, gap: 0, pageW: 50 },
  roll2: { name: 'Tem cuộn 2 tem/hàng — 35 × 22 mm (khổ 72 mm)', kind: 'roll', w: 35, h: 22, cols: 2, gap: 2, pageW: 72 },
  roll3: { name: 'Tem cuộn 3 tem/hàng — 35 × 22 mm (khổ 110 mm)', kind: 'roll', w: 35, h: 22, cols: 3, gap: 2, pageW: 110 },
  a4_50x30: { name: 'Giấy A4 — tem 50 × 30 mm, 3 cột', kind: 'a4', w: 50, h: 30, cols: 3, gap: 2, margin: '10mm', mx: 10, my: 10 },
  a4_65: {
    name: 'Giấy A4 65 tem — 38 × 21 mm (5 × 13)',
    kind: 'a4',
    w: 38.1,
    h: 21.2,
    cols: 5,
    gap: 0,
    margin: '10.7mm 9.75mm',
    mx: 9.75,
    my: 10.7
  }
};

export const DEFAULT_LABEL_OPTIONS = {
  template: 'roll1',
  showShop: false,
  shopName: 'THORS',
  showName: true,
  showVariant: true,
  showPrice: true,
  showCode: true,
  // Thin frame around each label in the PDF so a print shop can cut plain (not pre-cut) decal paper.
  cutLines: true
};

// Older saved values ('a4' / 'roll') map to the templates they used to mean.
const LEGACY_TEMPLATE = { a4: 'a4_50x30', roll: 'roll1' };
export const templateOf = (key) => LABEL_TEMPLATES[LEGACY_TEMPLATE[key] || key] || LABEL_TEMPLATES.roll1;

/** Bars only, stretched to the box; the code text is printed as HTML so it stays sharp and readable. */
export function barcodeSvg(code) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, code, {
    format: 'CODE128',
    width: 2,
    height: 60,
    margin: 0,
    displayValue: false,
    background: '#ffffff',
    lineColor: '#000000'
  });
  svg.setAttribute('viewBox', `0 0 ${Number.parseFloat(svg.getAttribute('width'))} ${Number.parseFloat(svg.getAttribute('height'))}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.removeAttribute('style');
  return svg.outerHTML;
}

export function validateLabelQuantities(variants, quantities) {
  if (!variants.length) throw new Error('Hãy chọn ít nhất một biến thể cần in tem.');
  let total = 0;
  for (const variant of variants) {
    if (!variant.barcode) throw new Error('Có biến thể chưa có mã vạch. Chủ cửa hàng cần tạo mã trước khi in.');
    const quantity = Number(quantities[variant.detail_id]);
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Số tem của mỗi biến thể phải là số nguyên lớn hơn 0.');
    total += quantity;
    if (total > MAX_LABELS) throw new Error(`Mỗi lần in tối đa ${MAX_LABELS.toLocaleString('vi-VN')} tem. Hãy chia thành nhiều lần in.`);
  }
  return total;
}

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const priceText = (price) => (price == null || price === '' ? '' : `${new Intl.NumberFormat('vi-VN').format(Number(price))} đ`);

/** One label's inner HTML. Lines switched off in the options are left out and the bars take the room. */
export function labelHtml(variant, options = DEFAULT_LABEL_OPTIONS) {
  const o = { ...DEFAULT_LABEL_OPTIONS, ...options };
  const price = o.showPrice ? priceText(variant.price) : '';
  const parts = [
    o.showShop && o.shopName?.trim() ? `<div class="shop">${escapeHtml(o.shopName.trim())}</div>` : '',
    o.showName ? `<div class="name">${escapeHtml(variant.product_name)}</div>` : '',
    o.showVariant ? `<div class="variant">${escapeHtml(variant.color)} · Size ${escapeHtml(variant.size)}</div>` : '',
    `<div class="bars">${barcodeSvg(variant.barcode)}</div>`,
    o.showCode || price
      ? `<div class="foot"><span class="code">${o.showCode ? escapeHtml(variant.barcode) : ''}</span><span class="price">${escapeHtml(price)}</span></div>`
      : ''
  ];
  return `<section class="label">${parts.join('')}</section>`;
}

function labelCss(t) {
  const small = t.h < 25;
  const fs = small ? 6 : 8;
  return `
    * { box-sizing: border-box; }
    html,body { margin:0; padding:0; background:white; color:black; font-family:Arial,Helvetica,sans-serif; }
    .label { width:${t.w}mm; height:${t.h}mm; padding:${small ? '0.8mm 1.2mm' : '1.5mm 2mm'}; overflow:hidden;
      display:flex; flex-direction:column; break-inside:avoid; page-break-inside:avoid; }
    .shop { font-size:${fs - 0.5}pt; font-weight:700; text-align:center; text-transform:uppercase; line-height:1.15;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:none; }
    .name { font-size:${fs + 0.5}pt; font-weight:700; line-height:1.12; flex:none; overflow:hidden;
      display:-webkit-box; -webkit-line-clamp:${small ? 1 : 2}; -webkit-box-orient:vertical; overflow-wrap:anywhere; }
    .variant { font-size:${fs}pt; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:none; }
    .bars { flex:1 1 auto; min-height:${small ? 6 : 8}mm; padding:0.6mm 1.5mm 0.3mm; }
    .bars svg { display:block; width:100%; height:100%; }
    .foot { display:flex; justify-content:space-between; align-items:baseline; gap:1mm; flex:none; line-height:1.15; }
    .code { font-size:${fs}pt; letter-spacing:0.3pt; white-space:nowrap; }
    .price { font-size:${fs + 1.5}pt; font-weight:700; white-space:nowrap; }`;
}

function sheetCss(t) {
  if (t.kind === 'roll') {
    return `
    @page { size:${t.pageW}mm ${t.h}mm; margin:0; }
    .row { width:${t.pageW}mm; height:${t.h}mm; display:flex; gap:${t.gap}mm; break-after:page; page-break-after:always; overflow:hidden; }
    .row:last-child { break-after:auto; page-break-after:auto; }`;
  }
  return `
    @page { size:A4; margin:${t.margin}; }
    .sheet { display:grid; grid-template-columns:repeat(${t.cols}, ${t.w}mm); gap:${t.gap}mm; }`;
}

/** The expanded list of labels, in print order (each variant repeated by its quantity). */
function expand(variants, quantities) {
  return variants.flatMap((v) => Array.from({ length: Number(quantities[v.detail_id]) }, () => v));
}

export function labelDocument(variants, quantities, options = DEFAULT_LABEL_OPTIONS) {
  validateLabelQuantities(variants, quantities);
  const o = typeof options === 'string' ? { ...DEFAULT_LABEL_OPTIONS, template: options } : { ...DEFAULT_LABEL_OPTIONS, ...options };
  const t = templateOf(o.template);
  // Same variant → same markup; build it once and repeat.
  const cache = new Map(variants.map((v) => [v.detail_id, labelHtml(v, o)]));
  const all = expand(variants, quantities).map((v) => cache.get(v.detail_id));
  let body;
  if (t.kind === 'roll') {
    const rows = [];
    for (let i = 0; i < all.length; i += t.cols) rows.push(`<div class="row">${all.slice(i, i + t.cols).join('')}</div>`);
    body = rows.join('');
  } else {
    body = `<main class="sheet">${all.join('')}</main>`;
  }
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Tem mã vạch THORS</title><style>${labelCss(t)}${sheetCss(
    t
  )}</style></head><body>${body}</body></html>`;
}

/** Screen preview: one label per variant at real size, on a grey background. */
export function previewDocument(variants, options = DEFAULT_LABEL_OPTIONS) {
  const o = { ...DEFAULT_LABEL_OPTIONS, ...options };
  const t = templateOf(o.template);
  const labels = variants
    .filter((v) => v.barcode)
    .map((v) => labelHtml(v, o))
    .join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><style>${labelCss(t)}
    body { background:#eef0f3; padding:12px; display:flex; flex-wrap:wrap; gap:12px; align-items:flex-start; }
    .label { background:white; box-shadow:0 0 0 1px #c9ced6, 0 1px 3px rgba(0,0,0,.12); border-radius:1.5mm; }
  </style></head><body>${labels}</body></html>`;
}

export function printLabels(variants, quantities, options) {
  const html = labelDocument(variants, quantities, options);
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.title = 'Bản in tem mã vạch';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;';
    const cleanup = () => frame.remove();
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Không mở được bản in. Vui lòng thử lại.'));
    }, 15000);
    frame.onload = () => {
      window.clearTimeout(timeout);
      try {
        frame.contentWindow.addEventListener('afterprint', cleanup, { once: true });
        frame.contentWindow.focus();
        frame.contentWindow.print();
        window.setTimeout(cleanup, 120000);
        resolve();
      } catch {
        cleanup();
        reject(new Error('Trình duyệt chưa mở được hộp thoại in. Vui lòng thử trên trình duyệt khác.'));
      }
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

/* ------------------------------------------------------------------------------------------------
 * PDF file (no printer at hand: send the file to a print shop and print on decal paper).
 * Bars are vector rectangles so they stay sharp at any printer resolution; the Vietnamese text is
 * drawn on a 600 dpi canvas (the built-in PDF fonts have no Vietnamese glyphs) and placed as an image.
 * ---------------------------------------------------------------------------------------------- */

const PX_PER_MM = 24; // ≈ 600 dpi
const PT_TO_MM = 0.3528;
const FONT = 'Arial, Helvetica, sans-serif';

/** The Code 128 modules of a code as a '0'/'1' string (quiet zones not included). */
export function barcodeBits(code) {
  const data = {};
  JsBarcode(data, code, { format: 'CODE128' });
  return data.encodings.map((e) => e.data).join('');
}

/** Wrap text into at most `maxLines` lines that fit `maxW`, ending with … when cut. */
function fitLines(g, text, maxW, maxLines) {
  const words = String(text ?? '')
    .split(/\s+/)
    .filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (g.measureText(next).width <= maxW || !current) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  const out = lines.slice(0, maxLines);
  const cut = lines.length > maxLines;
  if (out.length) {
    let last = out[out.length - 1];
    if (cut || g.measureText(last).width > maxW) {
      while (last.length > 1 && g.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
      out[out.length - 1] = `${last.trimEnd()}…`;
    }
  }
  return out;
}

/**
 * Draw the text of one label (transparent background) and work out where the bars go.
 * Mirrors the HTML label layout: shop, name, colour/size on top, code + price at the bottom.
 */
function renderLabelText(variant, o, t) {
  const S = PX_PER_MM;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(t.w * S);
  canvas.height = Math.round(t.h * S);
  const g = canvas.getContext('2d');
  g.fillStyle = '#000';
  g.textBaseline = 'top';
  const small = t.h < 25;
  const fs = small ? 6 : 8;
  const padY = (small ? 0.8 : 1.5) * S;
  const padX = (small ? 1.2 : 2) * S;
  const innerW = canvas.width - 2 * padX;
  const px = (pt) => pt * PT_TO_MM * S;
  let y = padY;
  const block = (text, size, bold, maxLines, center = false) => {
    g.font = `${bold ? 'bold ' : ''}${px(size)}px ${FONT}`;
    g.textAlign = center ? 'center' : 'left';
    for (const line of fitLines(g, text, innerW, maxLines)) {
      g.fillText(line, center ? canvas.width / 2 : padX, y);
      y += px(size) * 1.15;
    }
  };
  if (o.showShop && o.shopName?.trim()) block(o.shopName.trim().toUpperCase(), fs - 0.5, true, 1, true);
  if (o.showName) block(variant.product_name, fs + 0.5, true, small ? 1 : 2);
  if (o.showVariant) block(`${variant.color} · Size ${variant.size}`, fs, false, 1);

  const price = o.showPrice ? priceText(variant.price) : '';
  let barsBottom = canvas.height - padY;
  if (o.showCode || price) {
    const footH = px(fs + 1.5) * 1.15;
    const base = canvas.height - padY;
    g.textBaseline = 'alphabetic';
    const descent = px(fs + 1.5) * 0.2;
    if (o.showCode) {
      g.font = `${px(fs)}px ${FONT}`;
      g.textAlign = 'left';
      g.fillText(variant.barcode, padX, base - descent);
    }
    if (price) {
      g.font = `bold ${px(fs + 1.5)}px ${FONT}`;
      g.textAlign = 'right';
      g.fillText(price, canvas.width - padX, base - descent);
    }
    barsBottom = base - footH - 0.3 * S;
  }
  const barsTop = y + 0.6 * S;
  const quiet = 1.5 * S;
  return {
    png: canvas.toDataURL('image/png'),
    bars: { x: (padX + quiet) / S, y: barsTop / S, w: (innerW - 2 * quiet) / S, h: Math.max(4, (barsBottom - barsTop) / S) }
  };
}

/** Label positions (mm) in print order: [{page, x, y}]. */
function layout(count, t) {
  const spots = [];
  if (t.kind === 'roll') {
    const offset = (t.pageW - (t.cols * t.w + (t.cols - 1) * t.gap)) / 2;
    for (let i = 0; i < count; i++) spots.push({ page: Math.floor(i / t.cols), x: offset + (i % t.cols) * (t.w + t.gap), y: 0 });
  } else {
    const rows = Math.floor((297 - 2 * t.my + t.gap) / (t.h + t.gap));
    const perPage = rows * t.cols;
    for (let i = 0; i < count; i++) {
      const k = i % perPage;
      spots.push({
        page: Math.floor(i / perPage),
        x: t.mx + (k % t.cols) * (t.w + t.gap),
        y: t.my + Math.floor(k / t.cols) * (t.h + t.gap)
      });
    }
  }
  return spots;
}

/** Build the PDF (jsPDF document) for the given labels. */
export async function labelPdf(variants, quantities, options = DEFAULT_LABEL_OPTIONS) {
  validateLabelQuantities(variants, quantities);
  const o = { ...DEFAULT_LABEL_OPTIONS, ...options };
  const t = templateOf(o.template);
  const { jsPDF } = await import('jspdf');
  const size = t.kind === 'roll' ? [t.pageW, t.h] : [210, 297];
  const doc = new jsPDF({ unit: 'mm', format: size, orientation: size[0] > size[1] ? 'landscape' : 'portrait', compress: true });
  doc.setProperties({ title: 'Tem mã vạch THORS', creator: 'THORS' });
  const art = new Map(variants.map((v) => [v.detail_id, { ...renderLabelText(v, o, t), bits: barcodeBits(v.barcode) }]));
  const labels = expand(variants, quantities);
  const spots = layout(labels.length, t);
  let page = 0;
  labels.forEach((v, i) => {
    const spot = spots[i];
    if (spot.page !== page) {
      doc.addPage(size, size[0] > size[1] ? 'landscape' : 'portrait');
      page = spot.page;
    }
    const a = art.get(v.detail_id);
    if (o.cutLines && t.kind === 'a4') {
      doc.setDrawColor(190);
      doc.setLineWidth(0.1);
      doc.rect(spot.x, spot.y, t.w, t.h);
    }
    // Same alias → the text image is stored once per variant, however many labels repeat it.
    doc.addImage(a.png, 'PNG', spot.x, spot.y, t.w, t.h, `label-${v.detail_id}`, 'FAST');
    const module = a.bars.w / a.bits.length;
    doc.setFillColor(0, 0, 0);
    for (let b = 0; b < a.bits.length; ) {
      if (a.bits[b] !== '1') {
        b++;
        continue;
      }
      let end = b;
      while (a.bits[end] === '1') end++;
      doc.rect(spot.x + a.bars.x + b * module, spot.y + a.bars.y, (end - b) * module, a.bars.h, 'F');
      b = end;
    }
  });
  return doc;
}

export async function downloadLabelsPdf(variants, quantities, options) {
  const doc = await labelPdf(variants, quantities, options);
  const t = templateOf({ ...DEFAULT_LABEL_OPTIONS, ...options }.template);
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`Tem_ma_vach_${t.kind === 'roll' ? `cuon_${t.w}x${t.h}` : `A4_${Math.round(t.w)}x${Math.round(t.h)}`}_${stamp}.pdf`);
}
