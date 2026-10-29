import JsBarcode from 'jsbarcode';

export const MAX_LABELS = 5000;

export function barcodeSvg(code) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, code, { format: 'CODE128', width: 2, height: 48, fontSize: 14, margin: 20, background: '#ffffff', lineColor: '#000000' });
  svg.setAttribute('viewBox', `0 0 ${Number.parseFloat(svg.getAttribute('width'))} ${Number.parseFloat(svg.getAttribute('height'))}`);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
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

export function labelDocument(variants, quantities, format = 'a4') {
  validateLabelQuantities(variants, quantities);
  const roll = format === 'roll';
  const labels = variants
    .map((variant) => {
      const label = `<section class="label"><div class="name">${escapeHtml(variant.product_name)}</div><div class="variant">${escapeHtml(variant.color)} · Size ${escapeHtml(variant.size)}</div>${barcodeSvg(variant.barcode)}</section>`;
      return label.repeat(Number(quantities[variant.detail_id]));
    })
    .join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Tem mã vạch THORS</title><style>
    @page { size: ${roll ? '50mm 30mm' : 'A4'}; margin: ${roll ? '0' : '10mm'}; }
    * { box-sizing: border-box; }
    html,body { margin: 0; padding: 0; background: white; color: black; font-family: Arial,sans-serif; }
    .sheet { ${roll ? 'display:block;width:50mm;' : 'display:grid;grid-template-columns:repeat(3,50mm);gap:2mm;'} }
    .label { width:50mm;height:30mm;padding:1.5mm;overflow:hidden;break-inside:avoid;${roll ? 'break-after:page;' : ''} }
    .label:last-child { break-after:auto; }
    .name { height:7mm;font-size:9pt;font-weight:700;line-height:1.1;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere; }
    .variant { height:3.5mm;font-size:8pt;line-height:3.5mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
    svg { display:block;width:100%;height:16mm; }
  </style></head><body><main class="sheet">${labels}</main></body></html>`;
}

export function printLabels(variants, quantities, format) {
  const html = labelDocument(variants, quantities, format);
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
