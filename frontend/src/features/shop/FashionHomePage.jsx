import { useRef, useState } from 'react';
import './FashionHomePage.css';

/**
 * Trang chủ cửa hàng thời trang (chuyển từ homepage-thoi-trang.html sang React).
 * Các giá trị trong [NGOẶC VUÔNG] là chỗ cần thay bằng dữ liệu thật.
 */

const BRAND = 'TÊN THƯƠNG HIỆU';

const NAV_LINKS = [
  { label: 'Hàng mới', href: '#moi' },
  { label: 'Nữ', href: '#danhmuc' },
  { label: 'Nam', href: '#danhmuc' },
  { label: 'Phụ kiện', href: '#danhmuc' },
  { label: 'Bộ sưu tập', href: '#bst' },
  { label: 'Sale', href: '#moi', accent: true }
];

const CATEGORIES = [
  { name: 'Thời trang nữ', bg: '#E4DDD3' },
  { name: 'Thời trang nam', bg: '#D9D6D0' },
  { name: 'Túi & ví', bg: '#E8E1D6' },
  { name: 'Giày & phụ kiện', bg: '#DCD3C8' }
];

const PRODUCTS = [
  { id: 1, name: 'Áo sơ mi linen dáng rộng', price: '[GIÁ]', bg: '#EEEAE4', badge: 'new', colors: ['#F2EEE6', '#2F3A4A', '#6B5A45'] },
  { id: 2, name: 'Quần âu ống suông', price: '[GIÁ]', bg: '#E7E3DD', colors: ['#1C1C1C', '#9C8F7D'] },
  {
    id: 3,
    name: 'Túi tote da mềm',
    price: '[GIÁ SALE]',
    oldPrice: '[GIÁ GỐC]',
    bg: '#EDE6DC',
    badge: 'sale',
    discount: '-[X]%',
    colors: ['#5A3A28', '#1C1C1C', '#CBB89C']
  },
  { id: 4, name: 'Áo khoác len dệt kim', price: '[GIÁ]', bg: '#E3E0DA', colors: ['#B9A68A', '#4B4F3A'] }
];

const BENEFITS = [
  {
    title: 'Giao hàng miễn phí',
    desc: 'Cho đơn từ [GIÁ TRỊ ĐƠN]',
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
    desc: 'Trong vòng [SỐ NGÀY] ngày',
    icon: (
      <>
        <path d="M4 12a8 8 0 1 0 2.3-5.7" />
        <path d="M4 4v4h4" />
      </>
    )
  },
  {
    title: 'Thanh toán linh hoạt',
    desc: 'COD, chuyển khoản, ví điện tử',
    icon: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="1" />
        <path d="M3 10h18" />
      </>
    )
  },
  { title: 'Tư vấn size miễn phí', desc: 'Hotline [SỐ ĐIỆN THOẠI]', icon: <path d="M4 5h16v11H8l-4 4z" /> }
];

const FOOTER_COLUMNS = [
  {
    title: 'Mua sắm',
    links: [
      { label: 'Hàng mới', href: '#moi' },
      { label: 'Nữ', href: '#danhmuc' },
      { label: 'Nam', href: '#danhmuc' },
      { label: 'Phụ kiện', href: '#danhmuc' }
    ]
  },
  {
    title: 'Hỗ trợ',
    links: [
      { label: 'Hướng dẫn chọn size', href: '#' },
      { label: 'Chính sách đổi trả', href: '#' },
      { label: 'Tra cứu đơn hàng', href: '#' },
      { label: 'Câu hỏi thường gặp', href: '#' }
    ]
  },
  {
    title: 'Về chúng tôi',
    links: [
      { label: 'Câu chuyện thương hiệu', href: '#' },
      { label: 'Hệ thống cửa hàng', href: '#' },
      { label: 'Tuyển dụng', href: '#' }
    ]
  }
];

/* ---------- Icon ---------- */

function Icon({ children, size = 20, stroke = '#111111', strokeWidth = 1.6 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      {children}
    </svg>
  );
}

const HeartPath = () => <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />;

/* ---------- Sections ---------- */

