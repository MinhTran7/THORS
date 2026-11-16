// UI smoke test for "Chờ kiểm hàng" (receipt goods check by scanning labels) with a mocked API.
// Backend rules (no stock before the check, over-scan, wrong variant, differences) are tested in
// WarehouseOrderFlowTest; this checks what the page sends and shows per role.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = await mkdtemp(path.join(tmpdir(), 'thors-receipt-check-'));
const baseURL = 'http://127.0.0.1:4181';

const line = (over) => ({
  receipt_id: 20,
  source_receipt_item_id: 1,
  unit_price: 50000,
  price: 150000,
  handled_quantity: 0,
  reserved_quantity: 0,
  exchanged_quantity: 0,
  scanned_quantity: 0,
  expected_quantity: null,
  ...over
});

function documents(state) {
  return [
    {
      receipt_id: 10,
      receipt_type: 'PURCHASE_ORDER',
      status: 'CONFIRMED',
      manufacturer_name: 'NCC A',
      created_by: 2,
      creator_name: 'Chủ',
      receipt_date: '2026-11-14T08:00:00',
      total_amount: 250000,
      items: [
        line({ receipt_item_id: 1, receipt_id: 10, detail_id: 1, quantity: 3, product_name: 'Áo thun', color: 'Đen', size: 'M', product_id: 10, source_receipt_item_id: null }),
        line({ receipt_item_id: 2, receipt_id: 10, detail_id: 2, quantity: 2, product_name: 'Áo thun', color: 'Đen', size: 'L', product_id: 10, source_receipt_item_id: null })
      ]
    },
    {
      receipt_id: 20,
      receipt_type: 'RECEIPT',
      source_receipt_id: 10,
      source_type: 'PURCHASE_ORDER',
      status: state.status,
      manufacturer_name: 'NCC A',
      created_by: 7,
      creator_name: 'Người nhà',
      confirmer_name: 'Chủ',
      receipt_date: '2026-11-14T09:00:00',
      confirmed_at: '2026-11-14T09:30:00',
      receive_note: state.note,
      total_amount: 250000,
      items: state.lines.map((l) => ({ ...l }))
    }
  ];
}

