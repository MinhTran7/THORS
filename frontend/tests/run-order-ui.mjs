// UI smoke test of the purchase-order screens against a mocked API (Vite dev server + Chromium).
// No backend and no database are used; the mock only records what the UI sends.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = process.env.ORDER_TEST_ARTIFACTS || (await mkdtemp(path.join(tmpdir(), 'thors-order-')));
await mkdir(artifacts, { recursive: true });
const baseURL = 'http://127.0.0.1:4179';

const variants = [
  { detail_id: 1, product_id: 10, product_name: 'Áo thun', color: 'Đen', size: 'M', stock_quantity: 60, assigned_quantity: 50, unassigned_quantity: 10, status: 'ACTIVE' },
  { detail_id: 2, product_id: 10, product_name: 'Áo thun', color: 'Đen', size: 'L', stock_quantity: 0, assigned_quantity: 0, unassigned_quantity: 0, status: 'ACTIVE' },
  { detail_id: 3, product_id: 11, product_name: 'Quần jean', color: 'Xanh', size: '30', stock_quantity: 5, assigned_quantity: 0, unassigned_quantity: 5, status: 'ACTIVE' }
];
const po = {
  receipt_id: 7,
  receipt_type: 'PURCHASE_ORDER',
  manufacturer_name: 'Xưởng B',
  status: 'CONFIRMED',
  created_by: 1,
  creator_name: 'Chủ',
  receipt_date: '2026-11-01T09:00:00',
  total_amount: 5000000,
  items: [{ receipt_item_id: 70, receipt_id: 7, detail_id: 1, quantity: 100, unit_price: 50000, handled_quantity: 60, product_name: 'Áo thun', color: 'Đen', size: 'M' }]
};
const receipt = {
  receipt_id: 8,
  receipt_type: 'RECEIPT',
  source_receipt_id: 7,
  manufacturer_name: 'Xưởng B',
  status: 'CONFIRMED',
  created_by: 2,
  creator_name: 'Người nhà',
  receipt_date: '2026-11-02T09:00:00',
  total_amount: 3000000,
  items: [{ receipt_item_id: 80, receipt_id: 8, detail_id: 1, quantity: 60, unit_price: 50000, handled_quantity: 0, reserved_quantity: 15, source_receipt_item_id: 70, product_name: 'Áo thun', color: 'Đen', size: 'M' }]
};
// Supplier returns on receipt PN00008: one approved (waiting for dispatch), one family draft.
const returnLine = { detail_id: 1, unit_price: 50000, source_receipt_item_id: 80, handled_quantity: 0, reserved_quantity: 0, product_name: 'Áo thun', color: 'Đen', size: 'M' };
const approvedReturn = {
  receipt_id: 12, receipt_type: 'SUPPLIER_RETURN', source_receipt_id: 8, manufacturer_name: 'Xưởng B', status: 'APPROVED', created_by: 1,
  creator_name: 'Chủ', receipt_date: '2026-11-03T09:00:00', note: 'Lỗi may', confirmer_name: 'Chủ', confirmed_at: '2026-11-03T10:00:00',
  total_amount: 750000, items: [{ ...returnLine, receipt_item_id: 120, receipt_id: 12, quantity: 15 }]
};
const familyReturn = {
  ...approvedReturn, receipt_id: 13, status: 'DRAFT', created_by: 2, creator_name: 'Người nhà', note: 'Hàng lỗi', confirmer_name: null,
  confirmed_at: null, total_amount: 150000, items: [{ ...returnLine, receipt_item_id: 130, receipt_id: 13, quantity: 3 }]
};
// Dispatched return: 5 x 50.000; 100.000 refunded, 2 units (100.000) agreed for exchange, none received yet.
const dispatchedReturn = {
  ...approvedReturn, receipt_id: 14, status: 'CONFIRMED', dispatched_at: '2026-11-04T08:00:00', total_amount: 250000,
  refund_amount: 100000, debt_offset_amount: 0, credit_hold_amount: 0, exchange_amount: 100000, settled_amount: 200000,
  unsettled_amount: 50000, settlement_status: 'PARTIAL',
  items: [{ ...returnLine, receipt_item_id: 140, receipt_id: 14, quantity: 5, exchanged_quantity: 2, handled_quantity: 0 }]
};
// Receipt confirmed before payment tracking: what was paid is unknown until declared.
const oldReceipt = { ...receipt, receipt_id: 15, source_type: 'PURCHASE_ORDER', debt_amount: null, paid_amount: 0, offset_amount: 0,
  items: [{ ...receipt.items[0], receipt_item_id: 150, receipt_id: 15, quantity: 10 }], total_amount: 500000 };
const debtOf = { 8: { value: 3000000, paid_before_tracking: 0, paid_amount: 0, offset_amount: 0, debt_amount: 3000000 },
  15: { value: 500000, paid_before_tracking: null, paid_amount: 0, offset_amount: 0, debt_amount: null } };
