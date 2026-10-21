import ShopAuthShell from '../components/ShopAuthShell';
import { GoogleOutlined, FacebookFilled } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Divider, Typography } from '@mui/material';
import { FieldsForm, Field } from '../components/AuthForm';
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
            <Field form={form} name="fullName" label="Họ tên" autoComplete="name" />
            <Field form={form} name="identifier" label="Email" autoComplete="username" />
            <Field form={form} name="password" label="Mật khẩu" type="password" autoComplete="new-password" />
            <p className="shop-auth__signup-note">Mật khẩu từ 10 ký tự. Bạn sẽ nhận mã OTP để xác minh email.</p>
            <Field form={form} name="confirmPassword" label="Xác nhận mật khẩu" type="password" autoComplete="new-password" />
          </>
        )}
      </FieldsForm>
      <Divider>hoặc đăng ký với</Divider>
      <div className="shop-auth__social-row">
        <Button
          variant="outlined"
          size="large"
          startIcon={<GoogleOutlined style={{ color: '#4285f4' }} />}
          disabled={!capabilities?.google}
          onClick={() => window.location.assign('/oauth2/authorization/google')}
        >
          Google
        </Button>
        <Button
          variant="outlined"
          size="large"
          startIcon={<FacebookFilled style={{ color: '#1877f2' }} />}
          disabled={!capabilities?.facebook}
          onClick={() => {
            sessionStorage.setItem('thorsReturnTo', '/');
            window.location.assign('/oauth2/authorization/facebook');
          }}
        >
          Facebook
        </Button>
      </div>
      <Typography component={Link} to="/login" color="primary" sx={{ textAlign: 'center' }}>
        Đã có tài khoản? Đăng nhập
      </Typography>
    </ShopAuthShell>
  );
}
