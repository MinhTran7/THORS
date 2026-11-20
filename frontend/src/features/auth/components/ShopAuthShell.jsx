import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { ThorsLogo } from './ShopAuthArt';
import { FONT_URL } from 'features/shop/storeTheme';
import { AnnouncementBar } from 'layouts/StorefrontLayout';
import { useWebsiteSettings } from 'features/website/websiteSettings';
import './ShopAuthShell.css';

// Lời giới thiệu bên trái (cùng tông đỏ rượu với thanh thông báo và chân trang của trang bán hàng)
const STORY = {
  login: {
    eyebrow: 'Thành viên THORS',
    title: (
      <>
        Chào mừng bạn
        <br />
        quay lại <em>THORS</em>
      </>
    ),
    lead: 'Đăng nhập để tiếp tục mua sắm và theo dõi đơn hàng của bạn.'
  },
  register: {
    eyebrow: 'Tài khoản mới',
    title: (
      <>
        Mở tài khoản,
        <br />
        mua sắm <em>dễ hơn</em>
      </>
    ),
    lead: 'Đăng ký trong một phút để nhận đầy đủ quyền lợi thành viên THORS.'
  }
};

const PERKS = ['Theo dõi đơn hàng mọi lúc', 'Lưu sẵn địa chỉ giao hàng', 'Nhận ưu đãi dành riêng cho thành viên'];

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
 * KHUNG CHUNG cho mọi màn hình xác thực — cùng phong cách trang bán hàng
 * (nền kem, chữ đen, điểm nhấn đỏ rượu, nút vuông chữ in hoa, font Be Vietnam Pro).
 *   - variant 'login' / 'register': khối giới thiệu đỏ rượu bên trái, form bên phải (Đăng nhập, Đăng ký)
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
              <p className="shop-auth__eyebrow">{story.eyebrow}</p>
              <h2 className="shop-auth__headline">{story.title}</h2>
              <p className="shop-auth__lead">{story.lead}</p>
              <ul className="shop-auth__perks">
                {PERKS.map((perk) => (
                  <li key={perk}>{perk}</li>
                ))}
              </ul>
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
