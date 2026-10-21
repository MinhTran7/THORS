import { Link } from 'react-router-dom';
import { Stack, Typography } from '@mui/material';
import shopping from 'assets/images/auth/boutique-shopping.png';
import welcome from 'assets/images/auth/boutique-welcome.png';
import './ShopAuthShell.css';

export default function ShopAuthShell({ variant = 'login', title, subtitle, children }) {
  const register = variant === 'register';
  return (
    <main className={`shop-auth shop-auth--${variant}`}>
      <section className="shop-auth__story" aria-label="THORS — Phong cách của bạn">
        {!register && <img className="shop-auth__hero" src={shopping} alt="Khách hàng chọn túi tại cửa hàng" />}
        <Link to="/" className="shop-auth__brand" aria-label="THORS — Trang chủ">
          THORS<span>YOUR STYLE. YOUR STORY.</span>
        </Link>
        <div className="shop-auth__story-copy">
          <span className="shop-auth__eyebrow">{register ? 'BẮT ĐẦU CÂU CHUYỆN CỦA BẠN' : 'PHONG CÁCH MỖI NGÀY'}</span>
          <h2>
            {register ? (
              <>
                Một tài khoản.
                <br />
                Nhiều trải nghiệm.
              </>
            ) : (
              <>
                Chào mừng bạn
                <br />
                trở lại.
              </>
            )}
          </h2>
          <p>
            {register
              ? 'Khám phá những lựa chọn mới và tìm thấy phong cách của riêng bạn cùng THORS.'
              : 'Những lựa chọn yêu thích đang chờ bạn. Tiếp tục câu chuyện phong cách cùng THORS.'}
          </p>
        </div>
        {register && (
          <div className="shop-auth__collage">
            <img className="shop-auth__photo-main" src={shopping} alt="Khám phá phụ kiện tại THORS" />
            <img className="shop-auth__photo-small" src={welcome} alt="Khách hàng nhận túi mua sắm tại cửa hàng" />
            <span className="shop-auth__stamp" aria-hidden="true">
              THORS
              <br />
              <small>MADE FOR YOU</small>
            </span>
          </div>
        )}
        <div className="shop-auth__story-footer">
          <span>THORS / EVERYDAY ESSENTIALS</span>
          <span aria-hidden="true">✦</span>
        </div>
      </section>
      <section className="shop-auth__panel" aria-labelledby="shop-auth-title">
        <div className="shop-auth__form">
          <span className="shop-auth__eyebrow">{register ? 'GIA NHẬP THORS' : 'TÀI KHOẢN THORS'}</span>
          <Stack spacing={2.5}>
            <div className="shop-auth__heading">
              <Typography component="h1" id="shop-auth-title">
                {title}
              </Typography>
              <Typography>{subtitle}</Typography>
            </div>
            {children}
          </Stack>
        </div>
        <p className="shop-auth__copyright">© {new Date().getFullYear()} THORS. Phong cách của riêng bạn.</p>
      </section>
    </main>
  );
}
