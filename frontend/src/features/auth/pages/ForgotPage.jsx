import { Link, useNavigate } from 'react-router-dom';
import { Alert, Box } from '@mui/material';
import { MailOutlined } from '@ant-design/icons';
import * as Yup from 'yup';
import { ShopField } from '../components/ShopAuthShell';
import { ThorsLogo } from '../components/ShopAuthArt';
import { FieldsForm } from '../components/AuthForm';
import { identity } from '../validation';
import { post } from 'services/http';

export default function ForgotPage() {
  const navigate = useNavigate();

  async function sendCode(values) {
    await post('/auth/forgot-password', values);
    navigate('/auth/verify?reset=1');
  }

  return (
    <Box
      component="main"
      className="shop-auth"
      sx={{
        '&&': { position: 'relative', gridTemplateColumns: 'minmax(0, 560px)', justifyContent: 'center' },
        '&& .shop-auth__card': { minHeight: { md: 540 }, display: 'flex', flexDirection: 'column', justifyContent: 'center' },
        '&& .shop-auth__body': { gap: '28px', mt: '32px' },
        '&& form > .MuiStack-root > * + *': { mt: '16px' }
      }}
    >
      <Box
        component={Link}
        to="/"
        className="shop-auth__brand"
        aria-label="THORS — Trang chủ"
        sx={{
          position: { xs: 'static', md: 'absolute' },
          top: '5vh',
          left: 'max(56px, (100vw - 1200px) / 2)',
          m: { xs: '32px 24px 0', md: 0 },
          justifySelf: 'start'
        }}
      >
        <ThorsLogo />
        <span>THORS</span>
      </Box>

      <section className="shop-auth__panel">
        <div className="shop-auth__card">
          <h1>Quên mật khẩu</h1>
          <p className="shop-auth__subtitle">Nhận OTP qua email đã xác minh.</p>
          <div className="shop-auth__body">
            <FieldsForm
              initialValues={{ identifier: '' }}
              schema={Yup.object({ identifier: identity })}
              submitLabel="Gửi mã xác minh"
              onSubmit={sendCode}
            >
              {(form) => <ShopField form={form} name="identifier" label="Email" icon={<MailOutlined />} autoComplete="username" />}
            </FieldsForm>
            <Alert severity="info">
              Owner có thể liên hệ Admin nếu không còn truy cập được email. Admin liên hệ quản trị nội bộ để khôi phục.
            </Alert>
            <p className="shop-auth__switch">
              <Link to="/login">Quay lại đăng nhập</Link>
            </p>
          </div>
        </div>
      </section>
    </Box>
  );
}
