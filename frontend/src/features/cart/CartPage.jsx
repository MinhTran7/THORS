import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, post } from 'services/http';
import { checkoutFromCart } from './checkout';
import { Link, useNavigate } from 'react-router-dom';
import { colorHex } from 'features/shop/ShopCommon';
import { forgetProductDetail, loadProductDetail, productIdOf, productLink, resolveProductId } from './cartProduct';
/**
 * Giỏ hàng THORS (kiểu Shopee), nối API backend:
 *  GET  /api/cart                      xem giỏ
 *  PUT  /api/cart/items/{id}           đổi số lượng
 *  POST /api/cart/items/batch-delete   xóa một hoặc nhiều món
 *  Đổi màu / size = thêm phân loại mới (POST /api/cart/items, cùng số lượng) rồi xóa dòng cũ.
 *  Bấm ảnh hoặc tên sản phẩm -> trang chi tiết, mở sẵn đúng màu + size.
 * `api` và `post` từ services/http đã tự gửi CSRF token và cookie đăng nhập.
 */

const money = (n) => `${n.toLocaleString('vi-VN')} ₫`;
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

const toUi = (r) => ({
  id: r.cartItemId,
  name: r.productName,
  variant: `Size ${r.size} · ${r.color}`,
  productId: productIdOf(r),
  size: r.size,
  color: r.color,
  price: Number(r.price),
  qty: Number(r.quantity),
  stock: Number(r.stock),
  imageUrl: r.imageUrl,
  available: Boolean(r.available)
});

// Chỉ mua được khi còn bán online, còn hàng và số lượng không vượt tồn
const canBuy = (i) => i.available && i.stock > 0 && i.qty <= i.stock;
const sameVariant = (a, b) => a.name === b.name && a.size === b.size && a.color === b.color;

/**
 * Ô đổi phân loại ngay trong giỏ: bấm "Size XL · Đen ▾" -> chọn màu (chấm tròn) và size -> Cập nhật.
 * Phân loại hết hàng thì mờ đi, không chọn được.
 */
