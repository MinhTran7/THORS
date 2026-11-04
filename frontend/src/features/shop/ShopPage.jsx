import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { Menu, MenuItem } from '@mui/material';
import { useAuth } from 'features/auth/AuthProvider';
import { STORE_NAME } from 'features/account/constants';
import { api } from 'services/http';
import heroImage from 'assets/images/auth/boutique-shopping.png';
import { money, priceText } from './ShopCommon';
import PendingCartHandler from './PendingCartHandler';
import './ShopPage.css';

/**
 * Trang chủ cửa hàng (đường dẫn '/') theo giao diện thời trang tối giản.
 * Trang tự vẽ header + footer riêng (OptionalLayout không bọc ThorsLayout ở '/').
 *  - Chưa tìm kiếm / chưa lọc: Hero, danh mục, hàng mới về, ưu đãi, toàn bộ sản phẩm.
 *  - Đang tìm kiếm: chỉ hiện lưới kết quả.
 * Dữ liệu: /shop/categories, /shop/products, /shop/promotions, /cart (khách đã đăng nhập).
 * Bấm vào sản phẩm mở trang chi tiết: /shop/products/:productId
 */

const SORTS = [
  ['newest', 'Mới nhất'],
  ['price_asc', 'Giá thấp đến cao'],
  ['price_desc', 'Giá cao đến thấp']
];
const PAGE_SIZE = 20;
const NEW_COUNT = 8;
const TILE_COLORS = ['#E4DDD3', '#D9D6D0', '#E8E1D6', '#DCD3C8'];

const scrollToId = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

/* ---------- Icon ---------- */

function Icon({ children, size = 20, stroke = 'currentColor', strokeWidth = 1.6 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      {children}
    </svg>
  );
}

/* ---------- Ảnh sản phẩm (có ảnh thì hiện ảnh, không thì chữ cái đầu) ---------- */

function ProductPhoto({ src, name, className = '', style }) {
  return (
    <div className={`fh-photo ${className}`} style={style}>
      {src ? <img src={src} alt={name} loading="lazy" /> : <span className="fh-photo__letter">{name?.charAt(0)}</span>}
    </div>
  );
}

/* ---------- Giỏ hàng ---------- */

function useCartCount(enabled) {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    try {
      const data = await api('/cart');
      setCount((data.items || []).length);
    } catch {
      // Không lấy được giỏ hàng thì giữ nguyên số hiện tại
    }
  }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    window.addEventListener('thors:cart-changed', refresh);
    return () => window.removeEventListener('thors:cart-changed', refresh);
  }, [enabled, refresh]);
  return enabled ? count : 0;
}

/* ---------- Header ---------- */

