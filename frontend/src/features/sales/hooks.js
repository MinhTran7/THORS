import { useCallback, useEffect, useRef, useState } from 'react';
import { getProducts } from 'services/productService';
import { getPriceRanges, getSale, getVariantSales } from 'services/salesService';
import { ordersApi } from 'features/order/api';
import { addScannedLine, scanToCartLine } from 'features/warehouse/scanToCart';
import { isActive, lineLabel, newRequestId } from './utils';

const MAX_ORDERS = 8;
const KEEP_MS = 24 * 3600 * 1000;

export const variantSalesOf = (productId) => getVariantSales(productId).catch(() => ({}));

const blankOrder = (id, label) => ({
  id,
  label,
  createdAt: Date.now(),
  requestId: newRequestId(),
  cart: [],
  discount: '',
  discountType: 'amount',
  customerPaid: '',
  transfer: null
});

function loadSaved(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    const orders = saved.orders.filter((o) => Date.now() - o.createdAt < KEEP_MS);
    return orders.length ? { orders, activeOrderId: saved.activeOrderId } : null;
  } catch {
    return null;
  }
}

// Sản phẩm đang bán và khoảng giá sau khuyến mãi cho ô tìm kiếm
export function useSaleProducts() {
  const [products, setProducts] = useState([]);
  const [priceRanges, setPriceRanges] = useState({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    getPriceRanges()
      .then(setPriceRanges)
      .catch(() => setPriceRanges({}));
    return getProducts()
      .then((res) => setProducts(res.filter(isActive)))
      .finally(() => setLoading(false));
  }, []);

  return { products, priceRanges, loading, reload };
}

