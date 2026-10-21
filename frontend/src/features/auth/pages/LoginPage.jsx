import ShopAuthShell from '../components/ShopAuthShell';
import { GoogleOutlined, FacebookFilled } from '@ant-design/icons';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Alert, Button, Divider, Stack, Typography } from '@mui/material';
import * as Yup from 'yup';
import { FieldsForm, Field } from '../components/AuthForm';
import { useCapabilities } from '../components/ChannelPicker';
import { useAuth } from '../AuthProvider';
import { identity, safeReturn } from '../validation';
import { post } from 'services/http';
import { useState } from 'react';
const googleMessages = {
  facebook_failed: 'Đăng nhập Facebook bị hủy hoặc chưa thành công. Vui lòng thử lại.',
  facebook_expired: 'Phiên Facebook đã hết hạn. Vui lòng thử lại.',
  facebook_in_use: 'Facebook đã liên kết tài khoản khác.',
  facebook_already_linked: 'Tài khoản THORS đã liên kết Facebook khác.',
  facebook_email_required: 'Hãy đăng nhập THORS và xác minh email trong hồ sơ trước.',
  link_expired: 'Phiên liên kết đã hết hiệu lực. Hãy đăng nhập lại.',
  facebook_link_required: 'Email đã có tài khoản THORS. Đăng nhập rồi liên kết Facebook trong hồ sơ.',
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
      setPending({ ...values, channel: result.channel, deliveryAvailable: result.deliveryAvailable });
      sessionStorage.setItem('thorsReturnTo', returnTo);
      return;
    }
    setAccount(result.account);
    sessionStorage.removeItem('thorsReturnTo');
    navigate(returnTo, { replace: true });
  }
  return (
    <ShopAuthShell
      title={pending ? 'Xác minh tài khoản' : 'Đăng nhập'}
      subtitle={pending ? 'Xác minh email trước khi sử dụng tài khoản.' : 'Đăng nhập để tiếp tục trải nghiệm mua sắm của bạn.'}
    >
      {params.get('message') && <Alert severity="success">{params.get('message')}</Alert>}
      {params.get('error') && (
        <Alert severity="error">{googleMessages[params.get('error')] || 'Chưa thể đăng nhập. Vui lòng thử lại.'}</Alert>
      )}
      {pending ? (
        <>
          <FieldsForm
            initialValues={{}}
            onSubmit={async () => {
              await post('/auth/activation', { identifier: pending.identifier, password: pending.password });
              navigate('/auth/verify');
            }}
            submitLabel="Gửi mã xác minh"
          >
            {() => (
              <Alert severity={pending.deliveryAvailable ? 'info' : 'warning'}>
                {pending.deliveryAvailable
                  ? `Mã xác minh sẽ gửi qua ${pending.channel === 'EMAIL' ? 'email' : 'SMS'} đến liên hệ bạn vừa nhập.`
                  : `Dịch vụ ${pending.channel === 'EMAIL' ? 'email OTP' : 'SMS'} chưa được cấu hình.`}
              </Alert>
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
                <Field form={form} name="identifier" label="Email" autoComplete="username" />
                <Field form={form} name="password" label="Mật khẩu" type="password" autoComplete="current-password" />
                <Typography component={Link} to="/forgot-password" color="primary" className="shop-auth__forgot">
                  Quên mật khẩu?
                </Typography>
              </>
            )}
          </FieldsForm>
          <Divider>hoặc</Divider>
          <Button
            variant="outlined"
            size="large"
            startIcon={<GoogleOutlined style={{ color: '#4285f4' }} />}
            disabled={!capabilities?.google}
            onClick={() => {
              sessionStorage.setItem('thorsReturnTo', returnTo);
              window.location.assign('/oauth2/authorization/google');
            }}
          >
            Đăng nhập bằng Google
          </Button>
          <Button
            variant="outlined"
            size="large"
            startIcon={<FacebookFilled style={{ color: '#1877f2' }} />}
            disabled={!capabilities?.facebook}
            onClick={() => {
              sessionStorage.setItem('thorsReturnTo', returnTo);
              window.location.assign('/oauth2/authorization/facebook');
            }}
          >
            Tiếp tục với Facebook
          </Button>
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
            <Typography>Chưa có tài khoản?</Typography>
            <Typography component={Link} to="/register" color="primary">
              Đăng ký
            </Typography>
          </Stack>
        </>
      )}
    </ShopAuthShell>
  );
}