const settlementsOf = (id) => ({
  entries: id === 14
    ? [{ settlement_id: 1, settlement_type: 'REFUND', return_id: 14, amount: 100000, payment_method: 'CASH', transaction_date: '2026-11-04',
        created_at: '2026-11-04T09:00:00', creator_name: 'Chủ' }]
    : [],
  supplier_credit: 40000,
  ...(debtOf[id] ? { debt: debtOf[id] } : {})
});
let basisBody;
const settlementPosts = [];
const snapshot = {
  variants,
  racks: [{ rack_id: 1, rack_code: 'A' }],
  tiers: [{ shelf_level_id: 5, rack_id: 1, level_number: 2 }],
  locations: [{ product_location_id: 31, detail_id: 1, shelf_level_id: 5, quantity: 50 }],
  images: []
};
const orderRow = {
  receipt_id: 7, code: 'PD00007', manufacturer_name: 'Xưởng B', receipt_date: po.receipt_date, status: 'CONFIRMED', creator_name: 'Chủ',
  total_amount: 5000000, ordered_quantity: 100, fulfilled_quantity: 60, received_quantity: 60, remaining_quantity: 40,
  closed_short_quantity: 0, over_quantity: 0, substitute_quantity: 0, returned_quantity: 0, pending_receipt_quantity: 0, progress: 'PARTIAL'
};
const orderDetail = {
  ...orderRow,
  items: [{ receipt_item_id: 70, detail_id: 1, product_name: 'Áo thun', color: 'Đen', size: 'M', ordered_quantity: 100, unit_price: 50000,
    received_exact: 60, received_substitute: 0, fulfilled_quantity: 60, over_quantity: 0, remaining_quantity: 40, closed_short_quantity: 0,
    returned_quantity: 0, pending_receipt_quantity: 0 }],
  related: [{ receipt_id: 8, receipt_type: 'RECEIPT', status: 'CONFIRMED', receipt_date: receipt.receipt_date, quantity: 60, amount: 3000000, creator_name: 'Người nhà' }],
  can_cancel_confirmed: false
};
// Draft purchase order (no receiving obligation yet) and a family member's draft receipt.
const draftPo = { ...po, receipt_id: 9, status: 'DRAFT', items: [{ ...po.items[0], receipt_item_id: 90, receipt_id: 9, handled_quantity: 0 }] };
const draftRow = { ...orderRow, receipt_id: 9, code: 'PD00009', status: 'DRAFT', progress: 'NOT_APPLICABLE', fulfilled_quantity: 0,
  received_quantity: 0, remaining_quantity: 0 };
const draftDetail = { ...draftRow, items: [{ ...orderDetail.items[0], receipt_item_id: 90, received_exact: 0, fulfilled_quantity: 0,
  remaining_quantity: 0 }], related: [], can_cancel_confirmed: false };
const draftReceipt = { ...receipt, receipt_id: 10, status: 'DRAFT', created_by: 2,
  items: [{ ...receipt.items[0], receipt_item_id: 100, receipt_id: 10, quantity: 20 }] };
const pickerRow = (v, extra = {}) => ({
  ...v, category_id: v.product_id === 11 ? 2 : 1, category_name: v.product_id === 11 ? 'Quần' : 'Áo', product_status: 'ACTIVE', variant_status: 'ACTIVE',
  ordered_from_supplier: false, last_order_price: null, on_order_supplier: 0, on_order_other: 0, other_suppliers: [], ...extra
});

