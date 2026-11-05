// UI smoke test for Tồn kho / Kiểm kê / Báo cáo with a mocked API (the backend rules are tested in
// WarehouseInventoryTest and on MySQL). Checks the requests the pages send and what they show per role.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = await mkdtemp(path.join(tmpdir(), 'thors-inventory-'));
const baseURL = 'http://127.0.0.1:4179';

const row = (over) => ({
  detail_id: 6,
  product_id: 5,
  product_code: 'SP00005',
  product_name: 'Áo baby doll',
  category_id: 1,
  category_name: 'Áo',
  color: 'Trắng',
  size: 'M',
  barcode: 'TH000006',
  status: 'ACTIVE',
  stock_quantity: 40,
  assigned_quantity: 34,
  unassigned_quantity: 6,
  held_quantity: 3,
  available_quantity: 37,
  hold_shortage: 0,
  incoming_quantity: 10,
  min_stock_quantity: null,
  stock_state: 'IN',
  locations: [{ location_id: 2, shelf_level_id: 4, label: 'B2', quantity: 30 }],
  days_without_sale: 2,
  never_sold: false,
  last_sale_at: '2026-11-03T08:00:00',
  ledger_gap: 0,
  ...over
});
const variants = [
  row({ unit_cost: 85000, stock_value: 3400000, valued_quantity: 40, unvalued_quantity: 0 }),
  row({
    detail_id: 3,
    product_id: 3,
    product_code: 'SP00003',
    product_name: 'Áo baby doll',
    color: 'Trắng',
    size: 'M',
    barcode: null,
    stock_quantity: 0,
    assigned_quantity: 0,
    unassigned_quantity: 0,
    held_quantity: 0,
    available_quantity: 0,
    incoming_quantity: 0,
    stock_state: 'OUT',
    locations: [],
    ledger_gap: 11,
    unit_cost: null,
    stock_value: null,
    unvalued_quantity: 0
  })
];

