import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, post } from 'services/http';

/**
 * Giỏ hàng THORS (kiểu Shopee), nối API backend:
 *  GET  /api/cart                      xem giỏ
 *  PUT  /api/cart/items/{id}           đổi số lượng
 *  POST /api/cart/items/batch-delete   xóa một hoặc nhiều món
 * `api` và `post` từ services/http đã tự gửi CSRF token và cookie đăng nhập.
 */

const money = (n) => `${n.toLocaleString('vi-VN')} ₫`;
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

const toUi = (r) => ({
  id: r.cartItemId,
  name: r.productName,
  variant: `Size ${r.size} · ${r.color}`,
  price: Number(r.price),
  qty: Number(r.quantity),
  stock: Number(r.stock),
  imageUrl: r.imageUrl,
  available: Boolean(r.available)
});

// Chỉ mua được khi còn bán online, còn hàng và số lượng không vượt tồn
const canBuy = (i) => i.available && i.stock > 0 && i.qty <= i.stock;

export default function CartPage({ onCheckout }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [confirmIds, setConfirmIds] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (keepSelection) => {
    try {
      const data = await api('/cart');
      const list = (data.items || []).map(toUi);
      setItems(list);
      setSelected((prev) =>
        new Set(list.filter((i) => canBuy(i) && (!keepSelection || prev.has(i.id))).map((i) => i.id))
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const buyable = items.filter(canBuy);
  const allChecked = buyable.length > 0 && buyable.every((i) => selected.has(i.id));
  const picked = useMemo(() => items.filter((i) => selected.has(i.id)), [items, selected]);
  const total = picked.reduce((sum, i) => sum + i.price * i.qty, 0);
  const pickedQty = picked.reduce((sum, i) => sum + i.qty, 0);

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(buyable.map((i) => i.id)));

  const setLocalQty = (id, q) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, qty: q } : i)));

  const saveQty = async (id, q) => {
    setError('');
    try {
      await api(`/cart/items/${id}`, { method: 'PUT', body: { quantity: q } });
    } catch (e) {
      setError(e.message);
      await load(true); // đồng bộ lại với số liệu thật của máy chủ
    }
  };

  const step = (item, delta) => {
    const q = clamp(item.qty + delta, 1, item.stock);
    if (q === item.qty) return;
    setLocalQty(item.id, q);
    saveQty(item.id, q);
  };

  const removeItems = async (ids) => {
    setBusy(true);
    setError('');
    try {
      await post('/cart/items/batch-delete', { cartItemIds: ids });
      await load(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setConfirmIds(null);
      setBusy(false);
    }
  };

  const confirmItems = confirmIds ? items.filter((i) => confirmIds.includes(i.id)) : [];

  return (
    <div className="thc">
      <style>{CSS}</style>

      <header className="thc-head">
        <div>
          <h1>Giỏ hàng</h1>
          <p>Kiểm tra sản phẩm và số lượng trước khi thanh toán.</p>
        </div>
        <span className="thc-chip">{items.length} sản phẩm</span>
      </header>

      {error && <div className="thc-err" role="alert">{error}</div>}

      {loading ? (
        <div className="thc-card thc-empty"><p>Đang tải giỏ hàng...</p></div>
      ) : items.length === 0 ? (
        <div className="thc-card thc-empty">
          <div className="thc-empty-mark" aria-hidden="true">0</div>
          <h2>Giỏ hàng đang trống</h2>
          <p>Thêm sản phẩm vào giỏ để bắt đầu mua hàng.</p>
          <button className="thc-btn thc-btn-primary" onClick={() => (window.location.href = '/')}>
            Tiếp tục mua sắm
          </button>
        </div>
      ) : (
        <div className="thc-layout">
          <section className="thc-card thc-list" aria-label="Sản phẩm trong giỏ">
            <div className="thc-row thc-row-head">
              <label className="thc-check">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Chọn tất cả" />
                <span />
              </label>
              <span>Sản phẩm</span>
              <span className="thc-c">Đơn giá</span>
              <span className="thc-c">Số lượng</span>
              <span className="thc-c">Thành tiền</span>
              <span className="thc-c">Thao tác</span>
            </div>

            {items.map((item) => {
              const ok = canBuy(item);
              return (
                <div className={`thc-row${ok ? '' : ' thc-row-off'}`} key={item.id}>
                  <label className="thc-check">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      disabled={!ok}
                      onChange={() => toggle(item.id)}
                      aria-label={`Chọn ${item.name}`}
                    />
                    <span />
                  </label>

                  <div className="thc-prod">
                    <div className="thc-thumb" aria-hidden="true">
                      {item.imageUrl ? <img src={item.imageUrl} alt="" /> : item.name.charAt(0)}
                    </div>
                    <div>
                      <div className="thc-name">{item.name}</div>
                      <div className="thc-variant">{item.variant}</div>
                      {!item.available && <div className="thc-bad">Ngừng bán online</div>}
                      {item.available && item.stock === 0 && <div className="thc-bad">Hết hàng</div>}
                      {item.available && item.stock > 0 && item.qty > item.stock && (
                        <div className="thc-bad">Chỉ còn {item.stock} sản phẩm, vui lòng giảm số lượng</div>
                      )}
                      {ok && item.stock <= 5 && <div className="thc-low">Chỉ còn {item.stock} sản phẩm</div>}
                    </div>
                  </div>

                  <div className="thc-c thc-price" data-label="Đơn giá">{money(item.price)}</div>

                  <div className="thc-c" data-label="Số lượng">
                    <div className="thc-qty">
                      <button onClick={() => step(item, -1)} disabled={item.qty <= 1} aria-label="Giảm số lượng">−</button>
                      <input
                        value={item.qty}
                        inputMode="numeric"
                        disabled={!item.available || item.stock === 0}
                        onChange={(e) =>
                          setLocalQty(item.id, clamp(Number(e.target.value.replace(/\D/g, '')) || 1, 1, Math.max(item.stock, 1)))
                        }
                        onBlur={() => saveQty(item.id, item.qty)}
                        aria-label={`Số lượng ${item.name}`}
                      />
                      <button
                        onClick={() => step(item, 1)}
                        disabled={!item.available || item.qty >= item.stock}
                        aria-label="Tăng số lượng"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="thc-c thc-sub" data-label="Thành tiền">{money(item.price * item.qty)}</div>

                  <div className="thc-c">
                    <button className="thc-link-danger" onClick={() => setConfirmIds([item.id])}>Xóa</button>
                  </div>
                </div>
              );
            })}

            <div className="thc-listfoot">
              <label className="thc-check">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Chọn tất cả" />
                <span />
              </label>
              <span>Chọn tất cả ({buyable.length})</span>
              <button
                className="thc-link-danger"
                disabled={picked.length === 0}
                onClick={() => setConfirmIds(picked.map((i) => i.id))}
              >
                Xóa các mục đã chọn
              </button>
            </div>
          </section>

          <aside className="thc-card thc-sum" aria-label="Tóm tắt đơn hàng">
            <h2>Tóm tắt đơn hàng</h2>
            <dl>
              <div><dt>Đã chọn</dt><dd>{picked.length} sản phẩm</dd></div>
              <div><dt>Tổng số lượng</dt><dd>{pickedQty}</dd></div>
              <div className="thc-total"><dt>Tổng thanh toán</dt><dd>{money(total)}</dd></div>
            </dl>
            <button
              className="thc-btn thc-btn-primary thc-block"
              disabled={picked.length === 0}
              onClick={() => onCheckout?.(picked)}
            >
              Mua hàng ({picked.length})
            </button>
            <div className="thc-note">
              {picked.length === 0
                ? 'Chọn ít nhất một sản phẩm để thanh toán.'
                : 'Phí vận chuyển và mã giảm giá được tính ở bước thanh toán.'}
            </div>
          </aside>
        </div>
      )}

      {confirmIds && (
        <div className="thc-overlay" onClick={() => !busy && setConfirmIds(null)}>
          <div className="thc-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{confirmItems.length === 1 ? 'Xóa sản phẩm này?' : `Xóa ${confirmItems.length} sản phẩm?`}</h3>
            <p>
              {confirmItems.length === 1
                ? `“${confirmItems[0].name}” sẽ bị xóa khỏi giỏ hàng.`
                : 'Các sản phẩm đã chọn sẽ bị xóa khỏi giỏ hàng.'}
            </p>
            <div className="thc-dialog-actions">
              <button className="thc-btn" onClick={() => setConfirmIds(null)} disabled={busy}>Giữ lại</button>
              <button className="thc-btn thc-btn-danger" onClick={() => removeItems(confirmIds)} disabled={busy}>
                {busy ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.thc{--bg:#fbfaf2;--card:#fff;--ink:#16222e;--mute:#6b7683;--line:#e8e6d9;--cy:#8fe6f2;--cy-d:#27a9bd;
--warn:#fff4c4;--warn-l:#efe3a0;--red:#d6453d;
font-family:'Be Vietnam Pro','Inter',system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--ink);
background:var(--bg);padding:28px;min-height:100%;box-sizing:border-box}
.thc *{box-sizing:border-box}
.thc button{font:inherit;cursor:pointer}
.thc button:disabled{cursor:not-allowed;opacity:.45}
.thc :focus-visible{outline:2px solid var(--cy-d);outline-offset:2px}
.thc-head{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:20px}
.thc-head h1{margin:0;font-size:26px;font-weight:700;letter-spacing:-.01em}
.thc-head p{margin:4px 0 0;color:var(--mute);font-size:14px}
.thc-chip{background:var(--cy);padding:6px 12px;border-radius:999px;font-size:13px;font-weight:600}
.thc-card{background:var(--card);border:1px solid var(--line);border-radius:14px}
.thc-layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:20px;align-items:start}
.thc-row{display:grid;grid-template-columns:32px minmax(0,2.6fr) 1fr 1.2fr 1.1fr .7fr;gap:12px;align-items:center;
padding:16px 20px;border-bottom:1px solid var(--line)}
.thc-row-head{font-size:13px;color:var(--mute);padding:12px 20px;background:#fdfcf6;border-radius:14px 14px 0 0}
.thc-c{text-align:center}
.thc-prod{display:flex;gap:14px;align-items:center;min-width:0}
.thc-thumb{flex:none;width:64px;height:64px;border-radius:12px;background:var(--cy);display:grid;place-items:center;
font-size:24px;font-weight:700;color:#0f4c57}
.thc-name{font-weight:600;font-size:15px;line-height:1.35}
.thc-variant{font-size:13px;color:var(--mute);margin-top:2px}
.thc-low{display:inline-block;margin-top:6px;font-size:12px;background:var(--warn);border:1px solid var(--warn-l);
padding:2px 8px;border-radius:6px}
.thc-price{font-size:14px;color:var(--mute)}
.thc-sub{font-weight:700;color:var(--cy-d)}
.thc-qty{display:inline-flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff}
.thc-qty button{width:32px;height:34px;border:0;background:#faf9f1;font-size:17px;color:var(--ink)}
.thc-qty button:hover:not(:disabled){background:var(--cy)}
.thc-qty input{width:46px;height:34px;border:0;border-inline:1px solid var(--line);text-align:center;font:inherit;font-size:14px;
background:#fff;color:var(--ink)}
.thc-link-danger{background:none;border:0;color:var(--red);font-size:14px;padding:4px 6px;border-radius:6px}
.thc-link-danger:hover:not(:disabled){background:#fdecea}
.thc-listfoot{display:flex;align-items:center;gap:12px;padding:14px 20px;font-size:14px}
.thc-listfoot .thc-link-danger{margin-left:auto}
.thc-check{position:relative;display:inline-flex;width:20px;height:20px}
.thc-check input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer}
.thc-check span{width:20px;height:20px;border:1.5px solid #b9bfc6;border-radius:6px;background:#fff;display:grid;place-items:center}
.thc-check input:checked+span{background:var(--cy-d);border-color:var(--cy-d)}
.thc-check input:checked+span::after{content:'';width:5px;height:10px;border:solid #fff;border-width:0 2px 2px 0;
transform:rotate(45deg) translate(-1px,-1px)}
.thc-check input:focus-visible+span{outline:2px solid var(--cy-d);outline-offset:2px}
.thc-sum{padding:20px;position:sticky;top:20px}
.thc-sum h2{margin:0 0 14px;font-size:17px}
.thc-sum dl{margin:0 0 16px}
.thc-sum dl div{display:flex;justify-content:space-between;padding:8px 0;font-size:14px;color:var(--mute)}
.thc-sum dd{margin:0;color:var(--ink);font-weight:600}
.thc-sum .thc-total{border-top:1px dashed var(--line);margin-top:6px;padding-top:14px;color:var(--ink);font-weight:600}
.thc-sum .thc-total dd{font-size:21px;color:var(--cy-d)}
.thc-btn{border:1px solid var(--line);background:#fff;color:var(--ink);padding:10px 18px;border-radius:10px;font-weight:600;font-size:14px}
.thc-btn-primary{background:var(--cy);border-color:var(--cy);color:#0b3a43}
.thc-btn-primary:hover:not(:disabled){background:#78dcea}
.thc-btn-danger{background:var(--red);border-color:var(--red);color:#fff}
.thc-block{width:100%;padding:13px}
.thc-note{margin-top:14px;background:var(--warn);border:1px solid var(--warn-l);border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.45}
.thc-empty{text-align:center;padding:56px 20px}
.thc-empty-mark{width:72px;height:72px;margin:0 auto 14px;border-radius:50%;background:var(--cy);display:grid;place-items:center;font-size:28px;font-weight:700}
.thc-empty h2{margin:0 0 6px;font-size:19px}
.thc-empty p{margin:0 0 18px;color:var(--mute);font-size:14px}
.thc-overlay{position:fixed;inset:0;background:rgba(22,34,46,.4);display:grid;place-items:center;padding:16px;z-index:1300}
.thc-dialog{background:#fff;border-radius:14px;padding:22px;max-width:380px;width:100%}
.thc-dialog h3{margin:0 0 8px;font-size:18px}
.thc-dialog p{margin:0 0 20px;color:var(--mute);font-size:14px;line-height:1.5}
.thc-dialog-actions{display:flex;gap:10px;justify-content:flex-end}
.thc-thumb img{width:100%;height:100%;object-fit:cover;border-radius:12px}
.thc-bad{display:inline-block;margin-top:6px;font-size:12px;color:var(--red);background:#fdecea;border-radius:6px;padding:2px 8px}
.thc-err{margin-bottom:16px;background:var(--warn);border:1px solid var(--warn-l);border-radius:10px;padding:10px 14px;font-size:14px}
.thc-row-off .thc-prod,.thc-row-off .thc-price,.thc-row-off .thc-sub{opacity:.55}
@media (max-width:960px){.thc-layout{grid-template-columns:1fr}.thc-sum{position:static}}
@media (max-width:720px){
.thc{padding:16px}
.thc-row-head{display:none}
.thc-row{grid-template-columns:28px 1fr;row-gap:10px}
.thc-row .thc-c{grid-column:2;display:flex;justify-content:space-between;align-items:center;text-align:left}
.thc-row .thc-c[data-label]::before{content:attr(data-label);color:var(--mute);font-size:13px;font-weight:400}
}
@media (prefers-reduced-motion:no-preference){.thc-dialog{animation:thcIn .15s ease-out}}
@keyframes thcIn{from{transform:translateY(6px);opacity:0}to{transform:none;opacity:1}}
`;