const server = spawn(process.execPath, [path.join(frontend, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4179', '--strictPort'], {
  cwd: frontend,
  stdio: 'pipe'
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

let browser;
const calls = [];
const pageErrors = [];
let saveAttempts = 0;
let quickCreates = 0;
let quickSuccess = 0;
let catalogBody;
const categoryPosts = [];
const categories = [
  { categoryId: 1, categoryName: 'Áo', status: 'ACTIVE' },
  { categoryId: 2, categoryName: 'Quần', status: 'ACTIVE' }
];
let savedBody;
let dispatchBody;
try {
  let ready = false;
  for (let i = 0; i < 80 && !ready; i++) {
    try {
      ready = (await fetch(baseURL)).ok;
    } catch {
      await delay(250);
    }
  }
  assert.ok(ready, `Vite did not start: ${serverLog}`);
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox'],
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
  });

  async function open(role) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const endpoint = url.pathname;
      calls.push(`${request.method()} ${endpoint}${url.search}`);
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (endpoint === '/api/auth/me') return json({ id: role === 'OWNER' ? 1 : 2, role, fullName: 'THORS Test', status: 'ACTIVE' });
      if (endpoint === '/api/auth/csrf') return json({ headerName: 'X-CSRF-TOKEN', token: 't' });
      if (endpoint === '/api/warehouse/snapshot') return json(snapshot);
      if (endpoint === '/api/warehouse/documents' && request.method() === 'GET')
        return json([po, { ...receipt, source_type: 'PURCHASE_ORDER', paid_amount: 0, offset_amount: 0, debt_amount: 3000000 }, draftPo,
          draftReceipt, approvedReturn, familyReturn, dispatchedReturn, oldReceipt]);
      if (endpoint === '/api/warehouse/documents/15/payment-basis') {
        basisBody = request.postDataJSON();
        return json(debtOf[15]);
      }
      const settlementMatch = endpoint.match(/^\/api\/warehouse\/documents\/(\d+)\/settlements$/);
      if (settlementMatch) return json(settlementsOf(Number(settlementMatch[1])));
      if (endpoint === '/api/warehouse/settlements' && request.method() === 'POST') {
        settlementPosts.push(request.postDataJSON());
        return json({ settlement_id: 99 });
      }
      if (endpoint === '/api/warehouse/supplier-credits')
        return json([{ supplier_name: 'Xưởng B', payment_amount: 0, refund_amount: 100000, debt_offset_amount: 0, credit_use_amount: 0,
          credit_balance: 40000, debt_amount: 3000000, undeclared_receipts: 1 }]);
      if (endpoint === '/api/warehouse/documents/12/confirm') {
        dispatchBody = request.postDataJSON();
        return json({ receipt_id: 12 });
      }
      if (/^\/api\/warehouse\/documents\/\d+\/(confirm|submit|approve)$/.test(endpoint)) return json({ receipt_id: 9 });
      if (/^\/api\/warehouse\/documents\/\d+\/history$/.test(endpoint))
        return json({ actions: [{ action_type: 'DOCUMENT_CREATE', performed_at: '2026-11-03T09:00:00', actor_name: 'Chủ' }], movements: [] });
      if (endpoint === '/api/warehouse/documents' && request.method() === 'POST') {
        saveAttempts++;
        savedBody = request.postDataJSON();
        if (saveAttempts === 1) return json({ code: 'WAREHOUSE_CONFLICT', message: 'Lỗi mạng giả lập.' }, 409);
        return json({ receipt_id: 11, receipt_type: savedBody.type, status: 'DRAFT' });
      }
      if (endpoint === '/api/warehouse/notifications') return json([]);
      if (endpoint === '/api/warehouse/orders') return json({ items: [orderRow, draftRow], total: 2, page: 0, size: 20 });
      if (endpoint === '/api/warehouse/orders/7') return json(orderDetail);
      if (endpoint === '/api/warehouse/orders/9') return json(draftDetail);
      if (endpoint === '/api/warehouse/suppliers') return json([{ name: 'Xưởng B', confirmed_orders: 1, all_orders: 1 }]);
      if (endpoint === '/api/categories' && request.method() === 'POST') {
        const name = request.postDataJSON().categoryName;
        categoryPosts.push(name);
        categories.push({ categoryId: categories.length + 1, categoryName: name, status: 'ACTIVE' });
        await delay(150);
        return route.fulfill({ status: 201, body: '' });
      }
      if (endpoint === '/api/categories') return json(categories);
      if (endpoint === '/api/warehouse/order-variants') {
        const supplier = url.searchParams.get('supplier');
        const scope = url.searchParams.get('scope');
        const history = supplier === 'Xưởng B' ? [pickerRow(variants[0], { ordered_from_supplier: true, last_order_price: 50000, on_order_supplier: 40 })] : [];
        const items = scope === 'history' ? history : variants.map((v) => pickerRow(v, v.detail_id === 1 && supplier === 'Xưởng B' ? { on_order_supplier: 40 } : {}));
        return json({ items, total: items.length, page: 0, size: 10, supplier_has_history: history.length > 0 });
      }
      if (endpoint === '/api/warehouse/catalog/similar') return json([]);
      if (endpoint === '/api/warehouse/catalog/products') {
        quickCreates++;
        catalogBody = request.postDataJSON();
        if (quickCreates === 1) return json({ code: 'SERVER', message: 'Lỗi máy chủ giả lập.' }, 500);
        quickSuccess++;
        const created = catalogBody.variants.map((x, i) => ({ detail_id: 50 + i, product_id: 20, product_name: catalogBody.productName,
          color: x.color, size: x.size, sale_price: x.salePrice, stock_quantity: 0, online_sales_enabled: 0, already_existed: false }));
        created.forEach((v) => variants.push({ ...v, assigned_quantity: 0, unassigned_quantity: 0, status: 'ACTIVE' }));
        return json({ product_id: 20, product_name: catalogBody.productName, variants: created });
      }
      if (request.method() === 'GET') return json({});
      throw new Error(`Unexpected API call: ${request.method()} ${endpoint}`);
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${baseURL}/warehouse/orders`);
    await page.getByRole('heading', { name: 'Đặt hàng nhập', exact: true }).waitFor();
    return { context, page };
  }

  // Owner: list shows document status and receiving progress separately.
  const { context, page } = await open('OWNER');
  await page.getByText('PD00007', { exact: true }).waitFor();
  await page.getByText('Nhận một phần', { exact: true }).first().waitFor();
  assert.ok(calls.some((c) => c.startsWith('GET /api/warehouse/orders?')), 'list is loaded from backend');

  // Detail: ordered / received / remaining per variant + related receipt.
  await page.getByText('PD00007', { exact: true }).click();
  await page.getByRole('cell', { name: '40', exact: true }).waitFor();
  await page.getByRole('button', { name: 'PN00008', exact: true }).waitFor();
  // Receipts are created on "Nhập hàng" only; the order detail just links to related documents (view only).
  for (const name of ['Lập đợt nhập', 'Lập phiếu trả'])
    assert.equal(await page.getByRole('link', { name, exact: true }).count() + await page.getByRole('button', { name, exact: true }).count(), 0, name);
  await page.screenshot({ path: path.join(artifacts, 'order-detail.png'), fullPage: true });
  await page.getByRole('button', { name: 'PN00008', exact: true }).click();
  const linked = page.getByRole('dialog').last();
  await linked.getByText('PN00008 · Phiếu nhập hàng', { exact: false }).waitFor();
  for (const name of ['Lập phiếu trả', 'Trả hàng nhà cung cấp', 'Xác nhận nhập hàng', 'Sửa nháp', 'Hủy phiếu', 'Gửi xác nhận'])
    assert.equal(await linked.getByRole('button', { name, exact: true }).count(), 0, `linked receipt is view-only: ${name}`);
  await linked.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();

  // Draft order: no obligation yet -> "—" and "Chưa áp dụng"; owner confirms directly, no "Gửi xác nhận".
  await page.getByText('PD00009', { exact: true }).click();
  const draftDialog = page.getByRole('dialog');
  await draftDialog.getByText('Chưa áp dụng', { exact: true }).waitFor();
  await draftDialog.getByText(/còn thiếu —/).waitFor();
  assert.equal(await draftDialog.getByRole('cell', { name: '—', exact: true }).count() >= 1, true);
  const cells = await draftDialog.getByRole('row').nth(1).getByRole('cell').allInnerTexts();
  assert.equal(cells[4], '—', `"Còn thiếu" of a draft is "—", not 0 (row: ${cells.join(' | ')})`);
  assert.equal(await draftDialog.getByRole('button', { name: 'Gửi xác nhận', exact: true }).count(), 0);
  await draftDialog.getByRole('button', { name: 'Sao chép thành phiếu nháp', exact: true }).waitFor();
  await draftDialog.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true }).click();
  await page.getByRole('dialog', { name: 'Xác nhận đặt hàng PD00009' }).getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await page.getByText('Đã cập nhật trạng thái phiếu.', { exact: true }).waitFor();
  assert.ok(calls.includes('POST /api/warehouse/documents/9/confirm'), 'owner confirms the draft directly');
  assert.ok(!calls.some((c) => c.includes('/9/submit')));
  await page.keyboard.press('Escape');

  // Draft receipt from a family member: owner sees "Xác nhận nhập hàng", no "Gửi xác nhận".
  await page.goto(`${baseURL}/warehouse/receipts`);
  await page.getByText('PN00010', { exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận nhập hàng', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Gửi xác nhận', exact: true }).count(), 0);
  await page.keyboard.press('Escape');
  await page.goto(`${baseURL}/warehouse/orders`);
  await page.getByRole('heading', { name: 'Đặt hàng nhập', exact: true }).waitFor();

  // Create: supplier first.
  await page.getByRole('button', { name: 'Tạo phiếu đặt hàng', exact: true }).click();
  await page.getByText('Chọn nhà cung cấp để bắt đầu thêm hàng.').waitFor();
  await page.getByPlaceholder('Chọn hoặc nhập tên nhà cung cấp').fill('Xưởng B');
  await page.getByRole('button', { name: 'Dùng nhà cung cấp này', exact: true }).click();
  // History scope shows only the variant ordered from this supplier.
  await page.getByRole('checkbox', { name: 'Chọn Áo thun · Đen · M', exact: true }).waitFor();
  assert.equal(await page.getByRole('checkbox', { name: 'Chọn Quần jean · Xanh · 30', exact: true }).count(), 0);
  await page.getByRole('checkbox', { name: 'Chọn Áo thun · Đen · M', exact: true }).check();
  // Other products: selection must survive the scope switch.
  await page.getByRole('button', { name: 'Thêm sản phẩm khác', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Chọn Quần jean · Xanh · 30', exact: true }).check();
  await page.getByRole('button', { name: 'Thêm 2 biến thể đã chọn vào phiếu', exact: true }).click();
  await page.getByLabel('Đơn giá nhập Quần jean · Xanh · 30', { exact: true }).fill('70000');
  await page.getByLabel('Số lượng Áo thun · Đen · M', { exact: true }).fill('10');
  assert.equal(await page.getByLabel('Đơn giá nhập Áo thun · Đen · M', { exact: true }).inputValue(), '50000', 'last price from this supplier is prefilled');

  // Quick create: quantity/purchase price go to the order, expected sale price (optional) to the catalogue.
  await page.getByRole('button', { name: 'Tạo nhanh hàng mới', exact: true }).click();
  const quick = page.getByRole('dialog', { name: 'Tạo nhanh hàng mới' });
  await quick.getByText('Nhập thông tin hàng mới, số lượng đặt và giá nhập', { exact: false }).waitFor();
  await quick.getByRole('button', { name: 'Tạo và thêm vào phiếu', exact: true }).click();
  await quick.getByText('Nhập màu.', { exact: true }).waitFor();
  assert.equal(quickCreates, 0, 'invalid form never calls the catalogue API');
  await quick.getByLabel('Tên sản phẩm').fill('Áo len');

  // "+ Thêm danh mục": duplicate name refused locally; a new one is created only on "Lưu danh mục" and selected.
  await quick.getByRole('button', { name: '+ Thêm danh mục', exact: true }).click();
  await quick.getByLabel('Tên danh mục mới').fill(' áo ');
  await quick.getByRole('button', { name: 'Lưu danh mục', exact: true }).click();
  await quick.getByText(/Danh mục “Áo” đã có/).waitFor();
  assert.equal(categoryPosts.length, 0);
  await quick.getByLabel('Tên danh mục mới').fill('Áo   khoác');
  await quick.getByRole('button', { name: 'Lưu danh mục', exact: true }).dblclick();
  await quick.getByRole('combobox', { name: 'Danh mục' }).getByText('Áo khoác', { exact: true }).waitFor();
  assert.deepEqual(categoryPosts, ['Áo khoác'], 'category created once, with normalised spacing');
  assert.equal(await quick.getByLabel('Tên sản phẩm').inputValue(), 'Áo len', 'form data kept after adding a category');

  // Colour/size: suggestions from existing variants, free text allowed, spaces normalised.
  await quick.getByLabel('Màu dòng 1').click();
  await page.getByRole('option', { name: 'Đen', exact: true }).waitFor();
  await quick.getByLabel('Màu dòng 1').fill('  Nâu   kem ');
  await quick.getByLabel('Size dòng 1').click();
  await quick.getByLabel('Size dòng 1').fill('L');
  await quick.getByLabel('Tên sản phẩm').click();
  assert.equal(await quick.getByLabel('Màu dòng 1').inputValue(), 'Nâu kem');

  // Quantity: −/+ step 1, never below 1; only positive integers.
  const qty = quick.getByLabel('Số lượng đặt dòng 1', { exact: true });
  assert.equal(await qty.inputValue(), '1');
  assert.equal(await quick.getByRole('button', { name: 'Giảm Số lượng đặt dòng 1' }).isDisabled(), true);
  await quick.getByRole('button', { name: 'Tăng Số lượng đặt dòng 1' }).click();
  assert.equal(await qty.inputValue(), '2');
  for (const bad of ['0', '-3', '1.5']) {
    await qty.fill(bad);
    await quick.getByText('Số nguyên dương (1–1.000.000).', { exact: true }).first().waitFor();
  }
  await qty.fill('9');
  await quick.getByRole('button', { name: 'Tăng Số lượng đặt dòng 1' }).click();
  assert.equal(await qty.inputValue(), '10');

  // Purchase price: required (empty is not 0); pasted "80.000đ" keeps its value; −/+ step 1.000đ, never negative.
  const buy = quick.getByLabel('Đơn giá nhập dòng 1', { exact: true });
  await quick.getByText('Nhập đơn giá nhập.', { exact: true }).waitFor();
  await buy.fill('1.5');
  await quick.getByText('Số tiền VNĐ không hợp lệ.', { exact: true }).waitFor();
  await buy.fill('80.000đ');
  await quick.getByLabel('Tên sản phẩm').click();
  assert.equal(await buy.inputValue(), '80.000');
  await quick.getByRole('button', { name: 'Tăng Đơn giá nhập dòng 1' }).click();
  assert.equal(await buy.inputValue(), '81.000');
  await quick.getByRole('button', { name: 'Giảm Đơn giá nhập dòng 1' }).click();
  assert.equal(await buy.inputValue(), '80.000');

  // Sale price: optional (empty is not 0, no error); never copied from the purchase price.
  const sell = quick.getByLabel('Giá bán dòng 1', { exact: true });
  assert.equal(await sell.inputValue(), '');
  assert.equal(await quick.getByText('Nhập giá bán.', { exact: true }).count(), 0);
  await sell.fill('120000');
  await quick.getByLabel('Tên sản phẩm').click();
  assert.equal(await sell.inputValue(), '120.000');
  await quick.getByText(/800\.000/).first().waitFor();

  // Second variant: duplicate flagged; empty sale price is allowed.
  await quick.getByRole('button', { name: 'Thêm màu/size', exact: true }).click();
  await quick.getByLabel('Size dòng 2').fill('l');
  await quick.getByText('Trùng màu/size trong form.', { exact: true }).first().waitFor();
  await quick.getByLabel('Size dòng 2').fill('XL');
  await quick.getByLabel('Số lượng đặt dòng 2', { exact: true }).fill('5');
  await quick.getByLabel('Đơn giá nhập dòng 2', { exact: true }).fill('90000');
  await quick.getByLabel('Giá bán dòng 2', { exact: true }).fill('130000');
  await quick.getByText(/450\.000/).first().waitFor();
  await quick.getByText(/Tổng tiền nhập:\s*1\.250\.000/).waitFor();
  await quick.getByText(/Tổng số lượng:\s*15/).waitFor();

  // API error keeps the data; the next double click creates exactly once.
  await quick.getByRole('button', { name: 'Tạo và thêm vào phiếu', exact: true }).click();
  await quick.getByText('Lỗi máy chủ giả lập.', { exact: true }).waitFor();
  assert.equal(await quick.getByLabel('Số lượng đặt dòng 2', { exact: true }).inputValue(), '5');
  await quick.screenshot({ path: path.join(artifacts, 'quick-create.png') });
  await quick.getByRole('button', { name: 'Tạo và thêm vào phiếu', exact: true }).dblclick();
  await quick.waitFor({ state: 'detached' });
  assert.equal(quickSuccess, 1, 'double click creates the product once');
  assert.equal(catalogBody.categoryId, 3);
  assert.deepEqual(
    catalogBody.variants.map((x) => [x.color, x.size, x.salePrice]),
    [
      ['Nâu kem', 'L', 120000],
      ['Nâu kem', 'XL', 130000]
    ],
    'catalogue receives only the sale price'
  );
  assert.ok(catalogBody.variants.every((x) => !('unitPrice' in x) && !('quantity' in x)));
  await page.getByText('Mới tạo trong catalog', { exact: true }).first().waitFor();
  assert.equal(await page.getByLabel('Số lượng Áo len · Nâu kem · L', { exact: true }).inputValue(), '10');
  assert.equal(await page.getByLabel('Đơn giá nhập Áo len · Nâu kem · L', { exact: true }).inputValue(), '80000');
  assert.equal(await page.getByLabel('Số lượng Áo len · Nâu kem · XL', { exact: true }).inputValue(), '5');
  assert.equal(await page.getByLabel('Đơn giá nhập Áo len · Nâu kem · XL', { exact: true }).inputValue(), '90000');
  await page.getByText(/Tổng số lượng: 26/).waitFor(); // 10 + 1 picked lines + 15 new

  // Changing supplier with lines asks instead of clearing silently.
  await page.getByPlaceholder('Chọn hoặc nhập tên nhà cung cấp').fill('Công ty C');
  await page.getByRole('button', { name: 'Đổi nhà cung cấp', exact: true }).click();
  await page.getByText('Đổi nhà cung cấp?', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Giữ nhà cung cấp cũ', exact: true }).click();

  // First save fails: quick-created item is kept; retry does not create it again.
  await page.getByRole('button', { name: 'Lưu phiếu nháp', exact: true }).click();
  await page.getByText(/Lỗi mạng giả lập\. Hàng vừa tạo nhanh vẫn được giữ/).waitFor();
  await page.screenshot({ path: path.join(artifacts, 'order-form.png'), fullPage: true });
  await page.getByRole('button', { name: 'Lưu phiếu nháp', exact: true }).click();
  await page.getByText('Đã lưu phiếu đặt nháp.', { exact: true }).waitFor();
  assert.equal(quickSuccess, 1, 'retrying the order save does not re-create catalogue items');
  assert.equal(saveAttempts, 2);
  assert.equal(savedBody.manufacturer, 'Xưởng B');
  assert.deepEqual(
    savedBody.items.map((i) => [i.detailId, i.quantity, i.unitPrice]),
    [
      [1, 10, 50000],
      [3, 1, 70000],
      [50, 10, 80000],
      [51, 5, 90000]
    ]
  );
  // Full receipt flow from the "Nhập hàng" page: choose a confirmed order, outstanding quantity is prefilled.
  await page.goto(`${baseURL}/warehouse/receipts`);
  await page.getByRole('button', { name: 'Tạo phiếu nhập hàng', exact: true }).click();
  await page.getByRole('combobox', { name: /Phiếu nguồn/ }).click();
  await page.getByRole('option', { name: /PD00007/ }).click();
  assert.equal(await page.getByLabel('Số lượng Áo thun · Đen · M', { exact: true }).inputValue(), '40');
  await page.getByLabel('Số lượng Áo thun · Đen · M', { exact: true }).fill('25');
  await page.getByRole('button', { name: 'Lưu phiếu nháp', exact: true }).click();
  await page.getByText('Đã lưu phiếu nháp.', { exact: true }).waitFor();
  assert.deepEqual([savedBody.type, savedBody.sourceId, savedBody.items[0].quantity, savedBody.items[0].sourceItemId], ['RECEIPT', 7, 25, 70]);

  // Supplier return started from the confirmed receipt's detail: source prefilled, only its lines.
  await page.getByText('PN00008', { exact: true }).click();
  await page.getByRole('button', { name: 'Trả hàng nhà cung cấp', exact: true }).click();
  const returnForm = page.getByRole('dialog', { name: 'Tạo phiếu trả' });
  await returnForm.getByText('Kho xuất trả:', { exact: false }).waitFor();
  await returnForm.getByText('PN00008', { exact: true }).first().waitFor();
  for (const header of ['Đã nhập', 'Đã trả', 'Còn được trả', 'Số lượng trả', 'Đơn giá trả', 'Thành tiền'])
    await returnForm.getByRole('columnheader', { name: header, exact: true }).waitFor();
  assert.equal(await returnForm.getByText('Còn được nhập/trả').count(), 0);
  // 60 received, 15 only on an approved (not yet dispatched) return: still 60 returnable (Đã nhập 60 · Còn được trả 60).
  await returnForm.getByRole('cell', { name: '60', exact: true }).nth(1).waitFor();
  assert.equal(await returnForm.getByRole('cell', { name: '45', exact: true }).count(), 0, 'approved return does not reduce returnable');
  assert.equal(await returnForm.getByRole('button', { name: 'Thêm dòng', exact: true }).count(), 0, 'no free product lines');
  await returnForm.getByLabel('Số lượng Áo thun · Đen · M', { exact: true }).fill('5');
  await page.screenshot({ path: path.join(artifacts, 'return-form.png'), fullPage: true });
  await returnForm.getByRole('button', { name: 'Lưu phiếu nháp', exact: true }).click(); // draft may be saved before the reason
  await page.getByText('Đã lưu phiếu nháp.', { exact: true }).waitFor();
  assert.deepEqual(
    [savedBody.type, savedBody.sourceId, savedBody.items[0].quantity, savedBody.items[0].sourceItemId, savedBody.items[0].unitPrice],
    ['SUPPLIER_RETURN', 8, 5, 80, 50000]
  );
  await page.keyboard.press('Escape');

  // "Trả hàng nhà cung cấp" list: naming, search by receipt code, metrics, status labels.
  await page.goto(`${baseURL}/warehouse/returns`);
  await page.getByRole('heading', { name: 'Trả hàng nhà cung cấp', exact: true }).waitFor();
  await page.getByText('Số lượng đã xuất trả', { exact: true }).waitFor();
  await page.getByText('Tổng số sản phẩm đã trả nhà cung cấp', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Tạo phiếu trả', exact: true }).click();
  await page.getByText('Chọn phiếu nhập để xem các sản phẩm có thể trả', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await page.getByRole('textbox', { name: 'Tìm chứng từ' }).fill('PN00008');
  await page.getByText('PT00012', { exact: true }).waitFor();
  await page.getByText('Chờ xuất trả', { exact: true }).first().waitFor();

  // Approved return: dispatch dialog shows pick locations; allocation is editable and validated.
  await page.getByText('PT00012', { exact: true }).click();
  await page.getByText('Lịch sử thao tác', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Xác nhận xuất trả', exact: true }).click();
  const dispatch = page.getByRole('dialog', { name: 'Xác nhận xuất trả PT00012' });
  const unplaced = dispatch.getByLabel('Số lấy tại Chưa xếp vị trí · Áo thun · Đen · M', { exact: true });
  const shelf = dispatch.getByLabel('Số lấy tại A2 · Áo thun · Đen · M', { exact: true });
  assert.deepEqual([await unplaced.inputValue(), await shelf.inputValue()], ['10', '5'], 'suggested allocation is shown, not applied silently');
  await page.screenshot({ path: path.join(artifacts, 'return-dispatch.png'), fullPage: true });
  await shelf.fill('3');
  await dispatch.getByText('Đã phân bổ 13 / cần lấy 15.', { exact: true }).waitFor();
  assert.equal(await dispatch.getByRole('button', { name: 'Xác nhận xuất trả', exact: true }).isDisabled(), true);
  await unplaced.fill('0');
  await shelf.fill('15');
  await dispatch.getByRole('button', { name: 'Xác nhận xuất trả', exact: true }).click();
  await page.getByText('Đã xuất trả hàng cho nhà cung cấp.', { exact: true }).waitFor();
  assert.deepEqual(dispatchBody, { picks: [{ itemId: 120, locationId: 31, quantity: 15 }] });
  await page.keyboard.press('Escape');

  // Dispatched return: money status is separate from the document status; refund in several steps, exchange.
  await page.getByRole('textbox', { name: 'Tìm chứng từ' }).fill('PT00014');
  await page.getByText('NCC trả một phần', { exact: true }).waitFor();
  await page.getByText('Đã nhận 200.000 ₫ · Còn 50.000 ₫', { exact: true }).waitFor();
  await page.getByText('PT00014', { exact: true }).click();
  const returned = page.getByRole('dialog', { name: /PT00014/ });
  await returned.getByText('Đã xuất trả', { exact: true }).waitFor();
  assert.equal(await returned.getByText(/chưa được theo dõi/).count(), 0, 'no "not tracked" notice once settlements work');
  await returned.getByText('Tiền mặt', { exact: true }).waitFor(); // earlier refund entry
  await returned.getByRole('button', { name: 'Nhận hoàn tiền', exact: true }).click();
  const refund = page.getByRole('dialog', { name: 'Nhận hoàn tiền · PT00014' });
  const amount = refund.getByRole('spinbutton');
  assert.equal(await amount.inputValue(), '50000', 'defaults to the unsettled part');
  await amount.fill('200000');
  assert.equal(await refund.getByRole('button', { name: 'Ghi nhận', exact: true }).isDisabled(), true, 'cannot exceed unsettled');
  await amount.fill('30000');
  await refund.getByRole('combobox', { name: 'Hình thức' }).click();
  await page.getByRole('option', { name: 'Chuyển khoản', exact: true }).click();
  await refund.getByRole('button', { name: 'Ghi nhận', exact: true }).click();
  await page.getByText('Đã ghi nhận: nhận hoàn tiền.', { exact: true }).waitFor();
  assert.deepEqual(
    [settlementPosts[0].type, settlementPosts[0].returnId, settlementPosts[0].amount, settlementPosts[0].method],
    ['REFUND', 14, 30000, 'BANK_TRANSFER']
  );
  assert.match(settlementPosts[0].date, /^\d{4}-\d{2}-\d{2}$/, 'transaction date is sent');
  assert.match(settlementPosts[0].requestKey, /^[a-f0-9-]{36}$/);
  await returned.getByText(/nhà cung cấp đổi 2, đã nhập kho 0/).waitFor();
  await returned.getByRole('button', { name: 'Đổi hàng', exact: true }).click();
  const exchange = page.getByRole('dialog', { name: 'Đổi hàng · PT00014' });
  await exchange.getByText(/Tồn kho chưa thay đổi/).waitFor();
  await exchange.getByLabel('Số lượng nhà cung cấp sẽ đổi', { exact: true }).fill('1');
  await exchange.getByText('Giá trị hàng đổi: 50.000 ₫').waitFor();
  await exchange.getByRole('button', { name: 'Ghi nhận', exact: true }).click();
  await page.getByText('Đã ghi nhận: đổi hàng.', { exact: true }).waitFor();
  assert.deepEqual(
    [settlementPosts[1].type, settlementPosts[1].itemId, settlementPosts[1].quantity, settlementPosts[1].amount],
    ['EXCHANGE', 140, 1, null]
  );
  await page.keyboard.press('Escape');

  // Replacement goods come in only through a receipt whose source is the return.
  await page.goto(`${baseURL}/warehouse/receipts`);
  await page.getByRole('button', { name: 'Tạo phiếu nhập hàng', exact: true }).click();
  await page.getByRole('combobox', { name: /Phiếu nguồn/ }).click();
  await page.getByRole('option', { name: /PT00014/ }).click();
  assert.equal(await page.getByLabel('Số lượng Áo thun · Đen · M', { exact: true }).inputValue(), '2', 'agreed exchange quantity is prefilled');
  await page.getByRole('button', { name: 'Lưu phiếu nháp', exact: true }).click();
  await page.getByText('Đã lưu phiếu nháp.', { exact: true }).waitFor();
  assert.deepEqual([savedBody.type, savedBody.sourceId, savedBody.items[0].sourceItemId, savedBody.items[0].quantity], ['RECEIPT', 14, 140, 2]);

  // Held credit is used on a confirmed receipt of the same supplier.
  await page.getByText('PN00008', { exact: true }).click();
  await page.getByText('Còn nợ:', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Thanh toán', exact: true }).click();
  const pay = page.getByRole('dialog', { name: 'Thanh toán · PN00008' });
  assert.equal(await pay.getByRole('spinbutton').inputValue(), '3000000', 'defaults to the remaining debt');
  await pay.getByRole('spinbutton').fill('1000000');
  await pay.getByRole('button', { name: 'Ghi nhận', exact: true }).click();
  await page.getByText('Đã ghi nhận: thanh toán.', { exact: true }).waitFor();
  assert.deepEqual([settlementPosts[2].type, settlementPosts[2].targetReceiptId, settlementPosts[2].amount, settlementPosts[2].method],
    ['PAYMENT', 8, 1000000, 'CASH']);
  await page.getByRole('button', { name: 'Dùng tiền đối trừ', exact: true }).click();
  const use = page.getByRole('dialog', { name: 'Dùng tiền đối trừ · PN00008' });
  assert.equal(await use.getByRole('spinbutton').inputValue(), '40000');
  await use.getByRole('button', { name: 'Ghi nhận', exact: true }).click();
  await page.getByText('Đã ghi nhận: dùng tiền đối trừ.', { exact: true }).waitFor();
  assert.deepEqual([settlementPosts[3].type, settlementPosts[3].targetReceiptId, settlementPosts[3].returnId], ['CREDIT_USE', 8, null]);
  await page.screenshot({ path: path.join(artifacts, 'receipt-credit.png'), fullPage: true });
  await page.keyboard.press('Escape');

  // Old receipt: debt unknown, no payment until the owner declares what had been paid.
  await page.getByText('PN00015', { exact: true }).click();
  await page.getByText('Còn nợ: Chưa xác định', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Thanh toán', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Khai báo số đã thanh toán trước', exact: true }).click();
  await page.getByLabel('Số đã thanh toán trước khi theo dõi (VNĐ)', { exact: true }).fill('200000');
  await page.getByRole('button', { name: 'Lưu khai báo', exact: true }).click();
  await page.getByText('Đã khai báo số đã thanh toán.', { exact: true }).waitFor();
  assert.deepEqual(basisBody, { paidBefore: 200000 });
  await page.keyboard.press('Escape');
  await page.goto(`${baseURL}/warehouse/suppliers`);
  await page.getByRole('columnheader', { name: 'Tiền đối trừ đang giữ', exact: true }).waitFor();
  await page.getByRole('cell', { name: '40.000 ₫', exact: true }).waitFor();
  await page.getByText('+ 1 phiếu nhập chưa khai báo', { exact: true }).waitFor();
  await context.close();

  // Family member: may view orders but not create them.
  const family = await open('FAMILY_MEMBER');
  await family.page.getByText('PD00007', { exact: true }).waitFor();
  assert.equal(await family.page.getByRole('button', { name: 'Tạo phiếu đặt hàng', exact: true }).count(), 0);
  // Family on a draft order: no confirm, no submit (purchase orders are owner-only).
  await family.page.getByText('PD00009', { exact: true }).click();
  await family.page.getByText('Chưa áp dụng', { exact: true }).last().waitFor();
  for (const name of ['Xác nhận đặt hàng', 'Gửi xác nhận', 'Sao chép thành phiếu nháp'])
    assert.equal(await family.page.getByRole('button', { name, exact: true }).count(), 0, name);
  await family.page.keyboard.press('Escape');
  // Family on their own draft receipt: "Gửi xác nhận" only, cannot confirm.
  await family.page.goto(`${baseURL}/warehouse/receipts`);
  await family.page.getByText('PN00010', { exact: true }).click();
  await family.page.getByRole('button', { name: 'Gửi xác nhận', exact: true }).waitFor();
  assert.equal(await family.page.getByRole('button', { name: 'Xác nhận nhập hàng', exact: true }).count(), 0);
  await family.page.keyboard.press('Escape');
  await family.page.getByRole('button', { name: 'Tạo phiếu nhập hàng', exact: true }).waitFor(); // family may draft receipts
  // Family: may draft supplier returns and send their own draft for approval, never approve/dispatch.
  await family.page.goto(`${baseURL}/warehouse/returns`);
  await family.page.getByRole('heading', { name: 'Trả hàng nhà cung cấp', exact: true }).waitFor();
  await family.page.getByRole('button', { name: 'Tạo phiếu trả', exact: true }).waitFor();
  await family.page.getByText('PT00013', { exact: true }).click();
  await family.page.getByRole('button', { name: 'Gửi duyệt', exact: true }).waitFor();
  for (const name of ['Xác nhận phiếu', 'Xác nhận và xuất trả', 'Duyệt phiếu', 'Xác nhận xuất trả', 'Gửi xác nhận'])
    assert.equal(await family.page.getByRole('button', { name, exact: true }).count(), 0, name);
  await family.page.keyboard.press('Escape');
  await family.page.getByText('PT00012', { exact: true }).click();
  assert.equal(await family.page.getByRole('button', { name: 'Xác nhận xuất trả', exact: true }).count(), 0);
  await family.page.keyboard.press('Escape');
  await family.page.getByText('PT00014', { exact: true }).click();
  await family.page.getByText('Còn chưa xử lý:', { exact: false }).waitFor(); // family sees the money status
  for (const name of ['Nhận hoàn tiền', 'Giảm công nợ', 'Giữ tiền đối trừ', 'Đổi hàng', 'Hủy bút toán'])
    assert.equal(await family.page.getByRole('button', { name, exact: true }).count(), 0, name);
  await family.context.close();

  assert.deepEqual(pageErrors, [], `Browser errors: ${pageErrors.join('\n')}`);
  console.log(`Purchase-order UI smoke test passed. Screenshots: ${artifacts}`);
} finally {
  await browser?.close();
  server.kill();
}
