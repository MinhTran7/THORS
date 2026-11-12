import { api } from 'services/http';

/**
 * Barcode → bill line for the in-store sales page (Bán tại quầy).
 *
 * Kept in the warehouse/barcode module so the sales page only wires it in: it looks the code up with
 * the existing warehouse API and returns a line in the exact shape the sales page's cart uses
 * ({ key, productId, variantId, name, image, size, color, price, stock, quantity }).
 * Nothing here changes stock; the sale itself still goes through the sales module on checkout.
 */
export async function scanToCartLine(rawCode) {
  const code = String(rawCode ?? '')
    .trim()
    .toUpperCase();
  if (!code) throw new Error('Chưa đọc được mã vạch.');
  let found;
  try {
    found = await api(`/warehouse/barcodes/lookup?code=${encodeURIComponent(code)}`);
  } catch (err) {
    if (err.status === 404) throw new Error(`Không tìm thấy hàng có mã vạch ${code}.`);
    if (err.status === 400) throw new Error(`Mã vạch ${code} không hợp lệ.`);
    throw err;
  }
  const v = found?.variant;
  if (!v) throw new Error(`Không tìm thấy hàng có mã vạch ${code}.`);
  const label = `${v.product_name} · ${v.color} · ${v.size}`;
  const active = (status) => String(status ?? 'ACTIVE').toUpperCase() === 'ACTIVE';
  if (!active(v.status) || !active(v.product_status)) throw new Error(`${label} đang ngừng bán.`);
  if (v.price == null) throw new Error(`${label} chưa có giá bán. Hãy nhập giá trong trang Sản phẩm trước khi bán.`);
  const stock = Number(v.stock_quantity) || 0;
  if (stock <= 0) throw new Error(`${label} đã hết hàng.`);
  return {
    key: `${v.product_id}-${v.detail_id}`,
    productId: v.product_id,
    variantId: v.detail_id,
    name: v.product_name || 'Sản phẩm',
    image: v.image_url || '',
    size: v.size ?? '',
    color: v.color ?? '',
    price: Number(v.price),
    stock,
    quantity: 1
  };
}

/**
 * Put a scanned line into a cart: same variant → +1 (up to stock), otherwise a new line.
 * Returns { cart } or { error } — the cart is never changed when there is an error.
 */
export function addScannedLine(cart, line) {
  const existing = cart.find((item) => item.key === line.key);
  if (!existing) return { cart: [...cart, line] };
  const stock = Math.min(existing.stock ?? line.stock, line.stock);
  if (existing.quantity >= stock)
    return { error: `${line.name} · ${line.color} · ${line.size}: trong hóa đơn đã đủ ${stock} (hết tồn kho).` };
  return { cart: cart.map((item) => (item.key === line.key ? { ...item, quantity: item.quantity + 1, stock: line.stock } : item)) };
}
