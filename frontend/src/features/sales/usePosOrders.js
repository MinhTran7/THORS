import { useEffect, useRef, useState } from 'react';
import { newRequestId } from './salesFormat';

const MAX_ORDERS = 8;
const KEEP_MS = 24 * 3600 * 1000;

const blankOrder = (id, label) => ({
  id,
  label,
  createdAt: Date.now(),
  requestId: newRequestId(),
  cart: [],
  payment: 'Cash',
  discount: '',
  discountType: 'amount',
  customerPaid: ''
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

function saveOrders(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.warn('Không lưu được hóa đơn chờ trên trình duyệt:', err);
  }
}

// Các hóa đơn chờ (tab kiểu Sapo) và giỏ hàng của hóa đơn đang mở; lưu trên trình duyệt theo từng tài khoản
export default function usePosOrders(accountId) {
  const storageKey = `pos-orders-${accountId}`;
  const [saved] = useState(() => loadSaved(storageKey));
  const [orders, setOrders] = useState(() => saved?.orders ?? [blankOrder(1, 'Hóa đơn 1')]);
  const [activeOrderId, setActiveOrderId] = useState(() => saved?.activeOrderId ?? 1);
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  useEffect(() => {
    saveOrders(storageKey, { orders, activeOrderId });
  }, [storageKey, orders, activeOrderId]);

  const activeOrder = orders.find((o) => o.id === activeOrderId) || orders[0];

  const updateOrder = (id, patchOrFn) =>
    setOrders((prev) => prev.map((o) => (o.id !== id ? o : typeof patchOrFn === 'function' ? patchOrFn(o) : { ...o, ...patchOrFn })));

  const updateActiveOrder = (patchOrFn) => updateOrder(activeOrder.id, patchOrFn);

  const setCart = (action) => updateActiveOrder((o) => ({ ...o, cart: typeof action === 'function' ? action(o.cart) : action }));

  // Số lượng cùng biến thể đang nằm ở các hóa đơn chờ khác
  const otherTabsQty = (key) =>
    orders.reduce((sum, o) => (o.id === activeOrder.id ? sum : sum + (o.cart.find((line) => line.key === key)?.quantity ?? 0)), 0);

  // Cập nhật tồn kho mới nhất của biến thể cho mọi hóa đơn chờ
  const syncStock = (key, stock) =>
    setOrders((prev) => prev.map((o) => ({ ...o, cart: o.cart.map((line) => (line.key === key ? { ...line, stock } : line)) })));

  // Trả về thông báo lỗi nếu đã đủ số hóa đơn chờ
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

  return {
    restoredOrders: saved?.orders ?? [],
    orders,
    ordersRef,
    activeOrder,
    cart: activeOrder.cart,
    setActiveOrderId,
    updateOrder,
    updateActiveOrder,
    setCart,
    otherTabsQty,
    syncStock,
    addOrder,
    removeOrder,
    clearActiveOrder
  };
}
