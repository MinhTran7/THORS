import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import JsBarcode from 'jsbarcode';
import { validateLabelQuantities } from '../src/features/warehouse/barcodeLabels.js';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'thors-barcode-'));
const artifacts = process.env.BARCODE_TEST_ARTIFACTS || temporary;
await mkdir(artifacts, { recursive: true });
const baseURL = 'http://127.0.0.1:4178';
const variants = [
  {
    detail_id: 101,
    product_id: 10,
    product_name: 'Áo kiểm thử',
    color: 'Đen',
    size: 'M',
    barcode: 'TH000101',
    stock_quantity: 20,
    assigned_quantity: 12,
    unassigned_quantity: 8,
    status: 'ACTIVE'
  },
  {
    detail_id: 102,
    product_id: 10,
    product_name: 'Áo kiểm thử',
    color: 'Đen',
    size: 'L',
    barcode: null,
    stock_quantity: 15,
    assigned_quantity: 0,
    unassigned_quantity: 15,
    status: 'ACTIVE'
  }
];
assert.equal(validateLabelQuantities([variants[0]], { 101: 2 }), 2);
for (const quantity of [0, -1, 1.5, '', 5001]) assert.throws(() => validateLabelQuantities([variants[0]], { 101: quantity }));
assert.throws(() => validateLabelQuantities([variants[1]], { 102: 1 }));

// A real Code 128 image delivered through Chromium's fake camera: exercises the video decoder.
const encoded = {};
JsBarcode(encoded, 'TH000101', { format: 'CODE128' });
const bits = encoded.encodings.map((encoding) => encoding.data).join('');
const width = 1280;
const height = 720;
const frame = Buffer.alloc((width * height * 3) / 2, 128);
frame.fill(235, 0, width * height);
const left = Math.floor((width - bits.length * 3) / 2);
for (let bit = 0; bit < bits.length; bit++) {
  if (bits[bit] !== '1') continue;
  for (let y = 240; y < 440; y++) frame.fill(16, y * width + left + bit * 3, y * width + left + (bit + 1) * 3);
}
const videoFile = path.join(temporary, 'barcode.y4m');
await writeFile(videoFile, Buffer.concat([Buffer.from(`YUV4MPEG2 W${width} H${height} F10:1 Ip A1:1 C420jpeg\nFRAME\n`), frame]));

