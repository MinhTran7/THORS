import { useState } from 'react';
import { Link } from 'react-router-dom';
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

// Khung chung cho trang Đăng nhập / Đăng ký: giới thiệu bên trái, form bên phải
export default function ShopAuthShell({ variant = 'login', title, subtitle, children }) {
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

// Ô nhập dùng với FieldsForm (Formik): chỉ báo lỗi sau khi bấm nút gửi
export function ShopField({ form, name, label, icon, type = 'text', hint, ...props }) {
  const [visible, setVisible] = useState(false);
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
