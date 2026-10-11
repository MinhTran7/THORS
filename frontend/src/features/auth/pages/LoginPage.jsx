import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Alert, Button, Divider, Stack, Typography } from '@mui/material';
import * as Yup from 'yup';
import { AuthShell, FieldsForm, Field } from '../components/AuthForm';
import ChannelPicker, { useCapabilities } from '../components/ChannelPicker';
import { useAuth } from '../AuthProvider';
import { identity, safeReturn } from '../validation';
import { post } from 'services/http';
import { useState } from 'react';
const googleMessages = {
  google_link_required: 'Email này đã có tài khoản THORS. Hãy đăng nhập bằng mật khẩu rồi liên kết Google trong hồ sơ.',
  google_email_mismatch: 'Email Google phải trùng email tài khoản THORS.',
  account_blocked: 'Tài khoản chưa kích hoạt, đã bị khóa hoặc vô hiệu hóa.',
  google_in_use: 'Google đã liên kết với tài khoản khác.',
  google_failed: 'Đăng nhập Google chưa thành công. Vui lòng thử lại.'
};
export default function LoginPage() {
  const capabilities = useCapabilities();
  const { setAccount } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState(null);
  const params = new URLSearchParams(location.search);
  const returnTo = safeReturn(params.get('returnTo'));
  async function login(values) {
    const result = await post('/auth/login', values);
    if (result.verificationRequired) {
      setPending({ ...values, emailAvailable: result.emailAvailable, smsAvailable: result.smsAvailable });
      sessionStorage.setItem('thorsReturnTo', returnTo);
      return;
    }
    setAccount(result.account);
    sessionStorage.removeItem('thorsReturnTo');
    navigate(returnTo, { replace: true });
  }
  return (
    <AuthShell
      title={pending ? 'Xác minh tài khoản' : 'Đăng nhập'}
      subtitle={pending ? 'Xác minh email hoặc số điện thoại trước khi sử dụng tài khoản.' : 'Chào mừng bạn đến với THORS.'}
    >
      {params.get('message') && <Alert severity="success">{params.get('message')}</Alert>}
      {params.get('error') && (
        <Alert severity="error">{googleMessages[params.get('error')] || 'Chưa thể đăng nhập Google. Vui lòng thử lại.'}</Alert>
      )}
      {pending ? (
        <>
          <FieldsForm
            initialValues={{ channel: pending.emailAvailable ? 'EMAIL' : 'SMS' }}
            onSubmit={async (v) => {
              await post('/auth/activation', { ...pending, channel: v.channel });
              navigate('/auth/verify');
            }}
            submitLabel="Gửi mã xác minh"
          >
            {(form) => (
              <ChannelPicker
                form={form}
                capabilities={{ email: pending.emailAvailable, sms: pending.smsAvailable }}
                smsAllowed={pending.smsAvailable}
              />
            )}
          </FieldsForm>
          <Button onClick={() => setPending(null)}>Quay lại đăng nhập</Button>
        </>
      ) : (
        <>
          <FieldsForm
            initialValues={{ identifier: '', password: '' }}
            schema={Yup.object({ identifier: identity, password: Yup.string().required('Nhập mật khẩu.') })}
            onSubmit={login}
            submitLabel="Đăng nhập"
          >
            {(form) => (
              <>
                <Field form={form} name="identifier" label="Email hoặc số điện thoại" autoComplete="username" />
                <Field form={form} name="password" label="Mật khẩu" type="password" autoComplete="current-password" />
                <Typography component={Link} to="/forgot-password" color="primary">
                  Quên mật khẩu?
                </Typography>
              </>
            )}
          </FieldsForm>
          <Divider>hoặc</Divider>
          <Button
            variant="outlined"
            size="large"
            disabled={!capabilities?.google}
            onClick={() => {
              sessionStorage.setItem('thorsReturnTo', returnTo);
              window.location.assign('/oauth2/authorization/google');
            }}
          >
            Đăng nhập bằng Google
          </Button>
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
            <Typography>Chưa có tài khoản?</Typography>
            <Typography component={Link} to="/register" color="primary">
              Đăng ký
            </Typography>
          </Stack>
        </>
      )}
    </AuthShell>
  );
}
