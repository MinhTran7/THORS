import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Box } from '@mui/material';
import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import ShopAuthArt, { ThorsLogo } from './ShopAuthArt';
import './ShopAuthShell.css';

const STORY = {
  login: {
    title: (
      <>
        Chào mừng bạn
        <br />
        đến với <em>THORS</em>
      </>
    ),
    lead: 'Hãy đăng nhập để cùng trải nghiệm nào!'
  },
  register: {
    title: (
      <>
        Mở tài khoản,
        <br />
        mở thêm <em>niềm vui</em>
      </>
    ),
    lead: 'Đăng ký ngay để trở thành người bạn của THORS nào!'
  }
};

// Kiểu 'card': một thẻ ở giữa màn hình, logo THORS ở góc trên trái (không có phần giới thiệu)
const CARD_SX = {
  '&&': { position: 'relative', gridTemplateColumns: 'minmax(0, 560px)', justifyContent: 'center' },
  '&& .shop-auth__card': { minHeight: { md: 540 }, display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  '&& .shop-auth__body': { gap: '28px', mt: '32px' },
  '&& form > .MuiStack-root > * + *': { mt: '16px' }
};
const CARD_BRAND_SX = {
  position: { xs: 'static', md: 'absolute' },
  top: '5vh',
  left: 'max(56px, (100vw - 1200px) / 2)',
  m: { xs: '32px 24px 0', md: 0 },
  justifySelf: 'start'
};

/**
 * KHUNG CHUNG cho mọi màn hình xác thực.
 *   - variant 'login' / 'register': giới thiệu bên trái, form bên phải (Đăng nhập, Đăng ký)
 *   - variant 'card'             : một thẻ giữa màn hình (Quên mật khẩu, Nhập OTP, Đặt lại mật khẩu,
 *                                  Hoàn tất Facebook, trang 404)
 */
export default function ShopAuthShell({ variant = 'login', title, subtitle, children }) {
  if (variant === 'card') {
    return (
      <Box component="main" className="shop-auth" sx={CARD_SX}>
        <Box component={Link} to="/" className="shop-auth__brand" aria-label="THORS — Trang chủ" sx={CARD_BRAND_SX}>
          <ThorsLogo />
          <span>THORS</span>
        </Box>
        <section className="shop-auth__panel" aria-labelledby="shop-auth-title">
          <div className="shop-auth__card">
            <h1 id="shop-auth-title">{title}</h1>
            {subtitle && <p className="shop-auth__subtitle">{subtitle}</p>}
            <div className="shop-auth__body">{children}</div>
          </div>
        </section>
      </Box>
    );
  }
  const story = STORY[variant];
  return (
    <main className="shop-auth">
      <section className="shop-auth__story">
        <Link to="/" className="shop-auth__brand" aria-label="THORS — Trang chủ">
          <ThorsLogo />
          <span>THORS</span>
        </Link>
        <div className="shop-auth__intro">
          <h2 className="shop-auth__headline">
            {story.title}
            <span className="shop-auth__hook">
              <ShopAuthArt />
            </span>
          </h2>
          <p className="shop-auth__lead">{story.lead}</p>
        </div>
      </section>

      <section className="shop-auth__panel" aria-labelledby="shop-auth-title">
        <div className="shop-auth__card">
          <h1 id="shop-auth-title">{title}</h1>
          <p className="shop-auth__subtitle">{subtitle}</p>
          <div className="shop-auth__body">{children}</div>
        </div>
      </section>
    </main>
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