function StoreHeader({ account, categories, query, onSearch, onPickCategory }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const isCustomer = account?.role === 'CUSTOMER';
  const cartCount = useCartCount(isCustomer);
  const [searchOpen, setSearchOpen] = useState(Boolean(query));
  const [input, setInput] = useState(query);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => setInput(query), [query]);
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const submit = (e) => {
    e.preventDefault();
    onSearch(input.trim());
  };

  const go = (to) => {
    setMenuAnchor(null);
    navigate(to);
  };

  const signOut = async () => {
    setMenuAnchor(null);
    try {
      await logout();
    } finally {
      navigate('/', { replace: true });
    }
  };

  return (
    <header className="fh-header">
      <div className="fh-container fh-header__inner">
        <nav aria-label="Danh mục chính" className="fh-header__nav">
          <a href="#moi" onClick={(e) => { e.preventDefault(); scrollToId('moi'); }}>
            Hàng mới
          </a>
          {categories.slice(0, 4).map((c) => (
            <a key={c.categoryId} href="#tat-ca" onClick={(e) => { e.preventDefault(); onPickCategory(c.categoryId); }}>
              {c.categoryName}
            </a>
          ))}
          <a href="#uu-dai" className="fh-accent" onClick={(e) => { e.preventDefault(); scrollToId('uu-dai'); }}>
            Sale
          </a>
        </nav>

        <RouterLink to="/" className="fh-logo" onClick={() => onSearch('')}>
          {STORE_NAME.toUpperCase()}
        </RouterLink>

        <div className="fh-header__actions">
          <button type="button" className="fh-icon-btn" aria-label="Tìm kiếm" aria-expanded={searchOpen} onClick={() => setSearchOpen((v) => !v)}>
            <Icon>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </Icon>
          </button>

          {account ? (
            <>
              <button
                type="button"
                className="fh-icon-btn"
                aria-label="Tài khoản"
                aria-haspopup="menu"
                aria-expanded={Boolean(menuAnchor)}
                onClick={(e) => setMenuAnchor(e.currentTarget)}
              >
                <Icon>
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
                </Icon>
              </button>
              <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
                {isCustomer
                  ? [
                      <MenuItem key="p" onClick={() => go('/profile')}>
                        Tài khoản của tôi
                      </MenuItem>,
                      <MenuItem key="o" onClick={() => go('/orders')}>
                        Đơn hàng
                      </MenuItem>,
                      <MenuItem key="a" onClick={() => go('/addresses')}>
                        Địa chỉ giao hàng
                      </MenuItem>,
                      <MenuItem key="n" onClick={() => go('/notifications')}>
                        Thông báo
                      </MenuItem>
                    ]
                  : [
                      <MenuItem key="w" onClick={() => go('/workspace')}>
                        Trang quản lý
                      </MenuItem>,
                      <MenuItem key="p" onClick={() => go('/profile')}>
                        Tài khoản
                      </MenuItem>
                    ]}
                <MenuItem onClick={signOut}>Đăng xuất</MenuItem>
              </Menu>
            </>
          ) : (
            <RouterLink to="/login" className="fh-header__login">
              Đăng nhập
            </RouterLink>
          )}

          {(isCustomer || !account) && (
            <RouterLink
              to={isCustomer ? '/cart' : '/login'}
              className="fh-icon-btn fh-cart-btn"
              aria-label={isCustomer ? `Giỏ hàng, ${cartCount} sản phẩm` : 'Đăng nhập để xem giỏ hàng'}
            >
              <Icon>
                <path d="M5 8h14l-1 12H6L5 8z" />
                <path d="M9 8V6a3 3 0 0 1 6 0v2" />
              </Icon>
              ({cartCount})
            </RouterLink>
          )}
        </div>
      </div>

      {searchOpen && (
        <div className="fh-searchbar">
          <form className="fh-container fh-searchbar__form" onSubmit={submit} role="search">
            <label htmlFor="fh-search" className="fh-sr-only">
              Tìm sản phẩm
            </label>
            <input id="fh-search" ref={searchRef} type="search" placeholder="Tìm sản phẩm..." value={input} onChange={(e) => setInput(e.target.value)} />
            <button type="submit">TÌM</button>
          </form>
        </div>
      )}
    </header>
  );
}

/* ---------- Các khối nội dung ---------- */

function SectionHead({ title, children }) {
  return (
    <div className="fh-section-head">
      <h2 className="fh-h2">{title}</h2>
      {children}
    </div>
  );
}

function Hero() {
  return (
    <section className="fh-container fh-hero-wrap">
      <div className="fh-hero">
        <div className="fh-hero__text">
          <p className="fh-eyebrow">Bộ sưu tập mới</p>
          <h1 className="fh-hero__title">
            Mặc chậm.
            <br />
            <em>Mặc lâu.</em>
          </h1>
          <p className="fh-hero__lead">Những thiết kế tối giản, chất liệu bền đẹp — để tủ đồ của bạn ít hơn nhưng đúng hơn.</p>
          <div className="fh-hero__ctas">
            <a href="#moi" className="fh-btn fh-btn--dark" onClick={(e) => { e.preventDefault(); scrollToId('moi'); }}>
              MUA NGAY
            </a>
            <a href="#tat-ca" className="fh-btn fh-btn--outline" onClick={(e) => { e.preventDefault(); scrollToId('tat-ca'); }}>
              XEM TẤT CẢ
            </a>
          </div>
        </div>
        <div className="fh-hero__media">
          <img src={heroImage} alt="" />
        </div>
      </div>
    </section>
  );
}