function AnnouncementBar() {
  return <div className="fh-announce">Miễn phí giao hàng cho đơn từ [GIÁ TRỊ ĐƠN] — Đổi trả trong [SỐ NGÀY] ngày</div>;
}

function Header({ cartCount }) {
  return (
    <header className="fh-header">
      <div className="fh-container fh-header__inner">
        <nav aria-label="Danh mục chính" className="fh-header__nav">
          {NAV_LINKS.map((l) => (
            <a key={l.label} href={l.href} className={l.accent ? 'fh-accent' : undefined}>
              {l.label}
            </a>
          ))}
        </nav>
        <a href="#" className="fh-logo">
          {BRAND}
        </a>
        <div className="fh-header__actions">
          <button type="button" className="fh-icon-btn" aria-label="Tìm kiếm">
            <Icon>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </Icon>
          </button>
          <button type="button" className="fh-icon-btn" aria-label="Tài khoản">
            <Icon>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
            </Icon>
          </button>
          <button type="button" className="fh-icon-btn" aria-label="Yêu thích">
            <Icon>
              <HeartPath />
            </Icon>
          </button>
          <button type="button" className="fh-icon-btn fh-cart-btn" aria-label={`Giỏ hàng, ${cartCount} sản phẩm`}>
            <Icon>
              <path d="M5 8h14l-1 12H6L5 8z" />
              <path d="M9 8V6a3 3 0 0 1 6 0v2" />
            </Icon>
            ({cartCount})
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="bst" className="fh-container fh-hero-wrap">
      <div className="fh-hero">
        <div className="fh-hero__text">
          <p className="fh-eyebrow">Bộ sưu tập Thu Đông</p>
          <h1 className="fh-hero__title">
            Mặc chậm.
            <br />
            <em>Mặc lâu.</em>
          </h1>
          <p className="fh-hero__lead">Những thiết kế tối giản, chất liệu bền đẹp — để tủ đồ của bạn ít hơn nhưng đúng hơn.</p>
          <div className="fh-hero__ctas">
            <a href="#moi" className="fh-btn fh-btn--dark">
              MUA NGAY
            </a>
            <a href="#bst" className="fh-btn fh-btn--outline">
              XEM LOOKBOOK
            </a>
          </div>
        </div>
        <div className="fh-hero__media">
          <span className="fh-placeholder fh-placeholder--chip">[ẢNH HERO — người mẫu mặc trang phục bộ sưu tập mới]</span>
        </div>
      </div>
    </section>
  );
}

function SectionHead({ title, children }) {
  return (
    <div className="fh-section-head">
      <h2 className="fh-h2">{title}</h2>
      {children}
    </div>
  );
}

