import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Typography } from '@mui/material';
import { SafetyOutlined } from '@ant-design/icons';
import * as Yup from 'yup';
import { FieldsForm } from '../components/AuthForm';
import ShopAuthShell, { ShopField } from '../components/ShopAuthShell';
import { api, post } from 'services/http';
import { useAuth } from '../AuthProvider';
import { safeReturn } from '../validation';
export default function VerifyPage() {
  const [context, setContext] = useState(null);
  const [seconds, setSeconds] = useState(60);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { reload } = useAuth();
  useEffect(() => {
    api('/auth/otp/context')
      .then((c) => {
        setContext(c);
        setSeconds(c.resendSeconds);
      })
      .catch((e) => {
        if (!new URLSearchParams(location.search).has('reset')) setError(e.message);
      });
  }, [location.search]);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <ShopAuthShell
      variant="card"
      title="Nhập mã xác minh"
      subtitle={
        context && context.context !== 'RESET'
          ? `Mã OTP đã gửi qua email đến ${context.destination}.`
          : 'Nếu tài khoản có kênh đã xác minh phù hợp, hệ thống sẽ gửi OTP.'
      }
    >
      {error && <Alert severity="error">{error}</Alert>}
      <Typography color="text.secondary">
        OTP gồm 6 chữ số, có hiệu lực 5 phút. Nhập sai 5 lần sẽ hủy mã và tạm dừng OTP 15 phút; sau đó cần gửi mã mới.
      </Typography>
      <FieldsForm
        initialValues={{ code: '' }}
        schema={Yup.object({
          code: Yup.string()
            .matches(/^[0-9]{6}$/, 'Nhập đúng 6 chữ số.')
            .required('Nhập mã OTP.')
        })}
        submitLabel="Xác minh"
        onSubmit={async (v) => {
          const result = await post('/auth/otp/verify', v);
          if (result.context === 'RESET') navigate('/auth/reset-password');
          else if (result.context === 'CONTACT') {
            await reload();
            navigate('/profile');
          } else {
            const target = safeReturn(sessionStorage.getItem('thorsReturnTo'));
            navigate(
              '/login?message=' +
                encodeURIComponent('Tài khoản đã được xác minh. Vui lòng đăng nhập.') +
                '&returnTo=' +
                encodeURIComponent(target)
            );
          }
        }}
      >
        {(form) => (
          <ShopField
            form={form}
            name="code"
            label="Mã OTP"
            icon={<SafetyOutlined />}
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
          />
        )}
      </FieldsForm>
      <Button
        disabled={seconds > 0 || busy || !context}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            const c = await post('/auth/otp/resend');
            setContext(c);
            setSeconds(c.resendSeconds);
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {seconds ? `Gửi lại mã sau ${seconds}s` : 'Gửi lại mã'}
      </Button>
      <p className="shop-auth__switch">
        <Link to="/login">Quay lại đăng nhập</Link>
      </p>
    </ShopAuthShell>
  );
}