function VariantPicker({ item, productId, onApply }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [variants, setVariants] = useState(null);
  const [failed, setFailed] = useState(false);
  const [color, setColor] = useState(item.color);
  const [size, setSize] = useState(item.size);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const show = () => {
    setColor(item.color);
    setSize(item.size);
    setFailed(false);
    setOpen(true);
    if (!productId) return;
    loadProductDetail(productId)
      .then((d) => setVariants(d.variants || []))
      .catch(() => setFailed(true));
  };

  const list = variants || [];
  const colors = [...new Set(list.map((v) => v.color))];
  const sizes = [...new Set(list.map((v) => v.size))];
  const find = (s, c) => list.find((v) => v.size === s && v.color === c);
  const colorOff = (c) => !list.some((v) => v.color === c && v.stock > 0);
  const sizeOff = (s) => !(find(s, color)?.stock > 0);
  const chosen = find(size, color);
  const unchanged = size === item.size && color === item.color;

  const pickColor = (c) => {
    setColor(c);
    // Size đang chọn không có ở màu mới -> chọn size đầu tiên còn hàng
    if (!(find(size, c)?.stock > 0)) setSize(list.find((v) => v.color === c && v.stock > 0)?.size ?? size);
  };

  const apply = async () => {
    if (!chosen || unchanged) return setOpen(false);
    setSaving(true);
    const ok = await onApply(item, chosen);
    setSaving(false);
    if (ok) setOpen(false);
  };

  return (
    <div className="thc-vwrap" ref={ref}>
      <button
        type="button"
        className="thc-variant thc-vbtn"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
      >
        Phân loại: {item.variant}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
        </svg>
      </button>

      {open && (
        <div className="thc-vpop" role="dialog" aria-label={`Đổi phân loại ${item.name}`}>
          {!productId || failed ? (
            <p className="thc-vmsg">Không tải được phân loại của sản phẩm này.</p>
          ) : !variants ? (
            <p className="thc-vmsg">Đang tải...</p>
          ) : (
            <>
              <div className="thc-vlabel">
                Màu sắc: <b>{color}</b>
              </div>
              <div className="thc-swatches" role="radiogroup" aria-label="Màu sắc">
                {colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={c === color}
                    aria-label={c}
                    title={c}
                    disabled={colorOff(c)}
                    className={`thc-swatch${c === color ? ' on' : ''}${colorOff(c) ? ' off' : ''}`}
                    onClick={() => pickColor(c)}
                  >
                    <span style={{ background: colorHex(c) || '#D6D2CC' }} />
                  </button>
                ))}
              </div>
              <div className="thc-vlabel">Kích cỡ</div>
              <div className="thc-sizes" role="radiogroup" aria-label="Kích cỡ">
                {sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={s === size}
                    disabled={sizeOff(s)}
                    className={`thc-size${s === size ? ' on' : ''}`}
                    onClick={() => setSize(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {chosen && chosen.stock < item.qty && (
                <p className="thc-vwarn">Phân loại này chỉ còn {chosen.stock} sản phẩm, số lượng sẽ được giảm.</p>
              )}
              <div className="thc-vactions">
                <button type="button" className="thc-btn" onClick={() => setOpen(false)} disabled={saving}>
                  Trở lại
                </button>
                <button
                  type="button"
                  className="thc-btn thc-btn-primary"
                  onClick={apply}
                  disabled={saving || !chosen || !(chosen.stock > 0) || unchanged}
                >
                  {saving ? 'Đang lưu...' : 'Xác nhận'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function CartPage({ onCheckout }) {
    const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [confirmIds, setConfirmIds] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (keepSelection, alsoSelect) => {
    try {
      const data = await api('/cart');
      const list = (data.items || []).map(toUi);
      setItems(list);
      // Mới vào giỏ hàng: chưa tick sản phẩm nào, khách tự chọn món muốn mua.
      // Tải lại sau khi đổi số lượng / xóa: giữ nguyên các món đang tick.
      // alsoSelect: tick thêm món vừa đổi phân loại (dòng mới có mã khác dòng cũ)
      setSelected((prev) =>
        keepSelection
          ? new Set(list.filter((i) => canBuy(i) && (prev.has(i.id) || (alsoSelect && sameVariant(i, alsoSelect)))).map((i) => i.id))
          : new Set()
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

  // Mã sản phẩm của từng món (API giỏ chưa có thì tìm theo tên) để mở trang chi tiết và đổi phân loại
  const [productIds, setProductIds] = useState(() => new Map());
  useEffect(() => {
    let alive = true;
    items.forEach((item) => {
      if (productIds.has(item.name)) return;
      resolveProductId(item).then((id) => alive && setProductIds((prev) => new Map(prev).set(item.name, id)));
    });
    return () => {
      alive = false;
    };
  }, [items, productIds]);
  const productIdFor = (item) => item.productId ?? productIds.get(item.name) ?? null;

  // Đổi màu / size: thêm phân loại mới với cùng số lượng (không vượt tồn kho) rồi xóa dòng cũ
  const changeVariant = async (item, variant) => {
    setError('');
    try {
      const quantity = Math.max(1, Math.min(item.qty, Number(variant.stock)));
      await post('/cart/items', { detailId: variant.detailId, quantity });
      await post('/cart/items/batch-delete', { cartItemIds: [item.id] });
      forgetProductDetail(productIdFor(item));
      window.dispatchEvent(new Event('thors:cart-changed'));
      await load(true, selected.has(item.id) ? { name: item.name, size: variant.size, color: variant.color } : null);
      return true;
    } catch (e) {
      setError(e.message || 'Chưa đổi được phân loại. Vui lòng thử lại.');
      await load(true);
      return false;
    }
  };

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
              {/* Ô chọn tất cả ở đầu bảng: chưa chọn hết thì ghi "Sản phẩm", chọn hết thì ghi "Chọn tất cả (N)" */}
              <span className={allChecked ? 'thc-all-on' : undefined}>
                {allChecked ? `Chọn tất cả (${buyable.length})` : 'Sản phẩm'}
              </span>
              <span className="thc-c">Đơn giá</span>
              <span className="thc-c">Số lượng</span>
              <span className="thc-c">Thành tiền</span>
              <span className="thc-c">Thao tác</span>
            </div>

            {items.map((item) => {
              const ok = canBuy(item);
              const pid = productIdFor(item);
              const href = pid ? productLink(pid, { color: item.color, size: item.size }) : null;
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
                    {href ? (
                      <Link to={href} className="thc-thumb" tabIndex={-1} aria-hidden="true">
                        {item.imageUrl ? <img src={item.imageUrl} alt="" /> : item.name.charAt(0)}
                      </Link>
                    ) : (
                      <div className="thc-thumb" aria-hidden="true">
                        {item.imageUrl ? <img src={item.imageUrl} alt="" /> : item.name.charAt(0)}
                      </div>
                    )}
                    <div className="thc-info">
                      {href ? (
                        <Link to={href} className="thc-name thc-name-link">
                          {item.name}
                        </Link>
                      ) : (
                        <div className="thc-name">{item.name}</div>
                      )}
                      {item.available ? (
                        <VariantPicker item={item} productId={pid} onApply={changeVariant} />
                      ) : (
                        <div className="thc-variant">{item.variant}</div>
                      )}
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
              onClick={() => checkoutFromCart(navigate, picked.map((i) => i.id))}
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
/* Đồng màu với giao diện cửa hàng (features/shop/storeTheme): màu chủ đạo đỏ đô, chữ đen, nền be, nút vuông */
.thc{--bg:transparent;--card:#fff;--ink:#111111;--mute:#5C5650;--line:#E6E3DE;--sand:#EFEBE5;--accent:#8A2B2B;
--warn:#F7F1E6;--warn-l:#E6DCCB;--red:#8A2B2B;
font-family:'Be Vietnam Pro','Inter',system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--ink);
background:var(--bg);padding:8px 0 28px;min-height:100%;box-sizing:border-box}
.thc *{box-sizing:border-box}
.thc button{font:inherit;cursor:pointer}
.thc button:disabled{cursor:not-allowed;opacity:.45}
.thc :focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.thc-head{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:20px}
.thc-head h1{margin:0;font-size:32px;font-weight:700;letter-spacing:-.01em}
.thc-head p{margin:4px 0 0;color:var(--mute);font-size:14px}
.thc-chip{background:#F6ECEA;color:var(--accent);padding:6px 12px;font-size:13px;font-weight:600}
.thc-card{background:var(--card);border:1px solid var(--line)}
.thc-layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:20px;align-items:start}
.thc-row{display:grid;grid-template-columns:32px minmax(0,2.6fr) 1fr 1.2fr 1.1fr .7fr;gap:12px;align-items:center;
padding:16px 20px;border-bottom:1px solid var(--line)}
.thc-row-head{font-size:13px;color:var(--mute);padding:12px 20px;background:#FAF8F5}
.thc-c{text-align:center}
.thc-all-on{color:var(--ink);font-weight:600}
.thc-prod{display:flex;gap:14px;align-items:center;min-width:0}
.thc-thumb{flex:none;position:relative;width:64px;height:80px;overflow:hidden;background:var(--sand);
display:grid;place-items:center;font-size:24px;font-weight:700;color:#B5AFA6}
.thc-name{font-weight:600;font-size:15px;line-height:1.35}
.thc-variant{font-size:13px;color:var(--mute);margin-top:2px}
.thc-info{min-width:0}
a.thc-thumb{text-decoration:none}
.thc-name-link{display:block;color:var(--ink);text-decoration:none}
.thc-name-link:hover{color:var(--accent);text-decoration:underline;text-underline-offset:3px}
.thc-vwrap{position:relative;display:inline-block}
.thc .thc-vbtn{display:inline-flex;align-items:center;gap:6px;border:0;background:none;padding:2px 0;color:var(--mute);text-align:left;font-size:13px}
.thc .thc-vbtn:hover{color:var(--ink)}
.thc-vpop{position:absolute;top:calc(100% + 8px);left:0;z-index:30;width:300px;max-width:calc(100vw - 48px);background:#fff;
border:1px solid var(--line);box-shadow:0 14px 36px rgba(0,0,0,.14);padding:16px}
.thc-vlabel{font-size:13px;color:var(--mute);margin-bottom:8px}
.thc-vlabel b{color:var(--ink);font-weight:600}
.thc-swatches{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px}
.thc .thc-swatch{position:relative;width:34px;height:34px;padding:3px;border-radius:50%;border:1.5px solid transparent;background:#fff}
.thc .thc-swatch span{display:block;width:100%;height:100%;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}
.thc .thc-swatch.on{border-color:var(--ink)}
.thc .thc-swatch.off::after{content:'';position:absolute;left:50%;top:4px;bottom:4px;width:1.5px;background:var(--mute);transform:rotate(45deg)}
.thc-sizes{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.thc .thc-size{min-width:44px;height:36px;padding:0 10px;border:1px solid var(--line);background:#fff;color:var(--ink);font-size:14px}
.thc .thc-size:hover:not(:disabled){border-color:var(--ink)}
.thc .thc-size.on{border-color:var(--accent);background:var(--accent);color:#fff}
.thc-vwarn{margin:0 0 12px;font-size:12.5px;color:var(--red)}
.thc-vmsg{margin:0;font-size:14px;color:var(--mute)}
.thc-vactions{display:flex;gap:8px;justify-content:flex-end}
.thc .thc-vactions .thc-btn{padding:8px 14px;font-size:13px}
.thc-low{display:inline-block;margin-top:6px;font-size:12px;background:var(--warn);border:1px solid var(--warn-l);
padding:2px 8px}
.thc-price{font-size:14px;color:var(--mute)}
.thc-sub{font-weight:700;color:var(--ink)}
.thc-qty{display:inline-flex;border:1px solid var(--line);overflow:hidden;background:#fff}
.thc-qty button{width:32px;height:34px;border:0;background:#fff;font-size:17px;color:var(--ink)}
.thc-qty button:hover:not(:disabled){background:var(--sand)}
.thc-qty input{width:46px;height:34px;border:0;border-inline:1px solid var(--line);text-align:center;font:inherit;font-size:14px;
background:#fff;color:var(--ink)}
.thc-link-danger{background:none;border:0;color:var(--red);font-size:14px;padding:4px 6px;border-radius:6px}
.thc-link-danger:hover:not(:disabled){text-decoration:underline}
.thc-listfoot{display:flex;align-items:center;gap:12px;padding:14px 20px;font-size:14px}
.thc-listfoot .thc-link-danger{margin-left:auto}
.thc-check{position:relative;display:inline-flex;width:20px;height:20px}
.thc-check input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer}
.thc-check span{width:20px;height:20px;border:1.5px solid #8C857B;background:#fff;display:grid;place-items:center}
.thc-check input:checked+span{background:var(--accent);border-color:var(--accent)}
.thc-check input:checked+span::after{content:'';width:5px;height:10px;border:solid #fff;border-width:0 2px 2px 0;
transform:rotate(45deg) translate(-1px,-1px)}
.thc-check input:focus-visible+span{outline:2px solid var(--accent);outline-offset:2px}
.thc-sum{padding:20px;position:sticky;top:20px}
.thc-sum h2{margin:0 0 14px;font-size:19px;font-weight:700}
.thc-sum dl{margin:0 0 16px}
.thc-sum dl div{display:flex;justify-content:space-between;padding:8px 0;font-size:14px;color:var(--mute)}
.thc-sum dd{margin:0;color:var(--ink);font-weight:600}
.thc-sum .thc-total{border-top:1px dashed var(--line);margin-top:6px;padding-top:14px;color:var(--ink);font-weight:600}
.thc-sum .thc-total dd{font-size:21px;color:var(--ink)}
.thc-btn{border:1px solid var(--line);background:#fff;color:var(--ink);padding:10px 18px;font-weight:600;font-size:14px;letter-spacing:.04em}
.thc-btn-primary{background:var(--accent);border-color:var(--accent);color:#fff;text-transform:uppercase}
.thc-btn-primary:hover:not(:disabled){background:#6E1F1F}
.thc-btn-danger{background:var(--accent);border-color:var(--accent);color:#fff}
.thc-block{width:100%;padding:14px}
.thc-note{margin-top:14px;background:var(--warn);border:1px solid var(--warn-l);padding:10px 12px;font-size:13px;line-height:1.45}
.thc-empty{text-align:center;padding:56px 20px}
.thc-empty-mark{width:72px;height:72px;margin:0 auto 14px;border-radius:50%;background:var(--sand);display:grid;place-items:center;font-size:28px;font-weight:700}
.thc-empty h2{margin:0 0 6px;font-size:22px;font-weight:700}
.thc-empty p{margin:0 0 18px;color:var(--mute);font-size:14px}
.thc-overlay{position:fixed;inset:0;background:rgba(17,17,17,.45);display:grid;place-items:center;padding:16px;z-index:1300}
.thc-dialog{background:#fff;padding:24px;max-width:380px;width:100%}
.thc-dialog h3{margin:0 0 8px;font-size:18px}
.thc-dialog p{margin:0 0 20px;color:var(--mute);font-size:14px;line-height:1.5}
.thc-dialog-actions{display:flex;gap:10px;justify-content:flex-end}
/* Ảnh phủ kín ô 64x64, cắt phần thừa (ảnh dọc không bị kéo dài xuống dòng dưới) */
.thc-thumb img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:contain}
.thc-bad{display:inline-block;margin-top:6px;font-size:12px;color:var(--red);background:#F6E9E7;padding:2px 8px}
.thc-err{margin-bottom:16px;background:var(--warn);border:1px solid var(--warn-l);padding:10px 14px;font-size:14px}
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
