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
      if (endpoint === '/api/warehouse/snapshot')
        return json({
          // Sau khi nhập kho: hàng vừa nhận nằm ở "chưa xếp", chờ xếp lên kệ.
          variants:
            state.status === 'CONFIRMED'
              ? state.lines.map((l) => ({ detail_id: l.detail_id, product_id: 10, product_name: l.product_name, color: l.color, size: l.size,
                  stock_quantity: l.quantity, unassigned_quantity: l.quantity, assigned_quantity: 0, status: 'ACTIVE' }))
              : [],
          racks: [], tiers: [], locations: [], images: []
        });
      if (endpoint === '/api/warehouse/documents') return json(documents(state));
      if (endpoint === '/api/warehouse/documents/20/scan') {
        // Mã chung của biến thể: quét +1; itemId + quantity = gõ số / bớt 1.
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

  const printDialog = (page) => page.getByRole('dialog', { name: 'In tem mã vạch' });
  const closePrint = async (page) => {
    const dialog = printDialog(page);
    await dialog.getByRole('button', { name: 'Đóng' }).click();
    await dialog.waitFor({ state: 'hidden' });
  };

  // Family: print N identical labels per variant, scan the shared code (hardware scanner anywhere + code box),
  // "bớt 1", typed count; over-scan is refused.
  const family = await open('FAMILY_MEMBER');
  {
    const { page, calls } = family;
    await page.getByRole('heading', { name: 'Đã đếm 0 / 5' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Xác nhận nhập kho' }).isDisabled(), true, 'nothing scanned yet');
    await page.getByRole('button', { name: 'Quét bằng camera' }).waitFor();
    await page.getByRole('button', { name: 'In tem', exact: true }).click();
    await printDialog(page).getByRole('button', { name: 'In ngay 5 tem' }).waitFor();
    await page.screenshot({ path: path.join(artifacts, 'labels.png'), fullPage: true });
    await closePrint(page);
    for (let i = 0; i < 3; i++) {
      await page.getByRole('heading', { name: /PN00020/ }).click();
      await page.keyboard.type('TH000001', { delay: 5 });
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: `Đã đếm ${i + 1} / 5` }).waitFor();
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
    await page.getByRole('heading', { name: 'Đã đếm 4 / 5' }).waitFor();
    await page.getByText('Thiếu 1').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Xác nhận nhập kho' }).isDisabled(), true, 'difference: owner closes it');
    await page.getByText('Báo chủ cửa hàng kiểm tra', { exact: false }).waitFor();
    // "Bớt 1" (quét trùng) rồi gõ thẳng số đã đếm.
    await page.getByRole('button', { name: 'Bớt 1 Áo thun · Đen · M' }).click();
    await page.getByRole('heading', { name: 'Đã đếm 3 / 5' }).waitFor();
    assert.ok(calls.some((c) => c.endpoint.endsWith('/scan') && c.body.itemId === 21 && c.body.quantity === 2));
    const count = page.getByRole('spinbutton', { name: 'Số đã đếm Áo thun · Đen · M' });
    await count.fill('3');
    await count.press('Enter');
    await page.getByRole('heading', { name: 'Đã đếm 4 / 5' }).waitFor();
    assert.ok(calls.some((c) => c.endpoint.endsWith('/scan') && c.body.itemId === 21 && c.body.quantity === 3));
    // Tem hỏng: in tem cho số còn thiếu của dòng đó (cùng mã chung).
    await page.getByRole('button', { name: 'In tem Áo thun · Đen · L' }).click();
    await printDialog(page).getByText('TH000002', { exact: true }).waitFor();
    await printDialog(page).getByRole('button', { name: 'In ngay 1 tem' }).waitFor();
    await closePrint(page);
    await box.fill('TH000002');
    await box.press('Enter');
    await page.getByRole('heading', { name: 'Đã đếm 5 / 5' }).waitFor();
    await page.getByRole('button', { name: 'Xác nhận nhập kho' }).click();
    await page.getByRole('dialog', { name: /Xác nhận nhập kho/ }).getByText('khớp phiếu', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await page.getByRole('columnheader', { name: 'Thực nhận' }).waitFor();
    assert.ok(calls.some((c) => c.endpoint.endsWith('/receive') && c.body.reason === null));
    // Quét xong, nhập kho xong: nút xếp lên kệ hiện ngay trên phiếu.
    await page.getByRole('button', { name: 'Xếp lên kệ (3 chưa xếp)' }).waitFor();
    await page.screenshot({ path: path.join(artifacts, 'family-received.png'), fullPage: true });
    await page.getByRole('button', { name: 'Xếp lên kệ (3 chưa xếp)' }).click();
    const place = page.getByRole('dialog', { name: /^Xếp lên kệ · Áo thun/ });
    await place.waitFor();
    assert.equal(await place.getByLabel('Số lượng', { exact: false }).first().inputValue(), '3', 'điền sẵn số vừa nhận');
    await page.screenshot({ path: path.join(artifacts, 'family-place.png'), fullPage: true });
    await place.getByRole('button', { name: 'Đóng' }).click();
    await family.context.close();
  }

  // Owner: accepts one extra, closes with a difference and a reason; the detail shows both numbers.
  const owner = await open('OWNER');
  {
    const { page, calls } = owner;
    await page.getByRole('heading', { name: 'Đã đếm 0 / 5' }).waitFor();
    await page.getByRole('button', { name: 'Hủy phiếu' }).waitFor();
    // NCC giao dư: in thêm 1 tem cùng mã.
    await page.getByRole('button', { name: 'In thêm 1 tem Áo thun · Đen · L' }).click();
    await printDialog(page).getByRole('button', { name: 'In ngay 1 tem' }).waitFor();
    await closePrint(page);
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
    await page.getByRole('heading', { name: 'Đã đếm 4 / 5' }).waitFor();
    await page.screenshot({ path: path.join(artifacts, 'owner-check.png'), fullPage: true });
    await page.getByRole('button', { name: 'Xác nhận nhập kho' }).click();
    const dialog = page.getByRole('dialog', { name: /Xác nhận nhập kho/ });
    await dialog.getByText('Chênh lệch:', { exact: false }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).isDisabled(), true, 'reason required');
    await dialog.getByLabel('Lý do').fill('NCC giao thiếu 2 áo M, thừa 1 áo L');
    await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await page.getByText('Chênh lệch khi kiểm hàng: NCC giao thiếu 2 áo M, thừa 1 áo L').waitFor();
    await page.getByRole('columnheader', { name: 'Trên phiếu' }).waitFor();
    assert.ok(calls.some((c) => c.endpoint.endsWith('/receive') && c.body.reason === 'NCC giao thiếu 2 áo M, thừa 1 áo L'));
    await owner.context.close();
  }
  console.log(`PASS: receipt goods check by shared variant code (family + owner). Screenshots: ${artifacts}`);
} finally {
  await browser?.close();
  server.kill();
}