function Categories({ categories, onPick }) {
  if (categories.length === 0) return null;
  return (
    <section id="danh-muc" className="fh-container fh-section">
      <SectionHead title="Mua theo danh mục">
        <a href="#tat-ca" className="fh-link-sm" onClick={(e) => { e.preventDefault(); onPick(0); }}>
          Xem tất cả
        </a>
      </SectionHead>
      <div className="fh-row">
        {categories.slice(0, 4).map((c, i) => (
          <button key={c.categoryId} type="button" className="fh-cat" onClick={() => onPick(c.categoryId)}>
            <span className="fh-cat__img" style={{ background: TILE_COLORS[i % TILE_COLORS.length] }}>
              <span className="fh-cat__letter">{c.categoryName.charAt(0)}</span>
            </span>
            <span className="fh-cat__name">{c.categoryName}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ProductCard({ product, promo, isNew }) {
  const outOfStock = Number(product.totalStock) === 0;
  return (
    <RouterLink to={`/shop/products/${product.productId}`} className="fh-product">
      <div className="fh-product__img">
        <ProductPhoto src={product.imageUrl} name={product.productName} />
        {outOfStock ? (
          <span className="fh-badge fh-badge--muted">HẾT HÀNG</span>
        ) : promo ? (
          <span className="fh-badge fh-badge--sale">{promo.discountLabel}</span>
        ) : (
          isNew && <span className="fh-badge">MỚI</span>
        )}
      </div>
      <div className="fh-product__info">
        <span className="fh-product__name">{product.productName}</span>
        {promo ? (
          <span className="fh-product__prices">
            <span className="fh-price fh-price--sale">
              {Number(product.maxPrice) > Number(product.minPrice) ? 'Từ ' : ''}
              {money(promo.salePrice)}
            </span>
            <span className="fh-price--old">{money(product.minPrice)}</span>
          </span>
        ) : (
          <span className="fh-price">{priceText(product.minPrice, product.maxPrice)}</span>
        )}
      </div>
    </RouterLink>
  );
}

function NewArrivals({ items, promoMap }) {
  const trackRef = useRef(null);
  if (items.length === 0) return null;

  const scroll = (dir) => {
    const el = trackRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <section id="moi" className="fh-container fh-section">
      <SectionHead title="Hàng mới về">
        <div className="fh-arrows">
          <button type="button" className="fh-arrow" aria-label="Sản phẩm trước" onClick={() => scroll(-1)}>
            <Icon size={18}>
              <path d="M15 5l-7 7 7 7" />
            </Icon>
          </button>
          <button type="button" className="fh-arrow fh-arrow--dark" aria-label="Sản phẩm tiếp theo" onClick={() => scroll(1)}>
            <Icon size={18} stroke="#FFFFFF">
              <path d="M9 5l7 7-7 7" />
            </Icon>
          </button>
        </div>
      </SectionHead>
      <div className="fh-track" ref={trackRef}>
        {items.map((p) => (
          <ProductCard key={p.productId} product={p} promo={promoMap.get(p.productId)} isNew />
        ))}
      </div>
    </section>
  );
}

function PromoBanner({ promos }) {
  if (promos.length === 0) return null;
  const top = promos[0];
  const best = promos.reduce((acc, p) => Math.max(acc, parseInt(String(p.discountLabel).replace(/\D/g, ''), 10) || 0), 0);
  return (
    <section id="uu-dai" className="fh-container fh-section">
      <div className="fh-promo">
        <div className="fh-promo__media">
          <ProductPhoto src={top.imageUrl} name={top.productName} className="fh-photo--dark" />
        </div>
        <div className="fh-promo__text">
          <p className="fh-eyebrow fh-eyebrow--light">Ưu đãi có hạn</p>
          <h2 className="fh-promo__title">{best > 0 ? `Giảm đến ${best}%` : top.promotionName}</h2>
          <p className="fh-promo__desc">
            {top.promotionName} — áp dụng cho {promos.length} sản phẩm đang khuyến mãi.
          </p>
          <div>
            <RouterLink to={`/shop/products/${top.productId}`} className="fh-btn fh-btn--light">
              MUA ƯU ĐÃI
            </RouterLink>
          </div>
        </div>
      </div>
    </section>
  );
}

const BENEFITS = [
  {
    title: 'Giao hàng tận nơi',
    desc: 'Giao toàn quốc, theo dõi đơn dễ dàng',
    icon: (
      <>
        <path d="M3 7h11v9H3z" />
        <path d="M14 10h4l3 3v3h-7" />
        <circle cx="7" cy="17.5" r="1.5" />
        <circle cx="17" cy="17.5" r="1.5" />
      </>
    )
  },
  {
    title: 'Đổi trả dễ dàng',
    desc: 'Gửi yêu cầu đổi trả ngay trong đơn hàng',
    icon: (
      <>
        <path d="M4 12a8 8 0 1 0 2.3-5.7" />
        <path d="M4 4v4h4" />
      </>
    )
  },
  {
    title: 'Thanh toán linh hoạt',
    desc: 'COD hoặc chuyển khoản VietQR',
    icon: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="1" />
        <path d="M3 10h18" />
      </>
    )
  },
  { title: 'Tư vấn size miễn phí', desc: 'Nhắn cho cửa hàng bất cứ lúc nào', icon: <path d="M4 5h16v11H8l-4 4z" /> }
];

function Benefits() {
  return (
    <section className="fh-container fh-benefits-wrap">
      <div className="fh-benefits">
        {BENEFITS.map((b) => (
          <div key={b.title} className="fh-benefit">
            <Icon size={28} strokeWidth={1.4}>
              {b.icon}
            </Icon>
            <div>
              <div className="fh-benefit__title">{b.title}</div>
              <div className="fh-benefit__desc">{b.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StoreFooter({ categories, onPickCategory }) {
  return (
    <footer className="fh-footer">
      <div className="fh-container fh-footer__inner">
        <div className="fh-footer__cols">
          <div className="fh-footer__brand">
            <div className="fh-footer__logo">{STORE_NAME.toUpperCase()}</div>
            <p>Thời trang tối giản, chất liệu bền đẹp — giao tận nhà.</p>
          </div>
          <nav aria-label="Mua sắm" className="fh-footer__col">
            <div className="fh-footer__col-title">Mua sắm</div>
            <a href="#moi" onClick={(e) => { e.preventDefault(); scrollToId('moi'); }}>
              Hàng mới
            </a>
            {categories.slice(0, 4).map((c) => (
              <a key={c.categoryId} href="#tat-ca" onClick={(e) => { e.preventDefault(); onPickCategory(c.categoryId); }}>
                {c.categoryName}
              </a>
            ))}
          </nav>
          <nav aria-label="Tài khoản" className="fh-footer__col">
            <div className="fh-footer__col-title">Tài khoản</div>
            <RouterLink to="/orders">Tra cứu đơn hàng</RouterLink>
            <RouterLink to="/cart">Giỏ hàng</RouterLink>
            <RouterLink to="/addresses">Địa chỉ giao hàng</RouterLink>
            <RouterLink to="/profile">Thông tin cá nhân</RouterLink>
          </nav>
        </div>
        <div className="fh-footer__bottom">
          <span>
            © {new Date().getFullYear()} {STORE_NAME}. Bảo lưu mọi quyền.
          </span>
          <span>Điều khoản · Chính sách bảo mật</span>
        </div>
      </div>
    </footer>
  );
}

/* ---------- Trang ---------- */

export default function ShopPage() {
  const auth = useAuth();
  const account = auth?.account;
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';

  const [categories, setCategories] = useState([]);
  const [newest, setNewest] = useState([]);
  const [promos, setPromos] = useState([]);

  const [categoryId, setCategoryId] = useState(0);
  const [sort, setSort] = useState('newest');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dữ liệu cho các khối trang chủ (tải một lần)
  useEffect(() => {
    api('/shop/categories')
      .then((d) => setCategories(d.items || []))
      .catch(() => setCategories([]));
    api(`/shop/products?page=0&size=${NEW_COUNT}&sort=newest`)
      .then((d) => setNewest(d.items || []))
      .catch(() => setNewest([]));
    api('/shop/promotions?size=20')
      .then((d) => setPromos(d.items || []))
      .catch(() => setPromos([]));
  }, []);

  const promoMap = useMemo(() => new Map(promos.map((p) => [p.productId, p])), [promos]);

  // Lưới toàn bộ sản phẩm (tìm kiếm, lọc danh mục, sắp xếp, xem thêm)
  const load = useCallback(
    async (pageNo, replace) => {
      setLoading(true);
      setError('');
      try {
        const q = new URLSearchParams({ page: pageNo, size: PAGE_SIZE, sort });
        if (query) q.set('q', query);
        if (categoryId) q.set('categoryId', categoryId);
        const data = await api(`/shop/products?${q}`);
        setItems((prev) => (replace ? data.items : [...prev, ...data.items]));
        setTotal(data.total);
        setPage(pageNo);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [query, categoryId, sort]
  );

  useEffect(() => {
    load(0, true);
  }, [load]);

  const onSearch = (text) => {
    setParams(text ? { q: text } : {});
    if (text) setCategoryId(0);
  };

  const pickCategory = (id) => {
    setCategoryId(id);
    setTimeout(() => scrollToId('tat-ca'), 0);
  };

  const gridTitle = query
    ? `Kết quả cho “${query}”`
    : categoryId
      ? categories.find((c) => c.categoryId === categoryId)?.categoryName || 'Sản phẩm'
      : 'Tất cả sản phẩm';

  return (
    <div className="fh-root">
      <div className="fh-announce">Giao hàng toàn quốc — Thanh toán khi nhận hàng hoặc chuyển khoản</div>
      <StoreHeader account={account} categories={categories} query={query} onSearch={onSearch} onPickCategory={pickCategory} />

      <main>
        {!query && (
          <>
            <Hero />
            <Categories categories={categories} onPick={pickCategory} />
            <NewArrivals items={newest} promoMap={promoMap} />
            <PromoBanner promos={promos} />
          </>
        )}

        <section id="tat-ca" className="fh-container fh-section">
          <SectionHead title={gridTitle}>
            {query ? (
              <button type="button" className="fh-link-btn" onClick={() => onSearch('')}>
                Xóa tìm kiếm ({total} kết quả)
              </button>
            ) : (
              <label className="fh-sort">
                <span className="fh-sr-only">Sắp xếp</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  {SORTS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </SectionHead>

          {!query && categories.length > 0 && (
            <div className="fh-chips" role="group" aria-label="Lọc theo danh mục">
              <button type="button" className="fh-chip" aria-pressed={categoryId === 0} onClick={() => setCategoryId(0)}>
                Tất cả
              </button>
              {categories.map((c) => (
                <button key={c.categoryId} type="button" className="fh-chip" aria-pressed={categoryId === c.categoryId} onClick={() => setCategoryId(c.categoryId)}>
                  {c.categoryName}
                </button>
              ))}
            </div>
          )}

          {error && <p className="fh-error">{error}</p>}

          {!loading && !error && items.length === 0 && (
            <div className="fh-empty">
              <p className="fh-empty__title">Không tìm thấy sản phẩm</p>
              <p>Thử từ khóa khác hoặc chọn danh mục khác.</p>
            </div>
          )}

          <div className="fh-grid">
            {items.map((p) => (
              <ProductCard key={p.productId} product={p} promo={promoMap.get(p.productId)} />
            ))}
          </div>

          {loading && items.length === 0 && <p className="fh-muted">Đang tải sản phẩm...</p>}

          {items.length < total && (
            <div className="fh-more">
              <button type="button" className="fh-btn fh-btn--outline" disabled={loading} onClick={() => load(page + 1, false)}>
                {loading ? 'ĐANG TẢI...' : 'XEM THÊM'}
              </button>
            </div>
          )}
        </section>

        <Benefits />
      </main>

      <StoreFooter categories={categories} onPickCategory={pickCategory} />

      {account?.role === 'CUSTOMER' && <PendingCartHandler />}
    </div>
  );
}
