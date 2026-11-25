import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Box } from '@mui/material';
import { api } from 'services/http';
import { categoryTree, money, priceText } from './ShopCommon';
import { C, Icon, focusRing } from './storeTheme';
import ImageSearchButton from 'features/imagesearch/ImageSearchButton';

/**
 * Thanh tìm kiếm trên header cửa hàng (kiểu Santino):
 *  - Bên trái chọn danh mục, giữa là ô nhập, bên phải nút tìm tròn.
 *  - Bấm vào ô: xổ danh sách sản phẩm mới; gõ chữ: gợi ý sản phẩm khớp tên (ảnh, tên, giá).
 *  - Mũi tên lên/xuống để chọn gợi ý, Enter mở sản phẩm (không chọn gợi ý thì sang trang kết quả), Esc đóng.
 */

const LIMIT = 8;
const cache = new Map(); // nhớ kết quả theo (từ khóa, danh mục) để gõ lại không phải chờ
let promoRequest = null; // khuyến mãi chỉ tải một lần

function fetchSuggestions(q, categoryId) {
  const key = `${q}|${categoryId}`;
  if (!cache.has(key)) {
    const qs = new URLSearchParams({ page: '0', size: String(LIMIT), sort: 'newest' });
    if (q) qs.set('q', q);
    if (categoryId) qs.set('categoryId', categoryId);
    cache.set(
      key,
      api(`/shop/products?${qs}`)
        .then((d) => d.items || [])
        .catch((e) => {
          cache.delete(key);
          throw e;
        })
    );
  }
  return cache.get(key);
}

function fetchPromos() {
  if (!promoRequest) {
    promoRequest = api('/shop/promotions?size=50')
      .then((d) => new Map((d.items || []).map((p) => [p.productId, p])))
      .catch(() => new Map());
  }
  return promoRequest;
}

// Đường đi từ gốc tới danh mục id (để tự mở các danh mục cha của mục đang chọn)
function pathTo(nodes, id, trail = []) {
  for (const n of nodes) {
    const next = [...trail, n.categoryId];
    if (String(n.categoryId) === String(id)) return next;
    const found = pathTo(n.children, id, next);
    if (found.length) return found;
  }
  return [];
}

function findName(nodes, id) {
  for (const n of nodes) {
    if (String(n.categoryId) === String(id)) return n.categoryName;
    const found = findName(n.children, id);
    if (found) return found;
  }
  return '';
}

const rowSx = (depth, selected) => ({
  flex: 1,
  minWidth: 0,
  py: 1,
  pl: 2 + depth * 2.5,
  pr: 1,
  border: 0,
  bgcolor: 'transparent',
  textAlign: 'left',
  font: 'inherit',
  fontSize: 15,
  fontWeight: depth === 0 ? 600 : 400,
  color: selected ? C.primary : depth === 0 ? C.ink : C.muted,
  cursor: 'pointer',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  '&:hover': { color: C.primary },
  ...focusRing
});

