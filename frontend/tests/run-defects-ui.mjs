// UI smoke test for Bán hàng → Xử lý hàng lỗi (quét serial, ghi lỗi, sửa xong / bỏ hẳn, mẫu lỗi) with a mocked API.
// Backend rules (stock unchanged on report, discard takes the piece off its shelf…) are in WarehouseDefectsTest.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = await mkdtemp(path.join(tmpdir(), 'thors-defects-'));
const baseURL = 'http://127.0.0.1:4183';

const variant = { detail_id: 51, product_id: 24, product_name: 'Áo Hooldy', color: 'Nâu kem', size: 'L', barcode: 'TH000051', stock_quantity: 20 };
const unit = (seq, extra) => ({
  unit_id: seq,
  serial_code: `TH000051-${String(seq).padStart(4, '0')}`,
  status: 'IN_STOCK',
  detail_id: 51,
  location: null,
  ...extra
});

const server = spawn(process.execPath, [path.join(frontend, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4183'], {
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
      types: ['Rách', 'Bung chỉ', 'Ố bẩn'],
      defects: [
        {
          defect_id: 7,
          unit_id: 9,
          serial_code: 'TH000051-0009',
          product_name: 'Áo Hooldy',
          color: 'Nâu kem',
          size: 'L',
          types: ['Ố bẩn'],
          defect_types: 'Ố bẩn',
          description: 'Vết ố ở tay áo',
          source: 'WAREHOUSE',
          photo_keys: [],
          status: 'OPEN',
          unit_status: 'IN_STOCK',
          location: 'A1',
          reporter_name: 'Người nhà',
          reported_at: '2026-11-16T09:00:00'
        }
      ]
    };
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const calls = [];
    await context.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const endpoint = url.pathname;
      const body = request.postDataJSON?.();
      calls.push({ method: request.method(), endpoint, query: Object.fromEntries(url.searchParams), body });
      const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
      if (endpoint === '/api/auth/me') return json({ id: role === 'OWNER' ? 2 : 7, role, fullName: 'Test', status: 'ACTIVE' });
      if (endpoint === '/api/auth/csrf') return json({ headerName: 'X-CSRF-TOKEN', token: 't' });
      if (endpoint === '/api/notifications/unread-count') return json({ count: 0 });
      if (endpoint.startsWith('/api/notifications')) return json([]);
      if (endpoint === '/api/warehouse/snapshot') return json({ variants: [], racks: [], tiers: [], locations: [], images: [] });
      if (endpoint === '/api/warehouse/documents') return json([]);
      if (endpoint === '/api/warehouse/defect-types' && request.method() === 'GET') return json(state.types);
      if (endpoint === '/api/warehouse/defects' && request.method() === 'GET') {
        const st = url.searchParams.get('status');
        const counts = {};
        state.defects.forEach((d) => (counts[d.status] = (counts[d.status] || 0) + 1));
        return json({ items: state.defects.filter((d) => st === 'ALL' || d.status === st), counts });
      }
      if (endpoint === '/api/warehouse/defects' && request.method() === 'POST') {
        state.defects.unshift({
          ...state.defects[0],
          defect_id: 8,
          serial_code: body.serial,
          types: body.types,
          defect_types: body.types.join(', '),
          description: body.description,
          source: body.source,
          location: null,
          reporter_name: 'Test',
          reported_at: '2026-11-17T09:00:00'
        });
        return json(state.defects[0]);
      }
      const resolve = endpoint.match(/^\/api\/warehouse\/defects\/(\d+)\/(fix|discard)$/);
      if (resolve) {
        const d = state.defects.find((x) => x.defect_id === Number(resolve[1]));
        d.status = resolve[2] === 'fix' ? 'FIXED' : 'DISCARDED';
        d.resolve_note = body?.note;
        return json(d);
      }
      if (endpoint === '/api/warehouse/barcodes/lookup') {
        const code = url.searchParams.get('code');
        if (code === 'TH000051') return json({ variant, locations: [] });
        if (code === 'TH000051-0003') return json({ variant, locations: [], unit: unit(3) });
        if (code === 'TH000051-0001') return json({ variant, locations: [], unit: unit(1, { status: 'SOLD' }) });
        return json({ code: 'BARCODE_NOT_FOUND', message: 'Không tìm thấy hàng hóa có mã vạch này.' }, 404);
      }
      throw new Error(`Unexpected API call: ${request.method()} ${endpoint}`);
    });
    const page = await context.newPage();
    await page.goto(`${baseURL}/warehouse/defects`);
    return { context, page, calls, state };
  }

  // Owner: menu entry, variant code refused, report a defect on the exact piece, fix / discard, add a defect type.
  const owner = await open('OWNER');
  {
    const { page, calls } = owner;
    await page.getByRole('heading', { name: 'Xử lý hàng lỗi' }).waitFor();
    await page.getByRole('link', { name: 'Xử lý hàng lỗi' }).waitFor(); // menu Bán hàng
    await page.getByText('Vết ố ở tay áo').waitFor();
    const box = page.getByRole('textbox', { name: 'Mã tem hàng lỗi' });
    await box.fill('th000051');
    await box.press('Enter');
    await page.getByText('TH000051 là mã biến thể', { exact: false }).waitFor();
    await box.fill('TH000051-0001');
    await box.press('Enter');
    await page.getByText('không còn trong kho (Đã bán)', { exact: false }).waitFor();
    // Máy quét USB: gõ nhanh ở bất kỳ đâu trên trang
    await page.getByRole('heading', { name: 'Xử lý hàng lỗi' }).click();
    await page.keyboard.type('TH000051-0003', { delay: 5 });
    await page.keyboard.press('Enter');
    await page.getByText('Áo Hooldy · Nâu kem · L').first().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Ghi lỗi', exact: true }).isDisabled(), true, 'chưa chọn lỗi');
    await page.getByRole('button', { name: 'Rách' }).click();
    await page.getByRole('button', { name: 'Bung chỉ' }).click();
    // Chủ cửa hàng gõ thêm lỗi chưa có sẵn
    await page.getByLabel('Lỗi khác (chủ cửa hàng gõ thêm)').fill('Thủng lỗ');
    await page.getByRole('button', { name: 'Thêm', exact: true }).click();
    await page.getByRole('button', { name: 'Thủng lỗ' }).waitFor();
    await page.getByRole('button', { name: 'Hư trong kho' }).click();
    await page.getByLabel('Mô tả thêm (không bắt buộc)').fill('Rách gấu áo');
    await page.screenshot({ path: path.join(artifacts, 'defect-form.png'), fullPage: true });
    await page.getByRole('button', { name: 'Ghi lỗi', exact: true }).click();
    await page.getByText('Đã ghi lỗi cho chiếc TH000051-0003. Tồn kho không đổi.').waitFor();
    assert.deepEqual(calls.find((c) => c.endpoint === '/api/warehouse/defects' && c.method === 'POST')?.body, {
      serial: 'TH000051-0003',
      types: ['Rách', 'Bung chỉ', 'Thủng lỗ'],
      description: 'Rách gấu áo',
      source: 'WAREHOUSE',
      photoKeys: []
    });
    await page.getByText('Rách gấu áo').waitFor();
    // Sửa xong chiếc bị ố
    await page.getByRole('row', { name: /TH000051-0009/ }).getByRole('button', { name: 'Sửa xong' }).click();
    await page.getByRole('dialog', { name: 'Sửa xong TH000051-0009' }).getByRole('button', { name: 'Xác nhận' }).click();
    await page.getByText('TH000051-0009 đã sửa xong.').waitFor();
    // Bỏ hẳn chiếc rách: cần lý do
    await page.getByRole('row', { name: /TH000051-0003/ }).getByRole('button', { name: 'Bỏ hẳn' }).click();
    const discard = page.getByRole('dialog', { name: 'Bỏ hẳn TH000051-0003' });
    await discard.getByText('tồn kho giảm 1', { exact: false }).waitFor();
    assert.equal(await discard.getByRole('button', { name: 'Xác nhận' }).isDisabled(), true, 'lý do bắt buộc');
    await discard.getByLabel('Lý do').fill('Rách không sửa được');
    await discard.getByRole('button', { name: 'Xác nhận' }).click();
    await page.getByText('Đã bỏ TH000051-0003, tồn giảm 1.').waitFor();
    assert.ok(calls.some((c) => c.endpoint === '/api/warehouse/defects/8/discard' && c.body.note === 'Rách không sửa được'));
    await owner.context.close();
  }

  // Family: reports and marks fixed, but cannot discard or manage defect types.
  const family = await open('FAMILY_MEMBER');
  {
    const { page } = family;
    await page.getByText('Vết ố ở tay áo').waitFor();
    await page.getByRole('button', { name: 'Sửa xong' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Bỏ hẳn' }).count(), 0);
    await page.getByRole('textbox', { name: 'Mã tem hàng lỗi' }).fill('TH000051-0003');
    await page.getByRole('textbox', { name: 'Mã tem hàng lỗi' }).press('Enter');
    await page.getByRole('button', { name: 'Rách' }).waitFor();
    assert.equal(await page.getByLabel('Lỗi khác (chủ cửa hàng gõ thêm)').count(), 0, 'người nhà chỉ chọn lỗi có sẵn');
    await family.context.close();
  }
  console.log(`PASS: defects page (owner + family). Screenshots: ${artifacts}`);
} finally {
  await browser?.close();
  server.kill();
}