const server = spawn(process.execPath, [path.join(frontend, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4178'], {
  cwd: frontend,
  stdio: 'pipe'
});
let serverLog = '';
server.stdout.on('data', (data) => {
  serverLog += data;
});
server.stderr.on('data', (data) => {
  serverLog += data;
});
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      ready = (await fetch(baseURL)).ok;
    } catch {
      /* Wait for Vite. */
    }
    if (ready) break;
    await delay(250);
  }
  assert.ok(ready, `Vite did not start: ${serverLog}`);
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
    args: [
      ...JSON.parse(process.env.PLAYWRIGHT_EXTRA_ARGS || '[]'),
      '--no-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${videoFile}`
    ]
  });
  const mutations = [];
  const lookup = [];
  async function open(role, viewport = { width: 1440, height: 1000 }) {
    const context = await browser.newContext({ viewport, permissions: ['camera'] });
    await context.addInitScript(() => {
      window.__barcodePrints = [];
      window.print = () => window.top.__barcodePrints.push(document.documentElement.outerHTML);
    });
    await context.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const endpoint = url.pathname;
      if (request.method() !== 'GET') mutations.push(endpoint);
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (endpoint === '/api/auth/me') return json({ id: 1, role, fullName: 'THORS Test', status: 'ACTIVE' });
      if (endpoint === '/api/auth/csrf') return json({ headerName: 'X-CSRF-TOKEN', token: 'test-token' });
      if (endpoint === '/api/notifications/unread-count') return json({ count: 0 });
      if (endpoint === '/api/warehouse/snapshot')
        return json({
          variants,
          racks: [
            { rack_id: 1, rack_code: 'A', coordinate_x: 40, coordinate_y: 40, is_active: 1 },
            { rack_id: 2, rack_code: 'B', coordinate_x: 260, coordinate_y: 40, is_active: 1 }
          ],
          tiers: [
            { shelf_level_id: 1, rack_id: 1, level_number: 1, status: 'AVAILABLE', is_active: 1 },
            { shelf_level_id: 2, rack_id: 2, level_number: 2, status: 'AVAILABLE', is_active: 1 }
          ],
          locations: [
            { product_location_id: 1, detail_id: 101, shelf_level_id: 1, quantity: 5 },
            { product_location_id: 2, detail_id: 101, shelf_level_id: 2, quantity: 7 }
          ],
          images: []
        });
      if (endpoint === '/api/warehouse/documents' || endpoint === '/api/warehouse/notifications') return json([]);
      if (endpoint === '/api/warehouse/barcodes/generate') {
        assert.equal(request.method(), 'POST');
        let generated = 0;
        for (const variant of variants)
          if (!variant.barcode) {
            variant.barcode = `TH${String(variant.detail_id).padStart(6, '0')}`;
            generated++;
          }
        return json({ generated });
      }
      if (endpoint === '/api/warehouse/barcodes/lookup') {
        const code = url.searchParams.get('code');
        lookup.push(code);
        const variant = variants.find((item) => item.barcode === code);
        if (!variant) return json({ code: 'BARCODE_NOT_FOUND', message: 'Không tìm thấy hàng hóa có mã vạch này.' }, 404);
        return json({
          variant,
          locations:
            variant.detail_id === 101
              ? [
                  { product_location_id: 1, rack_code: 'A', level_number: 1, quantity: 5 },
                  { product_location_id: 2, rack_code: 'B', level_number: 2, quantity: 7 }
                ]
              : []
        });
      }
      throw new Error(`Unexpected API call: ${request.method()} ${endpoint}`);
    });
    const page = await context.newPage();
    await page.goto(`${baseURL}/warehouse/inventory`);
    await page.getByRole('heading', { name: 'Tồn kho', exact: true }).waitFor();
    return { context, page };
  }

  const { context, page } = await open('OWNER');
  await page.getByRole('button', { name: 'Tạo mã còn thiếu (1)', exact: true }).click();
  await page.getByText('Đã tạo 1 mã vạch còn thiếu.', { exact: true }).waitFor();
  assert.equal(variants[0].barcode, 'TH000101');
  await page.screenshot({ path: path.join(artifacts, 'inventory.png'), fullPage: true });
  await page.getByRole('checkbox', { name: 'Chọn tất cả kết quả đang lọc', exact: true }).check();
  await page.getByRole('button', { name: 'In mã vạch (2)', exact: true }).click();
  await page.getByLabel('Số tem #101', { exact: true }).fill('2');
  await page.getByLabel('Số tem #102', { exact: true }).fill('3');
  await page.getByText('Tổng: 5 tem', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(artifacts, 'print-dialog.png'), fullPage: true });
  await page.getByRole('button', { name: 'In / Lưu PDF', exact: true }).click();
  await page.waitForFunction(() => window.__barcodePrints.length === 1);
  const printed = await page.evaluate(() => {
    const html = window.__barcodePrints[0];
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return {
      html,
      codes: [...doc.querySelectorAll('svg text')].map((node) => node.textContent),
      count: doc.querySelectorAll('.label').length
    };
  });
  assert.equal(printed.count, 5);
  assert.deepEqual(printed.codes, ['TH000101', 'TH000101', 'TH000102', 'TH000102', 'TH000102']);
  const printPage = await context.newPage();
  await printPage.setContent(printed.html);
  const barcodeBounds = await printPage
    .locator('svg')
    .first()
    .evaluate((svg) => ({ width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height }));
  assert.ok(barcodeBounds.width > 0 && barcodeBounds.height > 0, 'Printed SVG must have a valid numeric viewBox');
  await printPage.pdf({ path: path.join(artifacts, 'labels.pdf'), preferCSSPageSize: true, printBackground: true });
  const escaped = await page.evaluate(async () => {
    const { labelDocument } = await import('/src/features/warehouse/barcodeLabels.js');
    const name = 'Áo <script>alert(1)</script> & "Test"';
    const html = labelDocument([{ detail_id: 1, product_name: name, color: 'Đen', size: 'M', barcode: 'TH000001' }], { 1: 1 }, 'roll');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return { name, text: doc.querySelector('.name').textContent, scripts: doc.querySelectorAll('script').length, html };
  });
  assert.equal(escaped.text, escaped.name);
  assert.equal(escaped.scripts, 0);
  await printPage.setContent(escaped.html);
  await printPage.pdf({ path: path.join(artifacts, 'roll-label.pdf'), preferCSSPageSize: true, printBackground: true });
  await printPage.close();
  await page.getByRole('dialog', { name: 'In mã vạch', exact: true }).getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByRole('textbox', { name: 'Tìm tồn kho' }).fill('TH000102');
  assert.equal(await page.getByRole('checkbox', { name: /^Chọn Áo/ }).count(), 1);
  await page.getByRole('textbox', { name: 'Tìm tồn kho' }).fill('');
  await page.getByRole('button', { name: 'Quét mã tìm hàng', exact: true }).click();
  const scanner = page.getByRole('dialog', { name: 'Quét mã tìm hàng', exact: true });
  await scanner.getByRole('textbox', { name: 'Mã vạch', exact: true }).fill('UNKNOWN');
  await scanner.getByRole('button', { name: 'Tìm hàng', exact: true }).click();
  await scanner.getByText('Không tìm thấy hàng hóa có mã vạch này.', { exact: true }).waitFor();
  await scanner.getByRole('textbox', { name: 'Mã vạch', exact: true }).fill('TH000101');
  await scanner.getByRole('button', { name: 'Tìm hàng', exact: true }).click();
  await scanner.getByText('A1: 5 sản phẩm', { exact: true }).waitFor();
  await scanner.getByText('B2: 7 sản phẩm', { exact: true }).waitFor();
  await scanner.getByRole('button', { name: 'Bật camera', exact: true }).click();
  await scanner.getByText('A1: 5 sản phẩm', { exact: true }).waitFor({ timeout: 30000 });
  assert.ok(lookup.filter((code) => code === 'TH000101').length >= 2, 'Video camera should decode the barcode');
  assert.equal(await scanner.locator('video').evaluate((video) => video.srcObject), null, 'Camera must stop after a successful scan');
  await page.screenshot({ path: path.join(artifacts, 'scan-result.png'), fullPage: true });
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('denied', 'NotAllowedError');
    };
  });
  await scanner.getByRole('button', { name: 'Bật camera', exact: true }).click();
  await scanner.getByText('Chưa được cấp quyền camera. Hãy cho phép truy cập camera trong trình duyệt.', { exact: true }).waitFor();
  await scanner.getByRole('textbox', { name: 'Mã vạch', exact: true }).fill('TH000101');
  await scanner.getByRole('button', { name: 'Tìm hàng', exact: true }).click();
  const mapLink = scanner.getByRole('link', { name: 'Xem vị trí trên sơ đồ', exact: true });
  await mapLink.click();
  await page.waitForURL('**/warehouse/locations?variant=101');
  await context.close();

  const mobile = await open('FAMILY_MEMBER', { width: 390, height: 844 });
  assert.equal(await mobile.page.getByRole('button', { name: /^Tạo mã còn thiếu/ }).count(), 0);
  await mobile.page.getByRole('button', { name: 'Quét mã tìm hàng', exact: true }).click();
  const mobileScanner = mobile.page.getByRole('dialog', { name: 'Quét mã tìm hàng', exact: true });
  await mobileScanner.getByRole('button', { name: 'Bật camera', exact: true }).click();
  await mobileScanner.getByText('A1: 5 sản phẩm', { exact: true }).waitFor({ timeout: 30000 });
  await mobile.page.screenshot({ path: path.join(artifacts, 'mobile-scan.png'), fullPage: true });
  await mobile.context.close();
  assert.deepEqual(mutations, ['/api/warehouse/barcodes/generate'], 'Printing and lookup must not submit stock mutations');
  assert.deepEqual(
    variants.map((variant) => variant.stock_quantity),
    [20, 15]
  );
  console.log(
    'PASS: quantities, bulk generation, selection, exact label counts, printing, barcode search, manual lookup, camera decoding, camera cleanup, denied permission, map link and mobile/Family layout.'
  );
  if (process.env.BARCODE_TEST_ARTIFACTS) console.log(`QA artifacts: ${artifacts}`);
} finally {
  await browser?.close();
  server.kill();
  await rm(temporary, { recursive: true, force: true });
}
