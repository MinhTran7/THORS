import { Link, useNavigate } from 'react-router-dom';
import { Button, Divider, Typography } from '@mui/material';
import { AuthShell, FieldsForm, Field } from '../components/AuthForm';
import ChannelPicker, { useCapabilities } from '../components/ChannelPicker';
import { registerSchema } from '../validation';
import { post } from 'services/http';
export default function RegisterPage() {
  const navigate = useNavigate();
  const capabilities = useCapabilities();
  return (
    <AuthShell title="Tạo tài khoản" subtitle="Đăng ký tài khoản khách hàng để sử dụng THORS.">
      <FieldsForm
        initialValues={{ fullName: '', email: '', phone: '', password: '', confirmPassword: '', channel: 'EMAIL' }}
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
            <Field form={form} name="email" label="Email" type="email" autoComplete="email" />
            <Field form={form} name="phone" label="Số điện thoại" autoComplete="tel" />
            <Field form={form} name="password" label="Mật khẩu" type="password" autoComplete="new-password" />
            <Field form={form} name="confirmPassword" label="Xác nhận mật khẩu" type="password" autoComplete="new-password" />
            <ChannelPicker form={form} capabilities={capabilities} />
          </>
        )}
      </FieldsForm>
      <Divider>hoặc</Divider>
      <Button
        variant="outlined"
        size="large"
        disabled={!capabilities?.google}
        onClick={() => window.location.assign('/oauth2/authorization/google')}
      >
        Đăng ký bằng Google
      </Button>
      <Typography component={Link} to="/login" color="primary" sx={{ textAlign: 'center' }}>
        Đã có tài khoản? Đăng nhập
      </Typography>
    </AuthShell>
  );
}
