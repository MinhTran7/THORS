import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Typography } from '@mui/material';
import * as Yup from 'yup';
import { AuthShell, FieldsForm, Field } from '../components/AuthForm';
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
    <AuthShell
      title="Nhập mã xác minh"
      subtitle={
        context
          ? `Mã OTP đã gửi qua ${context.channel === 'EMAIL' ? 'email' : 'SMS'} đến ${context.destination}.`
          : 'Nếu tài khoản có kênh đã xác minh phù hợp, hệ thống sẽ gửi OTP.'
      }
    >
      {error && <Alert severity="error">{error}</Alert>}
      <Typography color="text.secondary">OTP gồm 6 chữ số, có hiệu lực 5 phút và tối đa 5 lần nhập sai.</Typography>
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
          <Field
            form={form}
            name="code"
            label="Mã OTP"
            autoComplete="one-time-code"
            slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6 } }}
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
      <Typography component={Link} to="/login" color="primary">
        Quay lại đăng nhập
      </Typography>
    </AuthShell>
  );
}
