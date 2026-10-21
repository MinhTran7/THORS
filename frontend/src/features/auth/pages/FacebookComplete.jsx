import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Typography } from '@mui/material';
import * as Yup from 'yup';
import { AuthShell, FieldsForm, Field } from '../components/AuthForm';
import { useAuth } from '../AuthProvider';
import { safeReturn } from '../validation';
import { api, post, clearCsrf } from 'services/http';

export default function FacebookComplete() {
  const [context, setContext] = useState(null);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const { setAccount } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    clearCsrf();
    setAccount(null);
    api('/auth/facebook/context').then((c) => {
      setContext(c);
      if (c.sent) setSeconds(c.resendSeconds);
    }).catch((e) => setError(e.message));
  }, [setAccount]);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <AuthShell title={context?.linking ? 'Xác minh liên kết Facebook' : 'Hoàn tất đăng ký Facebook'}
      subtitle="Xác minh email để hoàn tất. Những lần đăng nhập Facebook sau không cần OTP email lại.">
      {error && <Alert severity="error">{error}</Alert>}
      {context && !context.sent && (
        <FieldsForm initialValues={{ email: context.email }}
          schema={context.linking ? undefined : Yup.object({ email: Yup.string().trim().email('Email không hợp lệ.').max(100).required('Nhập email.') })}
          submitLabel="Gửi mã xác minh email"
          onSubmit={async (v) => {
            setError('');
            const c = await post('/auth/facebook/email', v);
            setContext({ ...context, ...c, sent: true });
            setSeconds(c.resendSeconds);
          }}>
          {(form) => context.linking
            ? <Alert severity="info">OTP sẽ gửi đến email của tài khoản THORS bạn vừa đăng nhập.</Alert>
            : <Field form={form} name="email" label="Email của bạn" autoComplete="email" />}
        </FieldsForm>
      )}
      {context?.sent && <>
        <Alert severity="info">Mã OTP đã gửi đến {context.destination}. Mã có hiệu lực 5 phút. Nhập sai 5 lần sẽ tạm khóa OTP 15 phút.</Alert>
        <FieldsForm initialValues={{ code: '' }}
          schema={Yup.object({ code: Yup.string().matches(/^[0-9]{6}$/, 'Nhập đúng 6 chữ số.').required('Nhập mã OTP.') })}
          submitLabel="Xác minh và vào THORS"
          onSubmit={async (v) => {
            const r = await post('/auth/facebook/verify', v);
            clearCsrf();
            setAccount(r.account);
            const target = safeReturn(sessionStorage.getItem('thorsReturnTo'));
            sessionStorage.removeItem('thorsReturnTo');
            navigate(target, { replace: true });
          }}>
          {(form) => <Field form={form} name="code" label="Mã OTP" autoComplete="one-time-code"
            slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6 } }} />}
        </FieldsForm>
        <Button disabled={busy || seconds > 0} onClick={async () => {
          setBusy(true); setError('');
          try {
            const c = await post('/auth/facebook/resend');
            setContext({ ...context, ...c }); setSeconds(c.resendSeconds);
          } catch (e) { setError(e.message); } finally { setBusy(false); }
        }}>{seconds > 0 ? `Gửi lại mã sau ${seconds}s` : 'Gửi lại mã'}</Button>
        {!context.linking && <Button onClick={() => setContext({ ...context, sent: false })}>Nhập email khác</Button>}
      </>}
      <Typography component={Link} to="/login" color="primary">Quay lại đăng nhập</Typography>
    </AuthShell>
  );
}