function Categories() {
  return (
    <section id="danhmuc" className="fh-container fh-section">
      <SectionHead title="Mua theo danh mục">
        <a href="#danhmuc" className="fh-link-sm">
          Xem tất cả
        </a>
      </SectionHead>
      <div className="fh-row">
        {CATEGORIES.map((c) => (
          <a key={c.name} href="#danhmuc" className="fh-cat">
            <div className="fh-cat__img" style={{ background: c.bg }}>
              <span className="fh-placeholder">[ẢNH DANH MỤC]</span>
            </div>
            <span className="fh-cat__name">{c.name}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

function ProductCard({ product, liked, onToggleLike }) {
  const { name, price, oldPrice, bg, badge, discount, colors } = product;
  return (
    <article className="fh-product">
      <div className="fh-product__img" style={{ background: bg }}>
        {badge === 'new' && <span className="fh-badge">MỚI</span>}
        {badge === 'sale' && <span className="fh-badge fh-badge--sale">{discount}</span>}
        <button
          type="button"
          className="fh-icon-btn fh-product__like"
          aria-label={liked ? 'Bỏ khỏi yêu thích' : 'Thêm vào yêu thích'}
          aria-pressed={liked}
          onClick={onToggleLike}
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill={liked ? '#111111' : 'none'} stroke="#111111" strokeWidth="1.6">
            <HeartPath />
          </svg>
        </button>
        <span className="fh-placeholder">[ẢNH SẢN PHẨM]</span>
      </div>
      <div className="fh-product__info">
        <span>{name}</span>
        {oldPrice ? (
          <span className="fh-product__prices">
            <span className="fh-price fh-price--sale">{price}</span>
            <span className="fh-price--old">{oldPrice}</span>
          </span>
        ) : (
          <span className="fh-price">{price}</span>
        )}
      </div>
      <div className="fh-swatches" role="list" aria-label="Màu có sẵn">
        {colors.map((c) => (
          <span key={c} role="listitem" className="fh-swatch" style={{ background: c }} />
        ))}
      </div>
    </article>
  );
}

function NewArrivals() {
  const trackRef = useRef(null);
  const [liked, setLiked] = useState(() => new Set());

  const scroll = (dir) => {
    const el = trackRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const toggleLike = (id) =>
    setLiked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

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
        {PRODUCTS.map((p) => (
          <ProductCard key={p.id} product={p} liked={liked.has(p.id)} onToggleLike={() => toggleLike(p.id)} />
        ))}
      </div>
    </section>
  );
}

function PromoBanner() {
  return (
    <section className="fh-container fh-section">
      <div className="fh-promo">
        <div className="fh-promo__media">
          <span className="fh-placeholder fh-placeholder--light">[ẢNH CHIẾN DỊCH — phụ kiện / túi xách]</span>
        </div>
        <div className="fh-promo__text">
          <p className="fh-eyebrow fh-eyebrow--light">Ưu đãi có hạn</p>
          <h2 className="fh-promo__title">Giảm đến [X]% cho phụ kiện</h2>
          <p className="fh-promo__desc">Áp dụng đến [NGÀY KẾT THÚC]. Không cộng dồn với ưu đãi khác.</p>
          <div>
            <a href="#moi" className="fh-btn fh-btn--light">
              MUA ƯU ĐÃI
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

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

function Newsletter() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: gọi API đăng ký nhận tin
    setDone(true);
    setEmail('');
  };

  return (
    <section className="fh-newsletter">
      <div className="fh-newsletter__inner">
        <h2 className="fh-h2">Nhận tin trước mọi người</h2>
        <p className="fh-newsletter__lead">Đăng ký để biết sớm bộ sưu tập mới và nhận ưu đãi [X]% cho đơn đầu tiên.</p>
        {done ? (
          <p role="status" className="fh-newsletter__ok">
            Cảm ơn bạn đã đăng ký!
          </p>
        ) : (
          <form className="fh-newsletter__form" onSubmit={handleSubmit}>
            <label htmlFor="fh-email" className="fh-sr-only">
              Địa chỉ email
            </label>
            <input id="fh-email" type="email" required placeholder="Email của bạn" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button type="submit">ĐĂNG KÝ</button>
          </form>
        )}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="fh-footer">
      <div className="fh-container fh-footer__inner">
        <div className="fh-footer__cols">
          <div className="fh-footer__brand">
            <div className="fh-footer__logo">{BRAND}</div>
            <p>
              [ĐỊA CHỈ CỬA HÀNG]
              <br />
              [SỐ ĐIỆN THOẠI] · [EMAIL]
            </p>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title} className="fh-footer__col">
              <div className="fh-footer__col-title">{col.title}</div>
              {col.links.map((l) => (
                <a key={l.label} href={l.href}>
                  {l.label}
                </a>
              ))}
            </nav>
          ))}
        </div>
        <div className="fh-footer__bottom">
          <span>© {new Date().getFullYear()} [{BRAND}]. Bảo lưu mọi quyền.</span>
          <span>Điều khoản · Chính sách bảo mật</span>
        </div>
      </div>
    </footer>
  );
}

/* ---------- Page ---------- */

export default function FashionHomePage() {
  return (
    <div className="fh-root">
      <AnnouncementBar />
      <Header cartCount={0} />
      <main>
        <Hero />
        <Categories />
        <NewArrivals />
        <PromoBanner />
        <Benefits />
        <Newsletter />
      </main>
      <Footer />
    </div>
  );
}
