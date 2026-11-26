import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import ShopAuthArt, { ThorsLogo } from './ShopAuthArt';
import { FONT_URL } from 'features/shop/storeTheme';
import { AnnouncementBar } from 'layouts/StorefrontLayout';
import { useWebsiteSettings } from 'features/website/websiteSettings';
import './ShopAuthShell.css';

// Lời giới thiệu bên trái, trên nền kem (chữ nhấn đỏ rượu như trang bán hàng)
// Gọn như giao diện cũ: chỉ tiêu đề lớn + một câu ngắn (không thêm dòng nhỏ phía trên, không danh sách quyền lợi)
const STORY = {
  login: {
    title: (
      <>
        Chào mừng bạn
        <br />
        quay lại <em>THORS</em>
      </>
    ),
    lead: 'Đăng nhập để tiếp tục mua sắm cùng THORS.'
  },
  register: {
    title: (
      <>
        Mở tài khoản,
        <br />
        mua sắm <em>dễ hơn</em>
      </>
    ),
    lead: 'Đăng ký để trở thành thành viên THORS.'
  }
};

// Nạp font của trang bán hàng (Be Vietnam Pro + Playfair Display cho logo) nếu chưa có
function useStoreFonts() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_URL}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_URL;
    document.head.appendChild(link);
  }, []);
}

// Hình vẽ minh họa (không lấy dữ liệu): áo thun và túi mua sắm, tông đỏ rượu – kem của trang khách
const ShirtArt = () => (
  <svg viewBox="0 0 120 120" aria-hidden="true">
    <rect width="120" height="120" fill="#F3E3DF" />
    <path
      d="M42 28l-20 12 8 16 10-5v43h40V51l10 5 8-16-20-12c-3 7-10 11-18 11s-15-4-18-11z"
      fill="#8A2B2B"
      stroke="#6E1F1F"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M44 62h32M44 72h32M44 82h32" stroke="#F3E3DF" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
  </svg>
);

const BagArt = () => (
  <svg viewBox="0 0 120 120" aria-hidden="true">
    <rect width="120" height="120" fill="#EFEBE5" />
    <path d="M44 46V38a16 16 0 0 1 32 0v8" fill="none" stroke="#4A1717" strokeWidth="4" strokeLinecap="round" />
    <path d="M30 46h60l-5 50H35z" fill="#FFFFFF" stroke="#4A1717" strokeWidth="2.5" strokeLinejoin="round" />
    <text x="60" y="78" textAnchor="middle" fontFamily="'Playfair Display', Georgia, serif" fontSize="13" fill="#8A2B2B">
      THORS
    </text>
  </svg>
);

// Cụm hình bên trái: áo thun – thẻ treo THORS – túi mua sắm (khung polaroid nghiêng), toàn hình vẽ sẵn
function AuthShowcase() {
  return (
    <div className="shop-auth__showcase" aria-hidden="true">
      <figure className="shop-auth__photo shop-auth__photo--left">
        <ShirtArt />
      </figure>
      <ShopAuthArt />
      <figure className="shop-auth__photo shop-auth__photo--right">
        <BagArt />
      </figure>
    </div>
  );
}

// Thanh trên cùng giống header trang bán hàng: logo THORS bên trái, link quay lại cửa hàng bên phải
function AuthHeader() {
  return (
    <header className="shop-auth__header">
      <Link to="/" className="shop-auth__brand" aria-label="THORS — Trang chủ">
        <ThorsLogo size={34} />
        <span>THORS</span>
      </Link>
      <Link to="/" className="shop-auth__back">
        <span aria-hidden="true">←</span> Tiếp tục mua sắm
      </Link>
    </header>
  );
}

function AuthCard({ title, subtitle, children }) {
  return (
    <section className="shop-auth__panel" aria-labelledby="shop-auth-title">
      <div className="shop-auth__card">
        <h1 id="shop-auth-title">{title}</h1>
        {subtitle && <p className="shop-auth__subtitle">{subtitle}</p>}
        <div className="shop-auth__body">{children}</div>
      </div>
    </section>
  );
}

/**
 * KHUNG CHUNG cho mọi màn hình xác thực — bố cục cũ, màu của trang bán hàng
 * (nền kem, chữ đen, điểm nhấn đỏ rượu, ô và nút bo tròn, font Be Vietnam Pro).
 *   - variant 'login' / 'register': lời chào + hình thẻ treo bên trái, form bên phải (Đăng nhập, Đăng ký)
 *   - variant 'card'             : một thẻ giữa màn hình (Quên mật khẩu, Nhập OTP, Đặt lại mật khẩu,
 *                                  Hoàn tất Facebook, trang 404)
 */
export default function ShopAuthShell({ variant = 'login', title, subtitle, children }) {
  useStoreFonts();
  const website = useWebsiteSettings();
  const story = STORY[variant];

  return (
    <div className="shop-auth">
      <AnnouncementBar text={website.announcement} />
      <AuthHeader />
      {story ? (
        <main className="shop-auth__main">
          <section className="shop-auth__story">
            <div className="shop-auth__intro">
              <h2 className="shop-auth__headline">{story.title}</h2>
              <p className="shop-auth__lead">{story.lead}</p>
              {/* Áo thun – thẻ treo THORS (giao diện cũ, tô lại màu trang khách) – túi mua sắm */}
              <AuthShowcase />
            </div>
          </section>
          <AuthCard title={title} subtitle={subtitle}>
            {children}
          </AuthCard>
        </main>
      ) : (
        <main className="shop-auth__main shop-auth__main--card">
          <AuthCard title={title} subtitle={subtitle}>
            {children}
          </AuthCard>
        </main>
      )}
    </div>
  );
}

/**
 * Ô nhập dùng với FieldsForm (Formik) — màn hình đăng nhập dùng cho ô Email và ô Mật khẩu.
 *   - form : trạng thái Formik (FieldsForm truyền xuống) để lấy giá trị / lỗi của ô
 *   - name : tên trường trong form, vd 'identifier' hoặc 'password'
 *   - icon : biểu tượng bên trái ô; hint: chữ gợi ý dưới ô khi không có lỗi
 *   - type 'password': có nút con mắt để hiện / ẩn mật khẩu
 */
export function ShopField({ form, name, label, icon, type = 'text', hint, ...props }) {
  // visible: ô mật khẩu đang hiện chữ thật hay dấu chấm
  const [visible, setVisible] = useState(false);
  // Chỉ HIỆN lỗi sau khi đã bấm nút gửi ít nhất 1 lần (submitCount > 0), để không báo đỏ khi người dùng mới gõ dở.
  // Sau lần bấm đầu, lỗi cập nhật ngay mỗi khi sửa chữ trong ô.
  const error = form.submitCount > 0 && form.errors[name];
  const isPassword = type === 'password';

  return (
    <div className={`shop-field${error ? ' shop-field--error' : ''}`}>
      <label className="shop-field__label" htmlFor={name}>
        {label}
      </label>
      <div className="shop-field__box">
        {icon}
        <input
          id={name}
          name={name}
          type={isPassword && visible ? 'text' : type}
          value={form.values[name]}
          onChange={form.handleChange}
          onBlur={form.handleBlur}
          aria-invalid={Boolean(error)}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            className="shop-field__eye"
            aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          </button>
        )}
      </div>
      <p className="shop-field__hint">{error || hint}</p>
    </div>
  );
}
