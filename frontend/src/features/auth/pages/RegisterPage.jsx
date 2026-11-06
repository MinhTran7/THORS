import ShopAuthShell, { ShopField } from '../components/ShopAuthShell';
import { FacebookIcon, GoogleIcon } from '../components/ShopAuthArt';
import { LockOutlined, MailOutlined, SafetyOutlined, UserOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Divider } from '@mui/material';
import { FieldsForm } from '../components/AuthForm';
import { useCapabilities } from '../components/ChannelPicker';
import { registerSchema } from '../validation';
import { post } from 'services/http';
export default function RegisterPage() {
  const navigate = useNavigate();
  const capabilities = useCapabilities();
  return (
    <ShopAuthShell variant="register" title="Tạo tài khoản" subtitle="Chào bạn! Cùng bắt đầu hành trình với THORS.">
      <FieldsForm
        initialValues={{ fullName: '', identifier: '', password: '', confirmPassword: '' }}
        schema={registerSchema}
        submitLabel="Đăng ký và nhận OTP"
        onSubmit={async (v) => {
          await post('/auth/register', v);
          navigate('/auth/verify');
        }}
      >
        {(form) => (
          <>
            <ShopField form={form} name="fullName" label="Họ tên" icon={<UserOutlined />} autoComplete="name" />
            <ShopField form={form} name="identifier" label="Email" icon={<MailOutlined />} autoComplete="username" />
            <ShopField
              form={form}
              name="password"
              label="Mật khẩu"
              type="password"
              icon={<LockOutlined />}
              hint="Mật khẩu từ 10 ký tự. Bạn sẽ nhận mã OTP để xác minh email."
              autoComplete="new-password"
            />
            <ShopField
              form={form}
              name="confirmPassword"
              label="Xác nhận mật khẩu"
              type="password"
              icon={<SafetyOutlined />}
              autoComplete="new-password"
            />
          </>
        )}
      </FieldsForm>
      <Divider>hoặc đăng ký với</Divider>
      <div className="shop-auth__social-row">
        <Button
          variant="outlined"
          size="large"
          startIcon={<GoogleIcon />}
          disabled={!capabilities?.google}
          onClick={() => window.location.assign('/oauth2/authorization/google')}
        >
          Google
        </Button>
        <Button
          variant="outlined"
          size="large"
          startIcon={<FacebookIcon />}
          disabled={!capabilities?.facebook}
          onClick={() => {
            sessionStorage.setItem('thorsReturnTo', '/');
            window.location.assign('/oauth2/authorization/facebook');
          }}
        >
          Facebook
        </Button>
      </div>
      <p className="shop-auth__switch">
        Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
      </p>
    </ShopAuthShell>
  );
}