// Các hóa đơn chờ (tab kiểu Sapo) và giỏ hàng của hóa đơn đang mở; lưu trên trình duyệt theo từng tài khoản
export function usePosOrders(accountId) {
  const storageKey = `pos-orders-${accountId}`;
  const [saved] = useState(() => loadSaved(storageKey));
  const [orders, setOrders] = useState(() => saved?.orders ?? [blankOrder(1, 'Hóa đơn 1')]);
  const [activeOrderId, setActiveOrderId] = useState(() => saved?.activeOrderId ?? 1);
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  // Lấy lại giá sau khuyến mãi và số còn bán được cho các dòng của một hóa đơn
  const refreshPrices = useCallback(async (orderId) => {
    const ids = [...new Set((ordersRef.current.find((o) => o.id === orderId)?.cart ?? []).map((line) => line.productId))];
    const sales = Object.assign({}, ...(await Promise.all(ids.map(variantSalesOf))));
    setOrders((prev) =>
      prev.map((o) =>
        o.id !== orderId
          ? o
          : {
              ...o,
              cart: o.cart.map((line) => {
                const sale = sales[line.variantId];
                return sale ? { ...line, price: Number(sale.price), stock: sale.available } : line;
              })
            }
      )
    );
  }, []);

  // Hóa đơn chờ mở lại từ trình duyệt: giá có thể đã đổi do khuyến mãi
  useEffect(() => {
    saved?.orders.filter((o) => o.cart.length && !o.transfer).forEach((o) => refreshPrices(o.id));
  }, [saved, refreshPrices]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ orders, activeOrderId }));
    } catch {
      /* trình duyệt chặn lưu: hóa đơn chờ chỉ mất khi tải lại trang */
    }
  }, [storageKey, orders, activeOrderId]);

  const activeOrder = orders.find((o) => o.id === activeOrderId) || orders[0];
  const cart = activeOrder.cart;

  const updateOrder = (id, patchOrFn) =>
    setOrders((prev) => prev.map((o) => (o.id !== id ? o : typeof patchOrFn === 'function' ? patchOrFn(o) : { ...o, ...patchOrFn })));
  const updateActiveOrder = (patchOrFn) => updateOrder(activeOrder.id, patchOrFn);
  const setCart = (fn) => updateActiveOrder((o) => ({ ...o, cart: fn(o.cart) }));

  // Số lượng cùng biến thể đang nằm ở các hóa đơn chờ khác
  const otherTabsQty = (key) =>
    ordersRef.current.reduce(
      (sum, o) => (o.id === activeOrder.id || o.transfer ? sum : sum + (o.cart.find((l) => l.key === key)?.quantity ?? 0)),
      0
    );

  // Cập nhật tồn kho mới nhất của biến thể cho mọi hóa đơn chờ
  const syncStock = (key, stock) =>
    setOrders((prev) => prev.map((o) => ({ ...o, cart: o.cart.map((line) => (line.key === key ? { ...line, stock } : line)) })));

  // ---- Hóa đơn chờ ----

  function addOrder() {
    if (orders.length >= MAX_ORDERS) return `Đã đạt giới hạn tối đa ${MAX_ORDERS} hóa đơn chờ.`;
    const used = orders.map((o) => Number(o.label.match(/\d+/)?.[0] ?? 0));
    let next = 1;
    while (used.includes(next)) next++;
    const id = Date.now();
    setOrders((prev) => [...prev, blankOrder(id, `Hóa đơn ${next}`)]);
    setActiveOrderId(id);
    return '';
  }

  // Đóng một hóa đơn; hết hóa đơn thì mở hóa đơn trống mới
  function removeOrder(id) {
    const fresh = blankOrder(Date.now(), 'Hóa đơn 1');
    const rest = ordersRef.current.filter((o) => o.id !== id);
    setOrders((prev) => {
      const left = prev.filter((o) => o.id !== id);
      return left.length ? left : [fresh];
    });
    setActiveOrderId((cur) => (cur !== id ? cur : (rest[rest.length - 1]?.id ?? fresh.id)));
  }

  const clearActiveOrder = () => updateActiveOrder({ cart: [], discount: '', discountType: 'amount', customerPaid: '' });

  const setTransfer = (id, transfer) => updateOrder(id, { transfer });

  const reopenOrder = (id) => updateOrder(id, { transfer: null, requestId: newRequestId() });

  // ---- Dòng hàng ----

  // Thêm hoặc sửa dòng: gộp vào dòng cùng biến thể nếu có, nếu không thì thay đúng vị trí dòng đang sửa
  function putLine(newLine, editingKey) {
    syncStock(newLine.key, newLine.stock);
    setCart((current) => {
      const existing = current.find((line) => line.key === newLine.key && line.key !== editingKey);
      const rest = current.filter((line) => line.key !== editingKey);
      if (existing)
        return rest.map((line) => (line.key === newLine.key ? { ...line, quantity: existing.quantity + newLine.quantity } : line));
      return editingKey ? current.map((line) => (line.key === editingKey ? newLine : line)) : [...current, newLine];
    });
  }

  function stepLine(key, delta) {
    setCart((current) =>
      current
        .map((line) => {
          if (line.key !== key) return line;
          const quantity = line.quantity + delta;
          if (quantity <= 0) return null;
          return { ...line, quantity: delta > 0 ? Math.min(quantity, line.stock - otherTabsQty(key)) : quantity };
        })
        .filter(Boolean)
    );
  }

  const removeLine = (key) => setCart((current) => current.filter((line) => line.key !== key));

  // Đặt số lượng; vượt số bán được thì giữ ở mức tối đa và trả về thông báo
  function setLineQuantity(line, qty) {
    if (qty === 0) {
      removeLine(line.key);
      return '';
    }
    const others = otherTabsQty(line.key);
    const max = Math.max(1, line.stock - others);
    setCart((current) => current.map((item) => (item.key === line.key ? { ...item, quantity: Math.min(qty, max) } : item)));
    return qty > max ? `${lineLabel(line)}: chỉ còn ${line.stock} trong kho${others ? `, hóa đơn chờ khác đang giữ ${others}` : ''}.` : '';
  }

  // Quét mã vạch: thêm vào hóa đơn đang mở, quét lại cùng mã thì +1 (không vượt số bán được)
  async function addScanned(code) {
    const line = await scanToCartLine(code);
    const sale = (await variantSalesOf(line.productId))[line.variantId];
    line.originalPrice = line.price;
    line.price = Number(sale?.price ?? line.price);
    line.stock = sale?.available ?? line.stock;
    syncStock(line.key, line.stock);
    const current = ordersRef.current.find((o) => o.id === activeOrder.id).cart;
    const inThis = current.find((item) => item.key === line.key)?.quantity ?? 0;
    const others = otherTabsQty(line.key);
    if (others && inThis + others >= line.stock)
      throw new Error(`${lineLabel(line)}: đã đủ ${line.stock} (hết tồn kho), hóa đơn chờ khác đang giữ ${others}.`);
    const result = addScannedLine(current, line);
    if (result.error) throw new Error(result.error);
    ordersRef.current = ordersRef.current.map((o) => (o.id === activeOrder.id ? { ...o, cart: result.cart } : o));
    setCart(() => result.cart);
    return `Đã thêm ${lineLabel(line)} (SL: ${result.cart.find((item) => item.key === line.key).quantity})`;
  }

  return {
    orders,
    activeOrder,
    cart,
    setActiveOrderId,
    updateActiveOrder,
    otherTabsQty,
    addOrder,
    removeOrder,
    clearActiveOrder,
    setTransfer,
    reopenOrder,
    putLine,
    stepLine,
    removeLine,
    setLineQuantity,
    addScanned,
    refreshPrices
  };
}

export function useTransferWatcher(orders, onPaid) {
  const latest = useRef({ orders, onPaid });
  const handled = useRef(new Set());
  const watching = orders.some((o) => o.transfer);

  useEffect(() => {
    latest.current = { orders, onPaid };
  });

  useEffect(() => {
    if (!watching) return undefined;
    const check = async (tabId, orderId) => {
      const { paid } = await ordersApi.checkPayOSStatus(orderId);
      if (!paid || handled.current.has(orderId)) return;
      handled.current.add(orderId);
      latest.current.onPaid(tabId, await getSale(orderId));
    };
    const timer = setInterval(
      () => latest.current.orders.filter((o) => o.transfer).forEach((o) => check(o.id, o.transfer.orderId).catch(() => {})),
      3000
    );
    return () => clearInterval(timer);
  }, [watching]);
}