const server = spawn(process.execPath, [path.join(frontend, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4179'], {
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

  async function open(role, url) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const calls = [];
    await context.route('**/api/**', async (route) => {
      const request = route.request();
      const u = new URL(request.url());
      const endpoint = u.pathname;
      calls.push({ method: request.method(), endpoint, query: Object.fromEntries(u.searchParams), body: request.postDataJSON?.() });
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      const owner = role === 'OWNER';
      const strip = (v) => {
        if (owner) return v;
        const { unit_cost, stock_value, valued_quantity, unvalued_quantity, ...rest } = v; // eslint-disable-line no-unused-vars
        return rest;
      };
      if (endpoint === '/api/auth/me') return json({ id: role === 'OWNER' ? 2 : 7, role, fullName: 'Test', status: 'ACTIVE' });
      if (endpoint === '/api/auth/csrf') return json({ headerName: 'X-CSRF-TOKEN', token: 't' });
      if (endpoint === '/api/notifications/unread-count') return json({ count: 0 });
      if (endpoint === '/api/warehouse/snapshot')
        return json({
          variants: variants.map(({ detail_id, product_id, product_name, color, size, barcode, stock_quantity, assigned_quantity, unassigned_quantity }) => ({
            detail_id,
            product_id,
            product_name,
            color,
            size,
            barcode,
            stock_quantity,
            assigned_quantity,
            unassigned_quantity
          })),
          racks: [{ rack_id: 2, rack_code: 'B', is_active: 1 }],
          tiers: [{ shelf_level_id: 4, rack_id: 2, level_number: 2, status: 'AVAILABLE', is_active: 1 }],
          locations: [{ product_location_id: 2, detail_id: 6, shelf_level_id: 4, quantity: 30 }],
          images: []
        });
      if (endpoint === '/api/warehouse/documents' || endpoint === '/api/warehouse/notifications') return json([]);
      if (endpoint === '/api/warehouse/inventory') {
        const state = u.searchParams.get('state');
        const items = variants.filter((v) => !state || (state === 'out' ? v.stock_quantity === 0 : state === 'in' ? v.stock_quantity > 0 : true)).map(strip);
        return json({
          items,
          total: items.length,
          page: 0,
          size: 20,
          colors: ['Trắng'],
          sizes: ['M'],
          categories: [{ category_id: 1, category_name: 'Áo' }],
          metrics: {
            variants: 2,
            stock: 40,
            assigned: 34,
            unassigned: 6,
            held: 3,
            available: 37,
            incoming: 10,
            count_in: 1,
            count_out: 1,
            count_low: 0,
            count_unassigned: 1,
            count_noThreshold: 2,
            count_slow: 0,
            slow_unknown: 0,
            hold_shortage: 0,
            ledger_gaps: 1,
            missing_barcode: 1,
            ...(owner ? { stock_value: 3400000, unvalued_quantity: 0, unvalued_variants: 0 } : {})
          }
        });
      }
      if (endpoint === '/api/warehouse/inventory/6')
        return json({
          ...strip(variants[0]),
          location_rows: [{ product_location_id: 2, label: 'B2', quantity: 30, description: 'Kệ B', updated_at: '2026-11-01T08:00:00' }],
          holds: [{ order_id: 60, order_number: 'ORD-1', order_type: 'Online', order_status: 'PENDING_CONFIRMATION', order_item_id: 90, quantity: 3, reserved_quantity: 3 }],
          unheld_pending: [],
          incoming: [{ order_id: 5, order_code: 'PD00005', supplier: 'NCC A', ordered: 90, received: 80, remaining: 10 }]
        });
      if (endpoint === '/api/warehouse/inventory/6/threshold') return json({ detail_id: 6, min_stock_quantity: request.postDataJSON().min });
      if (endpoint === '/api/warehouse/history/6')
        return json({
          items:
            u.searchParams.get('kind') === 'move'
              ? [{ adjustment_id: 2, movement_type: 'MOVE', quantity_change: 0, movement_quantity: 4, adjusted_at: '2026-11-01T08:00:00', source_label: null, destination_label: 'B2', actor_name: 'Chủ' }]
              : [
                  {
                    adjustment_id: 1,
                    movement_type: 'RECEIPT',
                    quantity_change: 50,
                    balance_after: 40,
                    adjusted_at: '2026-11-01T07:00:00',
                    doc_kind: 'RECEIPT',
                    doc_id: 6,
                    doc_code: 'PN00006',
                    actor_name: 'Chủ',
                    reason: 'Nhập'
                  }
                ],
          total: 1,
          page: 0,
          size: 20,
          ledger_gap: 0
        });
      if (endpoint === '/api/warehouse/inventory/report')
        return json({
          from: u.searchParams.get('from'),
          to: u.searchParams.get('to'),
          cost_visible: owner,
          totals: { opening: 30, increase: 50, decrease: 40, closing: 40, ledger_gaps: 1, ...(owner ? { closing_value: 3400000, unvalued_quantity: 0 } : {}) },
          items: [
            {
              detail_id: 6,
              product_code: 'SP00005',
              product_name: 'Áo baby doll',
              color: 'Trắng',
              size: 'M',
              opening: 30,
              increase: 50,
              decrease: 40,
              closing: 40,
              in_RECEIPT: 50,
              in_RESTOCK: 0,
              in_ADJUSTMENT: 0,
              out_ORDER_OUT: 40,
              out_SUPPLIER_RETURN: 0,
              out_ADJUSTMENT: 0,
              ledger_gap: 0,
              ...(owner ? { unit_cost: 85000, closing_value: 3400000, unvalued_quantity: 0 } : {})
            }
          ]
        });
      if (endpoint === '/api/warehouse/counts' && request.method() === 'GET') return json([]);
      if (endpoint === '/api/warehouse/counts' && request.method() === 'POST')
        return json({ count_id: 1, code: 'KK00001', status: 'DRAFT', created_by: role === 'OWNER' ? 2 : 7, lines: [], history: [] });
      if (endpoint === '/api/warehouse/counts/1/submit' || endpoint === '/api/warehouse/counts/1/confirm')
        return json({ count_id: 1, status: endpoint.endsWith('submit') ? 'PENDING_CONFIRMATION' : 'CONFIRMED', lines: [], history: [], warnings: [] });
      if (endpoint === '/api/warehouse/counts/1')
        return json({ count_id: 1, code: 'KK00001', status: 'PENDING_CONFIRMATION', created_by: 7, creator_name: 'Người nhà', counted_at: '2026-11-05T08:00:00', lines: [], history: [] });
      throw new Error(`Unexpected API call: ${request.method()} ${endpoint}`);
    });
    const page = await context.newPage();
    await page.goto(`${baseURL}${url}`);
    return { context, page, calls };
  }

  // Owner: metrics, cards filter through the backend, detail tabs, threshold, links.
  const owner = await open('OWNER', '/warehouse/inventory');
  const { page, calls } = owner;
  await page.getByRole('heading', { name: 'Tồn kho', exact: true }).waitFor();
  await page.getByText('3.400.000', { exact: false }).first().waitFor();
  const filteredRequest = page.waitForRequest((r) => r.url().includes('/api/warehouse/inventory?') && r.url().includes('state=out'));
  await page.getByRole('button', { name: 'Lọc: Hết hàng' }).click();
  await page.waitForURL(/state=out/);
  await filteredRequest; // card filters on the backend
  await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
  await page.getByText('SP00005 · #6', { exact: false }).click(); // same name as #3: identified by code
  await page.waitForURL(/detail=6/);
  const detail = page.getByRole('dialog');
  await detail.getByText('Giá vốn bình quân', { exact: false }).waitFor();
  await detail.getByLabel('Ngưỡng tồn tối thiểu').fill('0');
  await detail.getByRole('button', { name: 'Lưu ngưỡng', exact: true }).click();
  await page.waitForFunction(() => true);
  await delay(300);
  assert.deepEqual(calls.find((c) => c.endpoint === '/api/warehouse/inventory/6/threshold')?.body, { min: 0 }, 'threshold 0 is sent as 0, not cleared');
  await detail.getByRole('tab', { name: /Đơn giữ/ }).click();
  await detail.getByText('ORD-1').waitFor();
  await detail.getByText('PD00005').waitFor();
  await detail.getByRole('tab', { name: 'Lịch sử biến động tồn kho' }).click();
  await detail.getByRole('link', { name: 'PN00006' }).waitFor();
  assert.equal(await detail.getByRole('link', { name: 'PN00006' }).getAttribute('href'), '/warehouse/receipts?id=6');
  await detail.getByRole('tab', { name: 'Lịch sử chuyển vị trí' }).click();
  await detail.getByRole('cell', { name: 'B2', exact: true }).waitFor();
  assert.ok(calls.some((c) => c.endpoint === '/api/warehouse/history/6' && c.query.kind === 'move'));
  await page.screenshot({ path: path.join(artifacts, 'inventory-detail.png'), fullPage: true });
  await detail.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.waitForURL((u) => !u.search.includes('detail='));

  // Excel export asks the backend for every filtered row.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất Excel', exact: true }).click();
  assert.match((await download).suggestedFilename(), /^THORS_Ton_Kho_.*\.xlsx$/);
  assert.ok(calls.some((c) => c.endpoint === '/api/warehouse/inventory' && c.query.all === 'true'), 'export uses all=true');

  // Report shows value for the owner.
  await page.goto(`${baseURL}/warehouse/report`);
  await page.getByRole('heading', { name: 'Báo cáo tồn kho', exact: true }).waitFor();
  await page.getByText('Giá trị tồn cuối kỳ').waitFor();
  await page.getByRole('columnheader', { name: 'Giá vốn BQ' }).waitFor();
  await page.screenshot({ path: path.join(artifacts, 'report-owner.png'), fullPage: true });

  // Owner count: prefilled from the inventory link, confirms directly (no "Gửi xác nhận").
  await page.goto(`${baseURL}/warehouse/counts?variant=6&new=1`);
  const form = page.getByRole('dialog', { name: 'Lập phiếu kiểm kê' });
  await form.getByLabel('Thực đếm Áo baby doll · Trắng · M B2').fill('28');
  await form.getByLabel('Thực đếm Áo baby doll · Trắng · M Chưa xếp vị trí').fill('6');
  assert.equal(await form.getByRole('button', { name: 'Xác nhận kiểm kê' }).isDisabled(), true, 'difference needs a reason');
  await form.getByLabel('Lý do Áo baby doll · Trắng · M B2').click();
  await page.getByRole('option', { name: 'Hàng hư hỏng' }).click();
  assert.equal(await form.getByRole('button', { name: 'Gửi xác nhận' }).count(), 0, 'owner never sees Gửi xác nhận');
  await form.getByRole('button', { name: 'Xác nhận kiểm kê' }).click();
  await delay(500);
  const created = calls.find((c) => c.endpoint === '/api/warehouse/counts' && c.method === 'POST').body;
  assert.deepEqual(
    created.lines.map((l) => [l.locationId, l.counted, l.reason]),
    [
      [2, 28, 'DAMAGED'],
      [null, 6, null]
    ]
  );
  assert.ok(calls.some((c) => c.endpoint === '/api/warehouse/counts/1/confirm'));
  await owner.context.close();

  // Family: no cost anywhere, submits counts.
  const family = await open('FAMILY_MEMBER', '/warehouse/inventory');
  await family.page.getByRole('heading', { name: 'Tồn kho', exact: true }).waitFor();
  assert.equal(await family.page.getByText('Giá trị tồn kho').count(), 0);
  assert.equal(await family.page.getByRole('button', { name: /^Tạo mã/ }).count(), 0);
  await family.page.goto(`${baseURL}/warehouse/report`);
  await family.page.getByText('Giá vốn và giá trị tồn chỉ hiển thị cho chủ cửa hàng.').waitFor();
  assert.equal(await family.page.getByRole('columnheader', { name: 'Giá vốn BQ' }).count(), 0);
  await family.page.goto(`${baseURL}/warehouse/counts?variant=6&new=1`);
  const famForm = family.page.getByRole('dialog', { name: 'Lập phiếu kiểm kê' });
  await famForm.getByLabel('Thực đếm Áo baby doll · Trắng · M B2').fill('30');
  await famForm.getByLabel('Thực đếm Áo baby doll · Trắng · M Chưa xếp vị trí').fill('6');
  assert.equal(await famForm.getByRole('button', { name: 'Xác nhận kiểm kê' }).count(), 0);
  await famForm.getByRole('button', { name: 'Gửi xác nhận' }).click();
  await delay(500);
  assert.ok(family.calls.some((c) => c.endpoint === '/api/warehouse/counts/1/submit'));
  assert.ok(!family.calls.some((c) => c.endpoint.endsWith('/confirm')));
  await family.page.screenshot({ path: path.join(artifacts, 'family-count.png'), fullPage: true });
  await family.context.close();
  console.log(`PASS: inventory metrics/filters/detail/threshold/stock card/export, report per role, counts per role. Screenshots: ${artifacts}`);
} finally {
  await browser?.close();
  server.kill();
}