// Một danh mục trong cây: bấm tên để chọn, bấm mũi tên để xem danh mục con (giống bộ lọc ở trang danh sách)
function CategoryRow({ node, depth, selectedId, expanded, onToggle, onPick }) {
  const hasKids = node.children.length > 0;
  const open = expanded.has(node.categoryId);
  const selected = String(selectedId) === String(node.categoryId);
  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', pr: 1 }}>
        <Box component="button" type="button" aria-current={selected || undefined} onClick={() => onPick(node.categoryId)} sx={rowSx(depth, selected)}>
          {node.categoryName}
        </Box>
        {hasKids && (
          <Box
            component="button"
            type="button"
            aria-label={`${open ? 'Thu gọn' : 'Xem'} danh mục con của ${node.categoryName}`}
            aria-expanded={open}
            onClick={() => onToggle(node.categoryId)}
            sx={{
              width: 32,
              height: 32,
              p: 0,
              border: 0,
              bgcolor: 'transparent',
              color: C.muted,
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              '&:hover': { color: C.ink },
              ...focusRing
            }}
          >
            <Box component="span" sx={{ display: 'flex', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
              <Icon size={16}>
                <path d="M6 9l6 6 6-6" />
              </Icon>
            </Box>
          </Box>
        )}
      </Box>
      {hasKids && open && (
        <Box component="ul" sx={{ m: 0, p: 0 }}>
          {node.children.map((child) => (
            <CategoryRow key={child.categoryId} node={child} depth={depth + 1} selectedId={selectedId} expanded={expanded} onToggle={onToggle} onPick={onPick} />
          ))}
        </Box>
      )}
    </Box>
  );
}

// Nút chọn danh mục bên trái thanh tìm kiếm + bảng cây danh mục xổ xuống
function CategoryPicker({ categories, value, onChange, onOpen }) {
  const tree = useMemo(() => categoryTree(categories), [categories]);
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const label = (value && findName(tree, value)) || 'Tất cả danh mục';

  // Mở bảng: tự xổ các danh mục cha của mục đang chọn
  const show = () => {
    const path = pathTo(tree, value);
    if (path.length > 1) setExpanded((prev) => new Set([...prev, ...path.slice(0, -1)]));
    setOpen(true);
    onOpen?.();
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pick = (id) => {
    onChange(id === '' ? '' : String(id));
    setOpen(false);
  };

  return (
    <Box ref={ref} sx={{ position: 'relative', display: { xs: 'none', sm: 'block' }, flexShrink: 0 }}>
      <Box
        component="button"
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Danh mục tìm kiếm: ${label}`}
        onClick={() => (open ? setOpen(false) : show())}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          height: 40,
          maxWidth: 220,
          pl: 2,
          pr: 1.5,
          border: 0,
          borderRadius: 999,
          bgcolor: '#FFFFFF',
          font: 'inherit',
          fontSize: 14,
          fontWeight: 600,
          color: C.ink,
          cursor: 'pointer',
          ...focusRing
        }}
      >
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </Box>
        <Box component="span" sx={{ display: 'flex', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
          <Icon size={16}>
            <path d="M6 9l6 6 6-6" />
          </Icon>
        </Box>
      </Box>

      {open && (
        <Box
          sx={{
            position: 'absolute',
            top: 'calc(100% + 14px)',
            left: -8,
            zIndex: 45,
            width: 300,
            maxHeight: 'min(480px, 65vh)',
            overflowY: 'auto',
            py: 1,
            bgcolor: '#FFFFFF',
            borderRadius: '16px',
            border: `1px solid ${C.line}`,
            boxShadow: '0 18px 40px rgba(0,0,0,.14)'
          }}
        >
          <Box sx={{ display: 'flex', pr: 1 }}>
            <Box component="button" type="button" aria-current={!value || undefined} onClick={() => pick('')} sx={{ ...rowSx(0, !value), fontWeight: 400, color: !value ? C.primary : C.ink }}>
              Tất cả danh mục
            </Box>
          </Box>
          <Box component="ul" sx={{ m: 0, p: 0 }}>
            {tree.map((node) => (
              <CategoryRow key={node.categoryId} node={node} depth={0} selectedId={value} expanded={expanded} onToggle={toggle} onPick={pick} />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function SuggestionPrice({ product, promo }) {
  if (!promo) return <Box component="span">{priceText(product.minPrice, product.maxPrice)}</Box>;
  return (
    <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1 }}>
      <Box component="span" sx={{ color: '#8C857B', textDecoration: 'line-through', fontWeight: 400 }}>
        {money(product.minPrice)}
      </Box>
      <Box component="span" sx={{ color: C.accent }}>
        {Number(product.maxPrice) > Number(product.minPrice) ? 'Từ ' : ''}
        {money(promo.salePrice)}
      </Box>
    </Box>
  );
}

export default function StoreSearch({ categories = [], initialQuery = '', autoFocus = false, onClose }) {
  const navigate = useNavigate();
  const listId = useId();
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [input, setInput] = useState(initialQuery);
  const [categoryId, setCategoryId] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const [promos, setPromos] = useState(() => new Map());
  const q = input.trim();

  useEffect(() => setInput(initialQuery), [initialQuery]);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Tải gợi ý khi đang mở; chờ người dùng ngừng gõ 250ms rồi mới gọi API
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setLoading(true);
    setFailed(false);
    const timer = setTimeout(
      () => {
        Promise.all([fetchSuggestions(q, categoryId), fetchPromos()])
          .then(([list, promoMap]) => {
            if (!alive) return;
            setItems(list);
            setPromos(promoMap);
            setActive(-1);
          })
          .catch(() => alive && (setItems([]), setFailed(true)))
          .finally(() => alive && setLoading(false));
      },
      q ? 250 : 0
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, q, categoryId]);

  // Bấm ra ngoài thì đóng danh sách gợi ý
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const resultsUrl = () => {
    const path = `/shop/category/${categoryId || 'all'}`;
    return q ? `${path}?q=${encodeURIComponent(q)}` : path;
  };

  // Tìm xong / mở sản phẩm: đóng gợi ý và thanh tìm kiếm
  const finish = (to) => {
    setOpen(false);
    onClose?.();
    navigate(to);
  };
  const goProduct = (product) => finish(`/shop/products/${product.productId}`);

  const submit = (e) => {
    e.preventDefault();
    if (open && active >= 0 && items[active]) return goProduct(items[active]);
    finish(resultsUrl());
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (items.length ? (i + 1) % items.length : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (items.length ? (i <= 0 ? items.length - 1 : i - 1) : -1));
    } else if (e.key === 'Escape') {
      // Esc lần 1 đóng gợi ý, lần 2 đóng thanh tìm kiếm
      if (open) setOpen(false);
      else onClose?.();
    }
  };

  const optionId = (i) => `${listId}-opt-${i}`;
  const showPanel = open;

  return (
    <Box ref={rootRef} sx={{ position: 'relative', width: '100%', maxWidth: 960, mx: 'auto' }}>
      <Box
        component="form"
        role="search"
        onSubmit={submit}
        sx={{
          display: 'flex',
          alignItems: 'center',
          height: 52,
          bgcolor: '#F3F1EE',
          borderRadius: 999,
          pl: { xs: 0.5, sm: 1 },
          pr: 0.5,
          '&:focus-within': { boxShadow: `0 0 0 2px ${C.primary}` }
        }}
      >
        {/* Chọn danh mục để tìm trong đó (cây danh mục, bấm mũi tên để xem danh mục con) */}
        <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} onOpen={() => setOpen(false)} />

        <Box
          component="input"
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Tìm tên sản phẩm"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-activedescendant={showPanel && active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          placeholder="Tìm tên sản phẩm"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          sx={{
            flex: 1,
            minWidth: 0,
            height: '100%',
            border: 0,
            outline: 'none',
            bgcolor: 'transparent',
            px: 2,
            font: 'inherit',
            fontSize: 15,
            color: C.ink,
            '&::placeholder': { color: '#8C857B' },
            '&::-webkit-search-cancel-button': { display: 'none' }
          }}
        />

        {/* Tìm bằng ảnh (chỉ hiện khi backend bật tính năng) */}
        <ImageSearchButton sx={{ flexShrink: 0, width: 44, height: 44, borderRadius: '50%', mr: 0.5, '&:hover': { bgcolor: '#E4E0DA' } }} />

        <Box
          component="button"
          type="submit"
          aria-label="Tìm kiếm"
          sx={{
            flexShrink: 0,
            width: 44,
            height: 44,
            border: 0,
            borderRadius: '50%',
            bgcolor: '#E4E0DA',
            color: C.ink,
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            '&:hover': { bgcolor: C.primary, color: '#FFFFFF' },
            ...focusRing
          }}
        >
          <Icon size={20}>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </Icon>
        </Box>
      </Box>

      {/* Danh sách gợi ý */}
      {showPanel && (
        <Box
          sx={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            zIndex: 40,
            bgcolor: '#FFFFFF',
            borderRadius: '16px',
            boxShadow: '0 18px 40px rgba(0,0,0,.14)',
            border: `1px solid ${C.line}`,
            maxHeight: 'min(560px, 70vh)',
            overflowY: 'auto',
            py: 1
          }}
        >
          <Box sx={{ px: 2.5, pt: 1, pb: 0.5, fontSize: 13, fontWeight: 600, color: '#8C857B', letterSpacing: '0.04em' }}>
            {q ? `GỢI Ý CHO “${q.toUpperCase()}”` : 'SẢN PHẨM MỚI'}
          </Box>

          {loading && items.length === 0 ? (
            <Box sx={{ px: 2.5, py: 3, fontSize: 14, color: '#8C857B' }}>Đang tìm…</Box>
          ) : failed ? (
            <Box sx={{ px: 2.5, py: 3, fontSize: 14, color: '#8C857B' }}>Không tải được gợi ý. Bạn vẫn có thể nhấn Enter để tìm.</Box>
          ) : items.length === 0 ? (
            <Box sx={{ px: 2.5, py: 3, fontSize: 14, color: '#8C857B' }}>Không tìm thấy sản phẩm phù hợp.</Box>
          ) : (
            <Box component="ul" id={listId} role="listbox" aria-label="Gợi ý sản phẩm" sx={{ listStyle: 'none', m: 0, p: 0, opacity: loading ? 0.6 : 1 }}>
              {items.map((p, i) => (
                <Box
                  component="li"
                  key={p.productId}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()} // giữ con trỏ trong ô nhập
                  onClick={() => goProduct(p)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    px: 2.5,
                    py: 1.25,
                    cursor: 'pointer',
                    bgcolor: i === active ? '#F6F4F1' : 'transparent'
                  }}
                >
                  <Box sx={{ position: 'relative', width: 64, height: 80, flexShrink: 0, bgcolor: C.photo, overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
                    {p.imageUrl ? (
                      <Box component="img" src={p.imageUrl} alt="" loading="lazy" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <Box component="span" sx={{ fontSize: 24, color: '#B5AFA6' }}>
                        {p.productName?.charAt(0)}
                      </Box>
                    )}
                  </Box>
                  <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Box
                      component="span"
                      sx={{
                        fontSize: 16,
                        color: i === active ? C.accent : C.ink,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {p.productName}
                    </Box>
                    <Box component="span" sx={{ fontSize: 15, fontWeight: 600, color: C.ink }}>
                      <SuggestionPrice product={p} promo={promos.get(p.productId)} />
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          )}

          {q && (
            <Box
              component={RouterLink}
              to={resultsUrl()}
              onClick={() => {
                setOpen(false);
                onClose?.();
              }}
              sx={{
                display: 'block',
                mx: 2.5,
                mt: 1,
                mb: 0.5,
                py: 1.5,
                borderTop: `1px solid ${C.line}`,
                fontSize: 14,
                fontWeight: 600,
                color: C.ink,
                textDecoration: 'none',
                '&:hover': { color: C.accent },
                ...focusRing
              }}
            >
              Xem tất cả kết quả cho “{q}” →
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