const server = spawn(process.execPath, [path.join(frontend, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4181'], {
  cwd: frontend,
  stdio: 'pipe'
});
let browser;
try {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      if ((await fetch(baseURL)).ok) break;
    } catch {
      /* Wait for Vite. */
    }
    await delay(250);
  }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  async function open(role) {
    const state = {
      status: 'APPROVED',
      note: null,
      units: [],
      lines: [
        line({ receipt_item_id: 21, detail_id: 1, quantity: 3, product_name: 'Áo thun', color: 'Đen', size: 'M', product_id: 10, barcode: 'TH000001' }),
        line({ receipt_item_id: 22, detail_id: 2, quantity: 2, product_name: 'Áo thun', color: 'Đen', size: 'L', product_id: 10, barcode: 'TH000002', source_receipt_item_id: 2 })
      ]
    };
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const calls = [];
    await context.route('**/api/**', async (route) => {
      const request = route.request();
      const endpoint = new URL(request.url()).pathname;
      const body = request.postDataJSON?.();
      calls.push({ method: request.method(), endpoint, body });
      const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
      if (endpoint === '/api/auth/me') return json({ id: role === 'OWNER' ? 2 : 7, role, fullName: 'Test', status: 'ACTIVE' });
      if (endpoint === '/api/auth/csrf') return json({ headerName: 'X-CSRF-TOKEN', token: 't' });
      if (endpoint === '/api/notifications/unread-count') return json({ count: 0 });
      if (endpoint.startsWith('/api/notifications')) return json([]);
      if (endpoint === '/api/warehouse/snapshot') return json({ variants: [], racks: [], tiers: [], locations: [], images: [] });
      if (endpoint === '/api/warehouse/documents') return json(documents(state));
      if (endpoint === '/api/warehouse/documents/20/unit-labels') {
        // Tem serial chờ nhận: đủ số trên phiếu, in lại không sinh mã mới; extra = in thêm cho một dòng.
        for (const l of state.lines) {
          const have = state.units.filter((u) => u.in_receipt_item_id === l.receipt_item_id).length;
          const add = Math.max(0, l.quantity - have) + (body?.itemId === l.receipt_item_id ? body.extra : 0);
          for (let k = 1; k <= add; k++) {
            const seq = have + k;
            state.units.push({
              unit_id: state.units.length + 1,
              serial_code: `TH${String(l.detail_id).padStart(6, '0')}-${String(seq).padStart(4, '0')}`,
              status: 'PENDING',
              detail_id: l.detail_id,
              in_receipt_item_id: l.receipt_item_id,
              product_name: l.product_name,
              color: l.color,
              size: l.size,
              price: 150000
            });
          }
        }
        return json({ units: state.units.filter((u) => !body?.itemId || u.in_receipt_item_id === body.itemId) });
      }
      if (endpoint === '/api/warehouse/units/printed') return json({ updated: body.unitIds.length });
      if (endpoint === '/api/warehouse/documents/20/scan' && /-\d{4}$/.test(body.code || '')) {
        const unit = state.units.find((u) => u.serial_code === body.code.toUpperCase());
        if (!unit) return json({ code: 'BARCODE_NOT_FOUND', message: 'Không tìm thấy.' }, 404);
        if (unit.scanned) return json({ code: 'SCAN_DUPLICATE', message: `Tem ${unit.serial_code} đã quét rồi, không đếm thêm.` }, 409);
        unit.scanned = true;
        const l = state.lines.find((x) => x.receipt_item_id === unit.in_receipt_item_id);
        l.scanned_quantity += 1;
        return json({ ...l, serial_code: unit.serial_code });
      }
      if (endpoint === '/api/warehouse/documents/20/scan') {
        let target;
        let l;
        if (body.code) {
          l = state.lines.find((x) => x.barcode === body.code.toUpperCase());
          if (!l) return json({ code: 'SCAN_NOT_IN_RECEIPT', message: 'Áo thun · Trắng · M không có trong phiếu nhập này.' }, 409);
          target = l.scanned_quantity + 1;
        } else {
          l = state.lines.find((x) => x.receipt_item_id === body.itemId);
          target = body.quantity;
        }
        if (target > l.quantity && !(body.over && role === 'OWNER'))
          return json({ code: 'SCAN_OVER', message: `Áo thun · Đen · ${l.size}: phiếu chỉ có ${l.quantity} sản phẩm, đã quét đủ.` }, 409);
        l.scanned_quantity = target;
        return json({ ...l });
      }
      if (endpoint === '/api/warehouse/documents/20/receive') {
        const diff = state.lines.some((x) => x.scanned_quantity !== x.quantity);
        if (diff && role !== 'OWNER') return json({ code: 'WAREHOUSE_FORBIDDEN', message: 'Chủ cửa hàng cần chốt.' }, 403);
        state.status = 'CONFIRMED';
        state.note = body?.reason || null;
        state.lines = state.lines.map((x) => ({ ...x, expected_quantity: x.quantity, quantity: x.scanned_quantity }));
        return json({ receipt_id: 20, status: 'CONFIRMED' });
      }
      if (/^\/api\/warehouse\/documents\/20\/(settlements|history)$/.test(endpoint)) return json({ entries: [], actions: [], movements: [] });
      throw new Error(`Unexpected API call: ${request.method()} ${endpoint}`);
    });
    const page = await context.newPage();
    await page.goto(`${baseURL}/warehouse/receipts?id=20`);
    return { context, page, calls, state };
  }

  // Family: scan with a hardware scanner (fast keys anywhere) and the code box; over-scan is refused.
  const family = await open('FAMILY_MEMBER');
  {
    const { page, calls } = family;
    await page.getByRole('heading', { name: 'Đã quét 0 / 5' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Chốt nhận hàng' }).isDisabled(), true, 'nothing scanned yet');
    await page.getByRole('button', { name: 'In tem' }).waitFor();
    for (let i = 0; i < 3; i++) {
      await page.getByRole('heading', { name: /PN00020/ }).click();
      await page.keyboard.type('TH000001', { delay: 5 });
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: `Đã quét ${i + 1} / 5` }).waitFor();
    }
    const box = page.getByRole('textbox', { name: 'Mã tem kiểm hàng' });
    await box.fill('th000001');
    await box.press('Enter');
    await page.getByText('phiếu chỉ có 3 sản phẩm, đã quét đủ', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Vẫn nhận thừa' }).count(), 0, 'family cannot accept extra goods');
    await box.fill('TH000009');
    await box.press('Enter');
    await page.getByText('không có trong phiếu nhập này', { exact: false }).waitFor();
    await box.fill('TH000002');
    await box.press('Enter');
    await page.getByRole('heading', { name: 'Đã quét 4 / 5' }).waitFor();
    await page.getByText('Thiếu 1').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Chốt nhận hàng' }).isDisabled(), true, 'difference: owner closes it');
    await page.getByText('Báo chủ cửa hàng kiểm tra', { exact: false }).waitFor();
    // "Bớt 1" then scan again.
    await page.getByRole('button', { name: 'Bớt 1 Áo thun · Đen · M' }).click();
    await page.getByRole('heading', { name: 'Đã quét 3 / 5' }).waitFor();
    assert.ok(calls.some((c) => c.endpoint.endsWith('/scan') && c.body.itemId === 21 && c.body.quantity === 2));
    await box.fill('TH000001');
    await box.press('Enter');
    await box.fill('TH000002');
    await box.press('Enter');
    await page.getByRole('heading', { name: 'Đã quét 5 / 5' }).waitFor();
    await page.getByRole('button', { name: 'Chốt nhận hàng' }).click();
    await page.getByRole('dialog', { name: /Chốt nhận hàng/ }).getByText('khớp phiếu', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await page.getByRole('columnheader', { name: 'Thực nhận' }).waitFor();
    assert.ok(calls.some((c) => c.endpoint.endsWith('/receive') && c.body.reason === null));
    await page.screenshot({ path: path.join(artifacts, 'family-received.png'), fullPage: true });
    await family.context.close();
  }

  // Owner: accepts one extra, closes with a difference and a reason; the detail shows both numbers.
  const owner = await open('OWNER');
  {
    const { page, calls } = owner;
    await page.getByRole('heading', { name: 'Đã quét 0 / 5' }).waitFor();
    await page.getByRole('button', { name: 'Hủy phiếu' }).waitFor();
    const box = page.getByRole('textbox', { name: 'Mã tem kiểm hàng' });
    for (const code of ['TH000002', 'TH000002', 'TH000002']) {
      await box.fill(code);
      await box.press('Enter');
    }
    await page.getByRole('button', { name: 'Vẫn nhận thừa' }).click();
    await page.getByText('Thừa 1').waitFor();
    assert.ok(calls.some((c) => c.endpoint.endsWith('/scan') && c.body.over === true && c.body.code === 'TH000002'));
    await box.fill('TH000001');
    await box.press('Enter');
    await page.getByRole('heading', { name: 'Đã quét 4 / 5' }).waitFor();
    await page.screenshot({ path: path.join(artifacts, 'owner-check.png'), fullPage: true });
    await page.getByRole('button', { name: 'Chốt nhận hàng' }).click();
    const dialog = page.getByRole('dialog', { name: /Chốt nhận hàng/ });
    await dialog.getByText('Chênh lệch:', { exact: false }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).isDisabled(), true, 'reason required');
    await dialog.getByLabel('Lý do').fill('NCC giao thiếu 2 áo M, thừa 1 áo L');
    await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await page.getByText('Chênh lệch khi kiểm hàng: NCC giao thiếu 2 áo M, thừa 1 áo L').waitFor();
    await page.getByRole('columnheader', { name: 'Trên phiếu' }).waitFor();
    assert.ok(calls.some((c) => c.endpoint.endsWith('/receive') && c.body.reason === 'NCC giao thiếu 2 áo M, thừa 1 áo L'));
    await owner.context.close();
  }
  // Serial labels: one code per piece, each label counts once, extra label for one line.
  const serial = await open('FAMILY_MEMBER');
  {
    const { page, calls } = serial;
    await page.getByRole('heading', { name: 'Đã quét 0 / 5' }).waitFor();
    await page.getByRole('button', { name: 'In tem', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'In tem serial (mỗi chiếc một tem)' });
    await dialog.getByText('TH000001-0001 … TH000001-0003').waitFor();
    await dialog.getByText('TH000002-0001 … TH000002-0002').waitFor();
    await dialog.getByRole('button', { name: 'In ngay 5 tem' }).waitFor();
    await page.screenshot({ path: path.join(artifacts, 'serial-labels.png'), fullPage: true });
    await dialog.getByRole('button', { name: 'Đóng' }).click();
    await dialog.waitFor({ state: 'hidden' });
    const box = page.getByRole('textbox', { name: 'Mã tem kiểm hàng' });
    await box.fill('th000001-0002');
    await box.press('Enter');
    await page.getByText('TH000001-0002 · Áo thun · Đen · M: đã quét 1 / 3').waitFor();
    await box.fill('TH000001-0002');
    await box.press('Enter');
    await page.getByText('Tem TH000001-0002 đã quét rồi', { exact: false }).waitFor();
    await page.getByRole('heading', { name: 'Đã quét 1 / 5' }).waitFor();
    await page.getByRole('button', { name: 'In thêm 1 tem Áo thun · Đen · L' }).click();
    dialog = page.getByRole('dialog', { name: 'In tem serial (mỗi chiếc một tem)' });
    await dialog.getByText('TH000002-0003', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'In ngay 1 tem' }).waitFor();
    assert.ok(calls.some((c) => c.endpoint.endsWith('/unit-labels') && c.body?.itemId === 22 && c.body?.extra === 1));
    await serial.context.close();
  }
  console.log(`PASS: receipt goods check by scanning (family + owner + serial labels). Screenshots: ${artifacts}`);
} finally {
  await browser?.close();
  server.kill();
}
